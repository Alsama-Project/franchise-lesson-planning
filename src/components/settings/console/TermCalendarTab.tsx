'use client';

// The admin "Term calendar" — a strict port of the approved Option B timeline.
// An editable academic-year band timeline (Sep → Aug), a popover for the selected
// term, and a read-only mirror table. Direct manipulation lives here (client);
// persistence is autosave-on-SETTLE via the term server actions — we mutate local
// state live for the mockup's feel but write to Supabase only when an interaction
// finishes (pointer-up after a move/resize, a stepper click, a debounced date edit),
// never on every pointermove. Writes are optimistic with revert + a small toast.
//
// Design system: teal #1F7A6C = tools/actions, cream/parchment surfaces = derived.
// Nothing here is teacher-curriculum content, so NO pink is used.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { cn } from '@/lib/cn';
import type { TermRow } from '@/lib/console';
import {
  createTerm,
  deleteTerm,
  updateTerm,
  type ConsoleResult,
} from '@/lib/actions/console';
import {
  academicYearOf,
  addDays,
  daysBetween,
  formatShortWeekdayDate,
  mondayOf,
  todayISO,
} from '@/lib/week';

const MIN_WEEKS = 1;
const MAX_WEEKS = 40;
const ROW_STEP = 52; // px between stacked bands
const BAND_TOP = 6; // px before the first band
const BAND_H = 40; // px band height
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type TermStatus = 'past' | 'current' | 'upcoming';

function clampWeeks(n: number): number {
  if (!Number.isFinite(n)) return MIN_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(n)));
}

/** First-of-month ISO for the k-th month of the axis (k = 0 → anchor September). */
function monthStartISO(anchorYear: number, k: number): string {
  const m0 = 8 + k; // 0-based month index counted from January of anchorYear
  const y = anchorYear + Math.floor(m0 / 12);
  const m = m0 % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Status of a term relative to today, from its [start, last-Friday] span. */
function statusOf(term: TermRow): TermStatus {
  const today = todayISO();
  const lastDay = addDays(term.startsOn, (term.numWeeks - 1) * 7 + 4); // Friday of last week
  if (today < term.startsOn) return 'upcoming';
  if (today > lastDay) return 'past';
  return 'current';
}

const STATUS_LABEL: Record<TermStatus, string> = {
  past: 'Past',
  current: 'Current term',
  upcoming: 'Upcoming',
};

interface DragState {
  mode: 'move' | 'resize';
  id: string;
  startX: number;
  origStart: string;
  origWeeks: number;
  trackWidth: number;
  totalDays: number;
  moved: boolean;
}

export function TermCalendarTab({ terms: initialTerms }: { terms: TermRow[] }) {
  // Local state is the live source for optimistic edits. Vertical stacking uses the
  // array index (stable) so a horizontal drag never reshuffles rows; the mirror
  // table sorts a copy by date for display.
  const [terms, setTerms] = useState<TermRow[]>(initialTerms);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [, startTransition] = useTransition();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const dateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if the server props change (e.g. after a refresh)
  // while we're not mid-interaction.
  useEffect(() => {
    if (!dragRef.current) setTerms(initialTerms);
  }, [initialTerms]);

  // Measure the track so px ⇄ fraction math (drag) and popover placement work.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-dismiss the error toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // The Sep-anchored 12-month axis year, derived from the earliest term.
  const anchorYear = useMemo(
    () =>
      terms.length
        ? Math.min(...terms.map((t) => academicYearOf(t.startsOn)))
        : academicYearOf(todayISO()),
    [terms],
  );
  const anchorISO = `${anchorYear}-09-01`;
  const axisEndISO = `${anchorYear + 1}-09-01`;
  const totalDays = useMemo(() => daysBetween(anchorISO, axisEndISO), [anchorISO, axisEndISO]);

  const pos = useCallback(
    (iso: string) => (totalDays > 0 ? daysBetween(anchorISO, iso) / totalDays : 0),
    [anchorISO, totalDays],
  );

  // Band geometry clamped to the timeline window [0, 1]. A term that runs past
  // either edge of the displayed academic year is kept inside the track bounds
  // and flagged so the band can show a "continues beyond range" cue instead of
  // spilling out and hard-clipping at the panel edge. This is purely visual —
  // the underlying start date / week count are untouched.
  const bandGeom = useCallback(
    (term: TermRow) => {
      const startFrac = pos(term.startsOn);
      const endFrac = pos(addDays(term.startsOn, term.numWeeks * 7));
      const leftFrac = Math.min(Math.max(startFrac, 0), 1);
      const rightFrac = Math.min(Math.max(endFrac, 0), 1);
      return {
        leftFrac,
        widthFrac: Math.max(rightFrac - leftFrac, 0),
        overflowLeft: startFrac < 0,
        overflowRight: endFrac > 1,
      };
    },
    [pos],
  );

  const selected = terms.find((t) => t.id === selectedId) ?? null;
  const trackHeight = Math.max(168, BAND_TOP * 2 + terms.length * ROW_STEP);

  // ── persistence helper: optimistic, revert + toast on failure ───────────────
  const persist = useCallback(
    (action: () => Promise<ConsoleResult>, revert: () => void) => {
      startTransition(async () => {
        const res = await action();
        if (!res.ok) {
          revert();
          setToast(res.error ?? 'Could not save. Please try again.');
        }
      });
    },
    [],
  );

  const patchLocal = useCallback((id: string, patch: Partial<TermRow>) => {
    setTerms((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // ── drag: move start / resize weeks ─────────────────────────────────────────
  function onBandPointerDown(e: ReactPointerEvent, term: TermRow, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    e.stopPropagation();
    const width = trackRef.current?.clientWidth ?? trackWidth;
    dragRef.current = {
      mode,
      id: term.id,
      startX: e.clientX,
      origStart: term.startsOn,
      origWeeks: term.numWeeks,
      trackWidth: width,
      totalDays,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBandPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || d.trackWidth <= 0) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    if (!d.moved) return;
    const dayDelta = Math.round((dx / d.trackWidth) * d.totalDays);
    if (d.mode === 'move') {
      const newStart = mondayOf(addDays(d.origStart, dayDelta));
      patchLocal(d.id, { startsOn: newStart });
    } else {
      const newWeeks = clampWeeks((d.origWeeks * 7 + dayDelta) / 7);
      patchLocal(d.id, { numWeeks: newWeeks });
    }
  }

  function onBandPointerUp(e: ReactPointerEvent, term: TermRow) {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
    if (!d) return;
    if (!d.moved) {
      // A click, not a drag → select.
      setSelectedId(term.id);
      return;
    }
    // Commit the settled value; revert to the pre-drag value on failure.
    if (d.mode === 'move') {
      const committed = mondayOf(term.startsOn);
      persist(
        () => updateTerm({ id: d.id, startsOn: committed }),
        () => patchLocal(d.id, { startsOn: d.origStart }),
      );
    } else {
      const committed = term.numWeeks;
      persist(
        () => updateTerm({ id: d.id, numWeeks: committed }),
        () => patchLocal(d.id, { numWeeks: d.origWeeks }),
      );
    }
  }

  // ── popover edits ───────────────────────────────────────────────────────────
  function changeWeeks(term: TermRow, delta: number) {
    const next = clampWeeks(term.numWeeks + delta);
    if (next === term.numWeeks) return;
    const prev = term.numWeeks;
    patchLocal(term.id, { numWeeks: next });
    persist(
      () => updateTerm({ id: term.id, numWeeks: next }),
      () => patchLocal(term.id, { numWeeks: prev }),
    );
  }

  function changeStart(term: TermRow, value: string) {
    if (!value) return;
    const snapped = mondayOf(value);
    const prev = term.startsOn;
    patchLocal(term.id, { startsOn: snapped });
    if (dateDebounce.current) clearTimeout(dateDebounce.current);
    dateDebounce.current = setTimeout(() => {
      persist(
        () => updateTerm({ id: term.id, startsOn: snapped }),
        () => patchLocal(term.id, { startsOn: prev }),
      );
    }, 400);
  }

  function changeName(term: TermRow, value: string) {
    patchLocal(term.id, { name: value });
  }

  function commitName(term: TermRow, prevName: string) {
    const name = term.name.trim() || 'New term';
    if (name === prevName) {
      if (name !== term.name) patchLocal(term.id, { name });
      return;
    }
    patchLocal(term.id, { name });
    persist(
      () => updateTerm({ id: term.id, name }),
      () => patchLocal(term.id, { name: prevName }),
    );
  }

  // ── add / remove ────────────────────────────────────────────────────────────
  function addTerm() {
    // Default to the Monday after the latest term's end, else the next Monday.
    let startsOn: string;
    if (terms.length) {
      const latest = terms.reduce((a, b) => (a.startsOn >= b.startsOn ? a : b));
      startsOn = mondayOf(addDays(latest.startsOn, latest.numWeeks * 7));
    } else {
      const thisMonday = mondayOf(todayISO());
      startsOn = thisMonday === todayISO() ? thisMonday : addDays(thisMonday, 7);
    }
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: TermRow = { id: tempId, name: 'New term', startsOn, numWeeks: 12 };
    setTerms((prev) => [...prev, optimistic]);
    setSelectedId(tempId);
    startTransition(async () => {
      const res = await createTerm({ name: 'New term', startsOn, numWeeks: 12 });
      if (!res.ok || !res.term) {
        setTerms((prev) => prev.filter((t) => t.id !== tempId));
        setSelectedId((cur) => (cur === tempId ? null : cur));
        setToast(res.error ?? 'Could not add the term.');
        return;
      }
      const real = res.term;
      setTerms((prev) => prev.map((t) => (t.id === tempId ? real : t)));
      setSelectedId((cur) => (cur === tempId ? real.id : cur));
    });
  }

  function removeTerm(term: TermRow) {
    setConfirmingDelete(false);
    const snapshot = terms;
    setTerms((prev) => prev.filter((t) => t.id !== term.id));
    setSelectedId((cur) => (cur === term.id ? null : cur));
    // A still-optimistic term (never persisted) just vanishes locally.
    if (term.id.startsWith('temp-')) return;
    persist(
      () => deleteTerm({ id: term.id }),
      () => setTerms(snapshot),
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────
  const sortedForTable = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  return (
    <div className="space-y-[18px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-[12px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#2A2422]">Term calendar</h2>
        <span className="rounded-full bg-[#EFE7DC] px-[10px] py-[3px] text-[12px] font-semibold text-[#7A7068]">
          {terms.length} {terms.length === 1 ? 'term' : 'terms'}
        </span>
        <span className="text-[12.5px] text-[#A79E94]">
          {anchorYear} / {String((anchorYear + 1) % 100).padStart(2, '0')} academic year
        </span>
        <button
          type="button"
          onClick={addTerm}
          className="ml-auto rounded-[9px] bg-[#1F7A6C] px-[14px] py-[8px] text-[13px] font-semibold text-white transition-colors hover:bg-[#1a6a5d]"
        >
          ＋ Add term
        </button>
      </div>

      {/* Timeline panel */}
      <div className="rounded-[14px] border border-[#ECE4D7] bg-[#FCFAF6] p-[16px]">
        {/* Month axis */}
        <div className="relative mb-[6px] h-[18px] select-none">
          {Array.from({ length: 12 }, (_, k) => {
            const left = pos(monthStartISO(anchorYear, k)) * 100;
            const m0 = (8 + k) % 12;
            const y = anchorYear + Math.floor((8 + k) / 12);
            const emphasised = k === 0 || m0 === 0; // September or January
            return (
              <div
                key={k}
                className={cn(
                  'absolute top-0 whitespace-nowrap text-[10.5px]',
                  emphasised ? 'font-semibold text-[#7A7068]' : 'text-[#B3A99C]',
                )}
                style={{ left: `${left}%` }}
              >
                {MONTHS_SHORT[m0]}
                {emphasised ? <span className="ml-[3px] text-[#B3A99C]">’{String(y % 100).padStart(2, '0')}</span> : null}
              </div>
            );
          })}
        </div>

        {/* Track with gridlines + bands */}
        <div
          ref={trackRef}
          className="relative"
          style={{ height: trackHeight }}
          onPointerDown={() => setSelectedId(null)}
        >
          {/* Gridlines */}
          {Array.from({ length: 12 }, (_, k) => {
            const left = pos(monthStartISO(anchorYear, k)) * 100;
            const m0 = (8 + k) % 12;
            const decJanBoundary = m0 === 0; // darker line at the Dec/Jan boundary
            return (
              <div
                key={k}
                className="absolute top-0 bottom-0 w-px"
                style={{
                  left: `${left}%`,
                  background: decJanBoundary ? '#DACFBE' : '#ECE4D7',
                }}
              />
            );
          })}

          {/* Bands */}
          {terms.map((term, i) => {
            const geom = bandGeom(term);
            const left = geom.leftFrac * 100;
            const width = Math.max(geom.widthFrac * 100, 2);
            const isSel = term.id === selectedId;
            const bandBg = isSel ? '#D9EEE8' : '#E4F0ED';
            const top = BAND_TOP + i * ROW_STEP;
            return (
              <div
                key={term.id}
                onPointerDown={(e) => onBandPointerDown(e, term, 'move')}
                onPointerMove={onBandPointerMove}
                onPointerUp={(e) => onBandPointerUp(e, term)}
                className={cn(
                  'group absolute flex items-center gap-[8px] overflow-hidden rounded-[9px] border px-[10px] text-[12px] touch-none',
                  isSel
                    ? 'z-20 border-[#1F7A6C] bg-[#D9EEE8] shadow-[0_4px_14px_rgba(31,122,108,0.18)]'
                    : 'z-10 border-[#BFDDD5] bg-[#E4F0ED]',
                )}
                style={{ left: `${left}%`, width: `${width}%`, top, height: BAND_H, cursor: 'grab' }}
              >
                <span className="rounded-[5px] bg-[#FCFAF6]/70 px-[5px] py-px text-[10px] font-bold text-[#15564B]">
                  W1
                </span>
                <span className="truncate font-semibold text-[#15564B]">{term.name}</span>
                <span className="ml-auto whitespace-nowrap text-[11px] text-[#5E8C84]">
                  {term.numWeeks} weeks
                </span>
                {/* Continues-beyond-range cue: the term runs past the start of the
                    displayed academic year. Fade + chevron, no hard clip. */}
                {geom.overflowLeft ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 flex w-[24px] items-center justify-start pl-[3px]"
                    style={{ background: `linear-gradient(to left, transparent, ${bandBg})` }}
                  >
                    <span className="text-[12px] font-bold text-[#15564B]/70">‹</span>
                  </div>
                ) : null}
                {/* Continues-beyond-range cue: the term extends past the end of the
                    displayed academic-year window. */}
                {geom.overflowRight ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 flex w-[24px] items-center justify-end pr-[3px]"
                    style={{ background: `linear-gradient(to right, transparent, ${bandBg})` }}
                  >
                    <span className="text-[12px] font-bold text-[#15564B]/70">›</span>
                  </div>
                ) : null}
                {/* Resize handle — hidden when the band is clamped at the right
                    edge, since its end isn't on screen to grab. */}
                {geom.overflowRight ? null : (
                  <div
                    onPointerDown={(e) => onBandPointerDown(e, term, 'resize')}
                    onPointerMove={onBandPointerMove}
                    onPointerUp={(e) => onBandPointerUp(e, term)}
                    className="absolute right-0 top-0 flex h-full w-[12px] items-center justify-center touch-none"
                    style={{ cursor: 'ew-resize' }}
                    aria-label="Resize term"
                  >
                    <span className="h-[16px] w-[2px] rounded-full bg-[#5E8C84]/60" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Selected-band popover */}
          {selected ? (
            <SelectedPopover
              term={selected}
              index={terms.findIndex((t) => t.id === selected.id)}
              leftFrac={bandGeom(selected).leftFrac}
              widthFrac={bandGeom(selected).widthFrac}
              trackRef={trackRef}
              onChangeName={changeName}
              onCommitName={commitName}
              onChangeStart={changeStart}
              onChangeWeeks={changeWeeks}
              onRemove={() => setConfirmingDelete(true)}
            />
          ) : null}
        </div>
      </div>

      {/* Mirror table */}
      <div className="overflow-hidden rounded-[14px] border border-[#ECE4D7]">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#FBF8F3] text-left text-[11px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
              <th className="px-[16px] py-[11px]">Term</th>
              <th className="px-[16px] py-[11px]">Week 1</th>
              <th className="px-[16px] py-[11px]">Last week</th>
              <th className="px-[16px] py-[11px]">Weeks</th>
            </tr>
          </thead>
          <tbody>
            {sortedForTable.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-[16px] py-[28px] text-center text-[13px] text-[#A79E94]">
                  No terms yet. Use “＋ Add term” to define the academic year.
                </td>
              </tr>
            ) : (
              sortedForTable.map((term) => {
                const status = statusOf(term);
                const lastWeek = addDays(term.startsOn, (term.numWeeks - 1) * 7);
                const isSel = term.id === selectedId;
                return (
                  <tr
                    key={term.id}
                    onClick={() => setSelectedId(term.id)}
                    className={cn(
                      'cursor-pointer border-t border-[#F0EAE1] transition-colors',
                      isSel ? 'bg-[#FCFAF6]' : 'hover:bg-[#FBF8F3]',
                    )}
                  >
                    <td className="px-[16px] py-[11px]">
                      <span className="font-semibold text-[#2A2422]">{term.name}</span>
                      <StatusChip status={status} />
                    </td>
                    <td className="px-[16px] py-[11px] text-[#5E5249]">
                      {formatShortWeekdayDate(term.startsOn)}
                    </td>
                    <td className="px-[16px] py-[11px] text-[#5E5249]">
                      {formatShortWeekdayDate(lastWeek)}
                    </td>
                    <td className="px-[16px] py-[11px] text-[#5E5249]">{term.numWeeks}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Remove confirm */}
      {confirmingDelete && selected ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#423B35]/45 p-4"
          onMouseDown={() => setConfirmingDelete(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[400px] rounded-[15px] border border-[#DCD2C4] bg-white p-[22px] shadow-card"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="mb-[10px] text-[16px] font-semibold text-[#2A2422]">Remove term</h3>
            <p className="mb-[18px] text-[13px] text-[#5E5249]">
              Remove <b className="font-semibold">{selected.name}</b> from the calendar? Weeks after it
              will shift back. This can’t be undone.
            </p>
            <div className="flex justify-end gap-[10px]">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-[9px] px-[14px] py-[8px] text-[13px] font-semibold text-[#7A7068] hover:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeTerm(selected)}
                className="rounded-[9px] bg-[#B23A2E] px-[14px] py-[8px] text-[13px] font-semibold text-white hover:bg-[#9c3227]"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Error toast */}
      {toast ? (
        <div className="fixed bottom-[20px] left-1/2 z-[120] -translate-x-1/2 rounded-[10px] bg-[#B23A2E] px-[16px] py-[10px] text-[13px] font-medium text-white shadow-card">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function StatusChip({ status }: { status: TermStatus }) {
  const styles: Record<TermStatus, string> = {
    past: 'bg-[#EFE9E1] text-[#9A8F82]',
    current: 'bg-[#D9EEE8] text-[#186155]',
    upcoming: 'bg-[#E7EEF7] text-[#3D6196]',
  };
  return (
    <span
      className={cn(
        'ml-[8px] inline-block rounded-full px-[8px] py-[2px] text-[10.5px] font-semibold',
        styles[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const POPOVER_WIDTH = 286;
const POPOVER_MARGIN = 8;

function SelectedPopover({
  term,
  index,
  leftFrac,
  widthFrac,
  trackRef,
  onChangeName,
  onCommitName,
  onChangeStart,
  onChangeWeeks,
  onRemove,
}: {
  term: TermRow;
  index: number;
  leftFrac: number;
  widthFrac: number;
  trackRef: RefObject<HTMLDivElement | null>;
  onChangeName: (term: TermRow, value: string) => void;
  onCommitName: (term: TermRow, prevName: string) => void;
  onChangeStart: (term: TermRow, value: string) => void;
  onChangeWeeks: (term: TermRow, delta: number) => void;
  onRemove: () => void;
}) {
  const nameAtFocus = useRef(term.name);
  const popRef = useRef<HTMLDivElement | null>(null);
  // Fixed viewport coordinates, computed from the live position of the band this
  // popover edits. Anchored to the band, flipped above it when there's no room
  // below, and shifted to stay fully inside the viewport. Null until measured so
  // the first paint doesn't flash at the origin.
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const pop = popRef.current;
    if (!track || !pop) return;

    const reposition = () => {
      const tr = track.getBoundingClientRect();
      const popH = pop.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const bandLeft = tr.left + leftFrac * tr.width;
      const bandTop = tr.top + BAND_TOP + index * ROW_STEP;
      const bandBottom = bandTop + BAND_H;

      // Horizontal: anchor to the band's left edge, then shift to stay on screen.
      let left = bandLeft;
      left = Math.min(left, vw - POPOVER_WIDTH - POPOVER_MARGIN);
      left = Math.max(left, POPOVER_MARGIN);

      // Vertical: below the band by default; flip above if it would overflow the
      // bottom of the viewport and there's room above.
      let top = bandBottom + POPOVER_MARGIN;
      if (top + popH > vh - POPOVER_MARGIN) {
        const above = bandTop - POPOVER_MARGIN - popH;
        top = above >= POPOVER_MARGIN ? above : Math.max(POPOVER_MARGIN, vh - POPOVER_MARGIN - popH);
      }

      setPlace({ left, top });
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [index, leftFrac, widthFrac, trackRef, term.numWeeks, term.startsOn]);

  return (
    <div
      ref={popRef}
      className="fixed z-30 rounded-[12px] border border-[#E2D9CC] bg-white p-[14px] shadow-[0_8px_24px_rgba(48,40,32,0.14)]"
      style={{
        top: place?.top ?? 0,
        left: place?.left ?? 0,
        width: POPOVER_WIDTH,
        visibility: place ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        value={term.name}
        onChange={(e) => onChangeName(term, e.target.value)}
        onFocus={() => {
          nameAtFocus.current = term.name;
        }}
        onBlur={() => onCommitName(term, nameAtFocus.current)}
        className="mb-[12px] w-full rounded-[8px] border border-[#E2D9CC] px-[10px] py-[7px] text-[13px] font-semibold text-[#2A2422] outline-none focus:border-[#1F7A6C]"
        placeholder="Term name"
      />

      <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
        Start (Monday)
      </label>
      <input
        type="date"
        value={term.startsOn}
        onChange={(e) => onChangeStart(term, e.target.value)}
        className="mb-[12px] w-full rounded-[8px] border border-[#E2D9CC] px-[10px] py-[7px] text-[13px] text-[#2A2422] outline-none focus:border-[#1F7A6C]"
      />

      <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
        Weeks
      </label>
      <div className="mb-[12px] flex items-center gap-[10px]">
        <button
          type="button"
          onClick={() => onChangeWeeks(term, -1)}
          disabled={term.numWeeks <= MIN_WEEKS}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#E2D9CC] text-[16px] text-[#5E5249] hover:bg-[#FBF8F3] disabled:opacity-40"
          aria-label="One fewer week"
        >
          −
        </button>
        <span className="min-w-[28px] text-center text-[15px] font-semibold text-[#2A2422]">
          {term.numWeeks}
        </span>
        <button
          type="button"
          onClick={() => onChangeWeeks(term, 1)}
          disabled={term.numWeeks >= MAX_WEEKS}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#E2D9CC] text-[16px] text-[#5E5249] hover:bg-[#FBF8F3] disabled:opacity-40"
          aria-label="One more week"
        >
          ＋
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-[#F0EAE1] pt-[10px]">
        <span className="text-[11.5px] text-[#7A7068]">
          Week 1 · w/c <b className="font-semibold text-[#2A2422]">{formatShortWeekdayDate(term.startsOn)}</b>
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[11.5px] font-semibold text-[#B23A2E] hover:opacity-70"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
