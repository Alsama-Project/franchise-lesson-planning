'use client';

// The admin "Term calendar" — school + year scoping (Claude Design "Option B" port).
// A single-screen Sept→Aug band timeline: each term carries a SET OF CENTRES and a
// SET OF CURRICULUM YEARS. Drag a band to move it (snaps to Monday), drag its right
// edge to resize 1–40 weeks, click it to open the scope popover (centres + years).
// A term with zero centres OR zero years produces no teaching weeks — surfaced with
// the app's non-destructive amber (status-progress) caution, never delete-red.
//
// Direct manipulation is client-side + optimistic; persistence is autosave-on-settle
// via the term server actions — drag/resize write once on pointer-up (never per
// pointermove), scope toggles write immediately. Writes revert with a toast on
// failure. The anchor academic year is DERIVED from the earliest term (never a
// hardcoded calendar year). No dnd-kit — hand-rolled pointer events, as before.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { CentreRow, TermRow } from '@/lib/console';
import { createTerm, deleteTerm, updateTerm, type ConsoleResult } from '@/lib/actions/console';
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
const ROW_STEP = 54; // px between stacked lanes
const BAND_TOP = 4; // px before the first lane
const BAND_H = 46; // px band height
// Month columns in academic (Sept-first) order, as short labels.
const MONTH_COLS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
const YEAR_CHIPS = [0, 1, 2, 3, 4, 5, 6];
const Y1_6 = [1, 2, 3, 4, 5, 6];

function clampWeeks(n: number): number {
  if (!Number.isFinite(n)) return MIN_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(n)));
}

// ── Sept-anchored fractional geometry (0 = 1 Sep … 1 = 31 Aug) ─────────────────
// Month-proportional: each month is 1/12 of the track, matching the equal 12-column
// month header/gridlines. `dateToFrac` is anchor-independent (any Sept→Aug maps to
// 0→1); `fracToDate` needs the anchor year to place Jan–Aug in the following year.

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** ISO `YYYY-MM-DD` → its position in the Sept-anchored academic year, 0..1. */
function dateToFrac(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const monthIndex = m - 1;
  const monthsFromSep = (monthIndex - 8 + 12) % 12;
  const dim = daysInMonth(y, monthIndex);
  return (monthsFromSep + (d - 1) / dim) / 12;
}

/** Fractional position 0..1 → ISO date in the anchor academic year. */
function fracToDate(frac: number, anchorYear: number): string {
  const f = Math.max(0, Math.min(0.9999, frac));
  const f12 = f * 12;
  const mi = Math.floor(f12);
  const rem = f12 - mi;
  const monthIndex = (8 + mi) % 12;
  const year = anchorYear + (mi >= 4 ? 1 : 0); // Jan (monthsFromSep=4) onward is next year
  const dim = daysInMonth(year, monthIndex);
  const day = Math.min(dim, Math.floor(rem * dim) + 1);
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** [start, endExclusive) Monday range of a term, as ISO strings. */
function termRange(term: TermRow): { start: string; end: string } {
  const start = mondayOf(term.startsOn);
  return { start, end: addDays(start, term.numWeeks * 7) };
}

/** True when two terms' Monday ranges overlap in date. */
function datesOverlap(a: TermRow, b: TermRow): boolean {
  const ra = termRange(a);
  const rb = termRange(b);
  return ra.start < rb.end && rb.start < ra.end; // ISO strings order lexically
}

/**
 * Lane-pack terms so overlapping bands stack instead of colliding. Greedy by start
 * date: place each term in the first lane whose last band has already ended.
 */
function packLanes(terms: TermRow[]): { laneOf: Map<string, number>; laneCount: number } {
  const spans = terms
    .map((t) => ({ id: t.id, ...termRange(t) }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const laneEnds: string[] = [];
  const laneOf = new Map<string, number>();
  for (const s of spans) {
    let lane = laneEnds.findIndex((end) => end <= s.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(s.end);
    } else {
      laneEnds[lane] = s.end;
    }
    laneOf.set(s.id, lane);
  }
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

interface DragState {
  mode: 'move' | 'resize';
  id: string;
  grab: number; // pointer-frac minus band-start-frac at grab time
  origStart: string;
  origWeeks: number;
  moved: boolean;
}

export function TermCalendarTab({
  terms: initialTerms,
  centres,
}: {
  terms: TermRow[];
  centres: CentreRow[];
}) {
  const t = useTranslations('settings');
  const locale = useLocale();

  const [terms, setTerms] = useState<TermRow[]>(initialTerms);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Only non-archived centres are assignable scope; ordered by the console's order.
  const activeCentres = useMemo(() => centres.filter((c) => !c.archivedAt), [centres]);

  // Sync from the server props when they change and we're not mid-drag.
  useEffect(() => {
    if (!dragRef.current) setTerms(initialTerms);
  }, [initialTerms]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Anchor academic year: the earliest term's, else the current one. Never hardcoded.
  const anchorYear = useMemo(
    () =>
      terms.length
        ? Math.min(...terms.map((term) => academicYearOf(term.startsOn)))
        : academicYearOf(todayISO()),
    [terms],
  );

  const { laneOf, laneCount } = useMemo(() => packLanes(terms), [terms]);
  const trackHeight = Math.max(BAND_H + BAND_TOP * 2, BAND_TOP * 2 + laneCount * ROW_STEP);

  const num = useCallback((n: number) => formatNumber(n, locale), [locale]);

  // ── scope labels ─────────────────────────────────────────────────────────────
  const schoolsLabel = useCallback(
    (ids: string[]): string => {
      if (ids.length === 0) return t('termCalendar.scope.noCentres');
      if (activeCentres.length > 0 && ids.length >= activeCentres.length)
        return t('termCalendar.scope.allCentres');
      const ordered = activeCentres.filter((c) => ids.includes(c.id));
      const first = ordered[0]?.name ?? '';
      return ids.length > 1 ? t('termCalendar.scope.centrePlus', { first, count: ids.length - 1 }) : first;
    },
    [activeCentres, t],
  );

  const yearsLabel = useCallback(
    (years: number[]): string => {
      const sorted = [...new Set(years)].sort((a, b) => a - b);
      if (sorted.length === 0) return t('termCalendar.scope.noYears');
      const parts: string[] = [];
      let i = 0;
      while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
        parts.push(i === j ? `Y${num(sorted[i])}` : `Y${num(sorted[i])}–Y${num(sorted[j])}`);
        i = j + 1;
      }
      return parts.join(', ');
    },
    [num, t],
  );

  // A term whose (school, year) scope overlaps this term on overlapping dates. The
  // DB has no constraint against it (it silently corrupts week_no), so the UI warns.
  const conflictFor = useCallback(
    (term: TermRow): { name: string; scope: string } | null => {
      if (term.schoolIds.length === 0 || term.years.length === 0) return null;
      for (const other of terms) {
        if (other.id === term.id) continue;
        if (!datesOverlap(term, other)) continue;
        const sharedSchools = other.schoolIds.filter((s) => term.schoolIds.includes(s));
        const sharedYears = other.years.filter((y) => term.years.includes(y));
        if (sharedSchools.length > 0 && sharedYears.length > 0) {
          return { name: other.name, scope: `${schoolsLabel(sharedSchools)} · ${yearsLabel(sharedYears)}` };
        }
      }
      return null;
    },
    [terms, schoolsLabel, yearsLabel],
  );

  // ── persistence: optimistic, revert + toast on failure ───────────────────────
  const persist = useCallback((action: () => Promise<ConsoleResult>, revert: () => void) => {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        revert();
        setToast(res.error ?? t('termCalendar.saveError'));
      }
    });
  }, [t]);

  const patchLocal = useCallback((id: string, patch: Partial<TermRow>) => {
    setTerms((prev) => prev.map((term) => (term.id === id ? { ...term, ...patch } : term)));
  }, []);

  // ── drag: move start / resize weeks ──────────────────────────────────────────
  const pointerFrac = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
  }, []);

  function onBandPointerDown(e: ReactPointerEvent, term: TermRow, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startFrac = dateToFrac(mondayOf(term.startsOn));
    dragRef.current = {
      mode,
      id: term.id,
      grab: pointerFrac(e.clientX) - startFrac,
      origStart: term.startsOn,
      origWeeks: term.numWeeks,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBandPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const pf = pointerFrac(e.clientX);
    if (!d.moved && Math.abs(pf - (d.grab + dateToFrac(mondayOf(d.origStart)))) < 0.004) return;
    d.moved = true;
    if (d.mode === 'move') {
      const nextStart = mondayOf(fracToDate(pf - d.grab, anchorYear));
      patchLocal(d.id, { startsOn: nextStart });
    } else {
      const startMon = mondayOf(d.origStart);
      const weeks = clampWeeks(daysBetween(startMon, fracToDate(pf, anchorYear)) / 7);
      patchLocal(d.id, { numWeeks: weeks });
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
      setSelectedId((cur) => (cur === term.id ? null : term.id));
      return;
    }
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

  // ── scope edits (persist immediately) ────────────────────────────────────────
  function setSchools(term: TermRow, schoolIds: string[]) {
    const prev = term.schoolIds;
    patchLocal(term.id, { schoolIds });
    persist(
      () => updateTerm({ id: term.id, schoolIds }),
      () => patchLocal(term.id, { schoolIds: prev }),
    );
  }
  function toggleSchool(term: TermRow, schoolId: string) {
    const next = term.schoolIds.includes(schoolId)
      ? term.schoolIds.filter((s) => s !== schoolId)
      : [...term.schoolIds, schoolId];
    setSchools(term, next);
  }
  function setYears(term: TermRow, years: number[]) {
    const prev = term.years;
    const next = [...new Set(years)].sort((a, b) => a - b);
    patchLocal(term.id, { years: next });
    persist(
      () => updateTerm({ id: term.id, years: next }),
      () => patchLocal(term.id, { years: prev }),
    );
  }
  function toggleYear(term: TermRow, year: number) {
    const next = term.years.includes(year)
      ? term.years.filter((y) => y !== year)
      : [...term.years, year];
    setYears(term, next);
  }
  function renameTerm(term: TermRow, value: string) {
    patchLocal(term.id, { name: value });
  }
  function commitName(term: TermRow, prevName: string) {
    const name = term.name.trim() || t('termCalendar.newTermName');
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

  // ── add / remove ─────────────────────────────────────────────────────────────
  function firstMondayOfSeptember(year: number): string {
    const sep1 = `${year}-09-01`;
    const m = mondayOf(sep1);
    return m < sep1 ? addDays(m, 7) : m;
  }

  function addTerm() {
    // Default start: the Monday after the latest term's end, else the first Monday
    // of September in the anchor year. New terms are born with EMPTY scope so the
    // amber warning forces an explicit centre/year choice (no silent over-grant).
    let startsOn: string;
    if (terms.length) {
      const latest = terms.reduce((a, b) => (a.startsOn >= b.startsOn ? a : b));
      startsOn = mondayOf(addDays(latest.startsOn, latest.numWeeks * 7));
    } else {
      startsOn = firstMondayOfSeptember(anchorYear);
    }
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: TermRow = {
      id: tempId,
      name: t('termCalendar.newTermName'),
      startsOn,
      numWeeks: 12,
      schoolIds: [],
      years: [],
    };
    setTerms((prev) => [...prev, optimistic]);
    setSelectedId(tempId);
    startTransition(async () => {
      const res = await createTerm({
        name: t('termCalendar.newTermName'),
        startsOn,
        numWeeks: 12,
        schoolIds: [],
        years: [],
      });
      if (!res.ok || !res.term) {
        setTerms((prev) => prev.filter((term) => term.id !== tempId));
        setSelectedId((cur) => (cur === tempId ? null : cur));
        setToast(res.error ?? t('termCalendar.addError'));
        return;
      }
      const real = res.term;
      setTerms((prev) => prev.map((term) => (term.id === tempId ? real : term)));
      setSelectedId((cur) => (cur === tempId ? real.id : cur));
    });
  }

  function removeTerm(term: TermRow) {
    const snapshot = terms;
    setTerms((prev) => prev.filter((x) => x.id !== term.id));
    setSelectedId((cur) => (cur === term.id ? null : cur));
    if (term.id.startsWith('temp-')) return;
    persist(
      () => deleteTerm({ id: term.id }),
      () => setTerms(snapshot),
    );
  }

  const academicLabel = t('termCalendar.academicYear', {
    start: num(anchorYear),
    end: String((anchorYear + 1) % 100).padStart(2, '0'),
  });

  return (
    <div className="space-y-[18px]">
      {/* Heading row */}
      <div className="flex flex-wrap items-center gap-[12px]">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#2A2422]">
          {t('termCalendar.title')}
        </h2>
        <span className="rounded-full bg-[#F3ECE2] px-[10px] py-[3px] text-[12px] font-semibold text-[#A79E94]">
          {t('termCalendar.termsCount', { count: terms.length })}
        </span>
        <button
          type="button"
          onClick={addTerm}
          className="ml-auto inline-flex items-center gap-[6px] rounded-[9px] bg-teal px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#1a6a5d]"
        >
          <span className="text-[15px] leading-none">＋</span> {t('termCalendar.addTerm')}
        </button>
      </div>
      <div className="text-[12.5px] text-[#9A9087]">{academicLabel}</div>

      {/* Timeline card */}
      <div className="rounded-[14px] border border-[#ECE4D7] bg-[#FCFAF6] px-[20px] pb-[22px] pt-[18px]">
        {/* Month header — equal 12-column Sept→Aug axis, kept LTR even in RTL */}
        <div dir="ltr" className="mb-[4px] grid grid-cols-12 border-b border-[#E7DECF] pb-[9px]">
          {MONTH_COLS.map((m, i) => (
            <div
              key={m}
              className={cn(
                'text-[11px] font-semibold',
                i === 0 || i === 4 ? 'text-[#2A2520]' : 'text-[#8A8178]',
              )}
            >
              {m}
              {i === 0 ? <span className="font-medium text-[#B7AEA3]"> &rsquo;{String(anchorYear % 100).padStart(2, '0')}</span> : null}
              {i === 4 ? <span className="font-medium text-[#B7AEA3]"> &rsquo;{String((anchorYear + 1) % 100).padStart(2, '0')}</span> : null}
            </div>
          ))}
        </div>

        {/* Track */}
        <div dir="ltr" ref={trackRef} className="relative" style={{ height: trackHeight }} onPointerDown={() => setSelectedId(null)}>
          {/* Gridlines */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-12">
            {MONTH_COLS.map((m, i) => (
              <div key={m} style={{ borderLeft: `1px solid ${i === 4 ? '#ECE0CE' : '#F0E9DE'}` }} />
            ))}
          </div>

          {terms.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center px-[24px] text-center">
              <p className="max-w-[520px] text-[12.5px] leading-[1.6] text-[#9A9087]">
                {t('termCalendar.empty.hint')}
              </p>
            </div>
          ) : (
            terms.map((term) => {
              const startMon = mondayOf(term.startsOn);
              const lastMon = addDays(startMon, (term.numWeeks - 1) * 7);
              const end = addDays(startMon, term.numWeeks * 7);
              const leftFrac = Math.max(0, Math.min(1, dateToFrac(startMon)));
              const rightFrac = Math.max(0, Math.min(1, dateToFrac(end)));
              const left = leftFrac * 100;
              const width = Math.max(6, (rightFrac - leftFrac) * 100);
              const isSel = term.id === selectedId;
              const conflict = conflictFor(term);
              const scopeLine = `${schoolsLabel(term.schoolIds)} · ${yearsLabel(term.years)}`;
              const range = t('termCalendar.range', {
                start: formatShortWeekdayDate(startMon),
                end: formatShortWeekdayDate(lastMon),
              });
              const noCentres = term.schoolIds.length === 0;
              const noYears = term.years.length === 0;
              const valid = !noCentres && !noYears && !conflict;

              return (
                <div
                  key={term.id}
                  onPointerDown={(e) => onBandPointerDown(e, term, 'move')}
                  onPointerMove={onBandPointerMove}
                  onPointerUp={(e) => onBandPointerUp(e, term)}
                  className={cn(
                    'group absolute flex touch-none items-center gap-[8px] rounded-[10px] px-[8px] pl-[11px]',
                    isSel
                      ? 'z-40 border-[1.5px] border-teal bg-[#D2E9E2] shadow-[0_6px_18px_-8px_rgba(31,122,108,0.5)]'
                      : 'z-10 border-[1.5px] border-[#BFDDD5] bg-[#E4F0ED]',
                  )}
                  style={{ left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%`, top: (laneOf.get(term.id) ?? 0) * ROW_STEP + BAND_TOP, height: BAND_H, cursor: 'grab' }}
                >
                  <span className="flex-none text-[9.5px] font-bold text-[#4E9085]">W1</span>
                  <div className="min-w-0 flex-1" dir="auto">
                    <div className="truncate text-[12.5px] font-semibold text-[#15564B]">{term.name}</div>
                    <div className="truncate text-[10.5px] font-medium text-[#5E8C84]">{scopeLine}</div>
                  </div>
                  {/* Resize handle */}
                  <span
                    onPointerDown={(e) => onBandPointerDown(e, term, 'resize')}
                    onPointerMove={onBandPointerMove}
                    onPointerUp={(e) => onBandPointerUp(e, term)}
                    className="flex h-[30px] w-[14px] flex-none items-center justify-center rounded-[6px] border-[1.5px] border-[#BFDDD5] bg-white"
                    style={{ cursor: 'ew-resize' }}
                    aria-label={t('termCalendar.resizeAria')}
                  >
                    <span className="h-[14px] w-[2px] rounded-[2px] bg-[#9ACABE]" />
                  </span>
                  <span className="flex-none text-[9.5px] font-bold text-[#4E9085]">W{num(term.numWeeks)}</span>

                  {isSel ? (
                    <ScopePopover
                      term={term}
                      left={left}
                      range={range}
                      centres={activeCentres}
                      valid={valid}
                      summary={
                        valid
                          ? t('termCalendar.validity.valid', {
                              weeks: num(term.numWeeks),
                              schools: schoolsLabel(term.schoolIds),
                              years: yearsLabel(term.years),
                            })
                          : noCentres
                            ? t('termCalendar.validity.noCentres')
                            : noYears
                              ? t('termCalendar.validity.noYears')
                              : t('termCalendar.validity.overlap', {
                                  term: conflict?.name ?? '',
                                  scope: conflict?.scope ?? '',
                                })
                      }
                      onClose={() => setSelectedId(null)}
                      onRename={(v) => renameTerm(term, v)}
                      onCommitName={(prevName) => commitName(term, prevName)}
                      onSetSchools={(ids) => setSchools(term, ids)}
                      onToggleSchool={(id) => toggleSchool(term, id)}
                      onSetYears={(ys) => setYears(term, ys)}
                      onToggleYear={(y) => toggleYear(term, y)}
                      onRemove={() => removeTerm(term)}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Error toast */}
      {toast ? (
        <div className="fixed bottom-[20px] left-1/2 z-[120] -translate-x-1/2 rounded-[10px] bg-danger px-[16px] py-[10px] text-[13px] font-medium text-white shadow-card">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ScopePopover({
  term,
  left,
  range,
  centres,
  valid,
  summary,
  onClose,
  onRename,
  onCommitName,
  onSetSchools,
  onToggleSchool,
  onSetYears,
  onToggleYear,
  onRemove,
}: {
  term: TermRow;
  left: number;
  range: string;
  centres: CentreRow[];
  valid: boolean;
  summary: string;
  onClose: () => void;
  onRename: (value: string) => void;
  onCommitName: (prevName: string) => void;
  onSetSchools: (ids: string[]) => void;
  onToggleSchool: (id: string) => void;
  onSetYears: (years: number[]) => void;
  onToggleYear: (year: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const nameAtFocus = useRef(term.name);
  const flip = left > 52; // anchor to the band's right edge when it sits past centre

  const quick = (active: boolean) =>
    cn(
      'cursor-pointer rounded-[6px] border px-[8px] py-[3px] text-[10.5px] font-semibold',
      active
        ? 'border-teal-tint-border bg-teal-tint text-teal'
        : 'border-[#E7DBC9] bg-[#F3ECE2] text-[#6E6358]',
    );

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-[60] w-[316px] rounded-[14px] border border-[#E2D9CC] bg-white p-[16px] shadow-[0_16px_38px_-12px_rgba(60,40,30,0.4)]"
      style={{ top: 'calc(100% + 10px)', left: flip ? 'auto' : 0, right: flip ? 0 : 'auto', cursor: 'default' }}
    >
      {/* Header */}
      <div className="mb-[15px] flex items-center gap-[9px]">
        <span className="h-[9px] w-[9px] flex-none rounded-[3px] bg-teal" />
        <div className="min-w-0 flex-1">
          <input
            value={term.name}
            onChange={(e) => onRename(e.target.value)}
            onFocus={() => {
              nameAtFocus.current = term.name;
            }}
            onBlur={() => onCommitName(nameAtFocus.current)}
            dir="auto"
            className="w-full truncate border-none bg-transparent p-0 text-[13.5px] font-semibold text-[#2A2520] outline-none"
            placeholder={t('termCalendar.newTermName')}
          />
          <div className="text-[11px] text-[#9A9087]">{range}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('termCalendar.close')}
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] border border-[#E7DECF] bg-white hover:bg-[#FBF8F3]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8A8178" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Centres */}
      <div className="mb-[8px] flex items-center gap-[8px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">
          {t('termCalendar.centres.label')}
        </span>
        <div className="ml-auto flex gap-[5px]">
          <button type="button" onClick={() => onSetSchools(centres.map((c) => c.id))} className={quick(false)}>
            {t('termCalendar.quick.all')}
          </button>
          <button type="button" onClick={() => onSetSchools([])} className={quick(false)}>
            {t('termCalendar.quick.none')}
          </button>
        </div>
      </div>
      <div className="mb-[15px] flex flex-col gap-[5px]">
        {centres.length === 0 ? (
          <div className="rounded-[8px] border border-[#E7DECF] bg-white px-[10px] py-[8px] text-[12px] text-[#9A9087]">
            {t('termCalendar.centres.empty')}
          </div>
        ) : (
          centres.map((c) => {
            const checked = term.schoolIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggleSchool(c.id)}
                className={cn(
                  'flex items-center gap-[10px] rounded-[8px] border px-[10px] py-[8px] text-left',
                  checked ? 'border-teal-tint-border bg-teal-tint' : 'border-[#E7DECF] bg-white',
                )}
              >
                <span
                  className={cn(
                    'flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[5px] border-[1.5px]',
                    checked ? 'border-teal bg-teal' : 'border-[#CFC6B9] bg-white',
                  )}
                >
                  {checked ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                  ) : null}
                </span>
                <span className="flex-1 text-[12.5px] font-semibold text-[#3A332E]" dir="auto">{c.name}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Years */}
      <div className="mb-[8px] flex items-center gap-[8px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">
          {t('termCalendar.years.label')}
        </span>
        <div className="ml-auto flex gap-[5px]">
          <button type="button" onClick={() => onSetYears(Y1_6)} className={quick(true)}>
            {t('termCalendar.years.y16')}
          </button>
          <button type="button" onClick={() => onSetYears(YEAR_CHIPS)} className={quick(false)}>
            {t('termCalendar.quick.all')}
          </button>
          <button type="button" onClick={() => onSetYears([])} className={quick(false)}>
            {t('termCalendar.quick.none')}
          </button>
        </div>
      </div>
      <div className="mb-[14px] flex flex-wrap gap-[6px]">
        {YEAR_CHIPS.map((n) => {
          const checked = term.years.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onToggleYear(n)}
              className={cn(
                'rounded-[8px] border-[1.5px] px-[11px] py-[6px] text-[12px] font-semibold',
                checked ? 'border-teal bg-teal text-white' : 'border-[#E0D6C7] bg-white text-[#6E6358]',
              )}
            >
              Y{formatNumber(n, locale)}
            </button>
          );
        })}
      </div>

      {/* Validity strip — teal when valid, amber (status-progress) otherwise. Never red. */}
      <div
        className={cn(
          'flex items-center gap-[8px] rounded-[9px] border px-[11px] py-[9px]',
          valid
            ? 'border-teal-tint-border bg-teal-tint'
            : 'border-status-progress-border bg-status-progress-bg',
        )}
      >
        {valid ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-teal" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-status-progress" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
        )}
        <span className={cn('flex-1 text-[11.5px] font-semibold', valid ? 'text-teal-deep' : 'text-status-progress')} dir="auto">
          {summary}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex-none text-[11.5px] font-semibold text-danger hover:opacity-70"
        >
          {t('termCalendar.remove')}
        </button>
      </div>
    </div>
  );
}
