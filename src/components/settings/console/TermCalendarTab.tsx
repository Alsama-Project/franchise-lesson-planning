'use client';

// The admin "Term calendar" — school + year scoping (Claude Design "Option B" port).
// A single-screen Sept→Aug band timeline: each term carries a SET OF CENTRES and a
// SET OF CURRICULUM YEARS. Drag a band to move it (snaps to Monday), drag its right
// edge to resize 1–40 weeks, click it to open the popover (dates + centres + years).
// A term with zero centres OR zero years produces no teaching weeks — surfaced with
// the app's non-destructive amber (status-progress) caution, never delete-red.
//
// DRAFT-UNTIL-SAVE. Selecting or adding a term opens ONE working draft; every edit —
// the date fields, the centre/year toggles, the name, and band drag/resize — mutates
// that draft in memory only. Nothing autosaves. A single Save commits the whole
// draft (create or update); the server re-runs the overlap guard and rejects a bad
// write. "Add term" writes no row until Save (a new term has no band yet), so X on a
// new draft discards it and X on an existing draft reverts (the band renders the
// draft; persisted `terms` is the snapshot). "Remove" is the distinct delete.
// The anchor academic year is DERIVED from the earliest term (never a hardcoded
// calendar year). No dnd-kit — hand-rolled pointer events, as before.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { CentreRow, TermRow } from '@/lib/console';
import { createTerm, deleteTerm, updateTerm } from '@/lib/actions/console';
import { findTermOverlap, type TermScope } from '@/lib/term-overlap';
import {
  academicYearOf,
  addDays,
  daysBetween,
  formatShortWeekdayDate,
  mondayOf,
  todayInBeirut,
} from '@/lib/week';

const MIN_WEEKS = 1;
const MAX_WEEKS = 40;
const ROW_STEP = 54; // px between stacked lanes
const BAND_TOP = 4; // px before the first lane
const BAND_H = 46; // px band height
// Month columns in academic (August-first) order, as short labels. The year starts
// after the August break, so the axis opens on August — a late-August term start
// then renders at the LEFT edge of its year rather than clipped off a Sept axis.
const MONTH_COLS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
// Column index where the calendar year rolls over (January = year `ay`+1).
const YEAR_ROLLOVER_COL = 5;
const YEAR_CHIPS = [0, 1, 2, 3, 4, 5, 6];
const Y1_6 = [1, 2, 3, 4, 5, 6];

function clampWeeks(n: number): number {
  if (!Number.isFinite(n)) return MIN_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(n)));
}

/** The first Monday on or after `iso` (a `YYYY-MM-DD`). */
function firstMondayOnOrAfter(iso: string): string {
  const m = mondayOf(iso);
  return m < iso ? addDays(m, 7) : m;
}

/** The first Monday on or after 1 August of academic year `ay` — the axis's left edge. */
function firstMondayOfAugust(ay: number): string {
  return firstMondayOnOrAfter(`${ay}-08-01`);
}

/**
 * Clamp a term's start (a Monday) into the selected academic-year window so a drag
 * can never push `starts_on` out of the AY the axis is showing — otherwise the band
 * would silently vanish from view (and persist into another AY). The window is
 * 1 Aug (`ay`) → 31 Jul (`ay`+1) — the August-anchored year — so both bounds bucket
 * to `ay` (see `academicYearOf`) and satisfy the DB's `isodow = 1` check. A term may
 * still END past July — the right-edge "continues beyond range" cue covers that.
 */
function clampStartToAY(start: string, ay: number): string {
  const min = firstMondayOfAugust(ay); // first Monday of the AY (Aug)
  const max = mondayOf(`${ay + 1}-07-31`); // Monday of the week containing 31 Jul
  if (start < min) return min;
  if (start > max) return max;
  return start;
}

// ── August-anchored fractional geometry (0 = 1 Aug … 1 = 31 Jul) ───────────────
// Month-proportional: each month is 1/12 of the track, matching the equal 12-column
// month header/gridlines. `dateToFrac` is anchor-independent (any Aug→Jul maps to
// 0→1); `fracToDate` needs the anchor year to place Jan–Jul in the following year.

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** ISO `YYYY-MM-DD` → its position in the August-anchored academic year, 0..1. */
function dateToFrac(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const monthIndex = m - 1;
  const monthsFromAug = (monthIndex - 7 + 12) % 12;
  const dim = daysInMonth(y, monthIndex);
  return (monthsFromAug + (d - 1) / dim) / 12;
}

/** Fractional position 0..1 → ISO date in the anchor academic year. */
function fracToDate(frac: number, anchorYear: number): string {
  const f = Math.max(0, Math.min(0.9999, frac));
  const f12 = f * 12;
  const mi = Math.floor(f12);
  const rem = f12 - mi;
  const monthIndex = (7 + mi) % 12;
  const year = anchorYear + (mi >= YEAR_ROLLOVER_COL ? 1 : 0); // Jan (monthsFromAug=5) onward is next year
  const dim = daysInMonth(year, monthIndex);
  const day = Math.min(dim, Math.floor(rem * dim) + 1);
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** [start, endExclusive) Monday range of a term, as ISO strings. */
function termRange(term: TermRow): { start: string; end: string } {
  const start = mondayOf(term.startsOn);
  return { start, end: addDays(start, term.numWeeks * 7) };
}

/** Teaching weeks between two boundary Mondays, inclusive of both (`≥1` when end ≥ start). */
function weeksBetweenMondays(startMon: string, endMon: string): number {
  return daysBetween(startMon, endMon) / 7 + 1;
}

/** Order-independent equality for a set of ids/years (draft-vs-saved dirty check). */
function sameSet<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** A term being edited in the popover. `isNew` drafts have no DB row until Save. */
type DraftTerm = TermRow & { isNew: boolean };

/**
 * The academic year a term files under — the SINGLE bucketing seam. Today it derives
 * from the start date (August boundary, see `academicYearOf`); a stored, overridable
 * `term.academic_year` would layer in here as `?? academicYearOf(startsOn)` without
 * touching any call site. Accepts anything with a `startsOn` (a TermRow or a draft).
 */
function termAcademicYear(term: { startsOn: string }): number {
  return academicYearOf(term.startsOn);
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
  term: TermRow; // the band grabbed, used to seed the draft on first move
  grab: number; // pointer-frac minus band-start-frac at grab time
  origStart: string;
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [terms, setTerms] = useState<TermRow[]>(initialTerms);
  // The single in-memory draft being edited (selected or newly added); null = closed.
  const [draft, setDraft] = useState<DraftTerm | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const draftIsNew = draft?.isNew ?? false;

  // Selected academic year, driven by `?ay=<startYear>` (mirrors the `?tab=`
  // convention). Absent/malformed → the AY containing today in Beirut (the app's
  // wall-clock), never today's UTC date: 31 Aug ↔ 1 Sep is the AY boundary. If that
  // AY has no terms we still land here and show the empty state — we never jump to
  // where the data is. The AY is a pure UI grouping of `term.starts_on`; nothing
  // is persisted and `term_week` stays date-driven.
  const paramAY = searchParams.get('ay');
  const selectedAY =
    paramAY && /^\d{4}$/.test(paramAY) ? Number(paramAY) : academicYearOf(todayInBeirut());

  const goToAY = useCallback(
    (ay: number) => {
      // Drop the open draft first: the popover must not orphan onto a band the new AY
      // won't render. Any unsaved edits are discarded — switching AY is a navigation.
      setDraft(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set('ay', String(ay));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // The popover anchors to the selected term's band (existing draft) or to the "Add
  // term" button (a new draft has no band yet). `getAnchor` returns whichever is live.
  const bandAnchorRef = useRef<HTMLDivElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const getAnchor = useCallback(
    (): HTMLElement | null => (draftIsNew ? addBtnRef.current : bandAnchorRef.current),
    [draftIsNew],
  );

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

  // Terms in the selected academic year — the only ones the axis, the bands and the
  // count pill show. `findConflict` deliberately still scans the FULL `terms` set
  // (terms in different AYs occupy disjoint Aug→Jul windows, so this is moot by
  // construction, but it keeps the overlap guard correct regardless).
  const visibleTerms = useMemo(
    () => terms.filter((term) => termAcademicYear(term) === selectedAY),
    [terms, selectedAY],
  );

  // Bands render from the DRAFT for the term being edited (a live preview of unsaved
  // date edits / drag), and from the persisted row otherwise. A NEW draft has no
  // band — it isn't in `terms` and isn't substituted — so it never shows before Save.
  const renderTerms = useMemo(
    () => visibleTerms.map((term) => (draft && !draft.isNew && draft.id === term.id ? draft : term)),
    [visibleTerms, draft],
  );

  // Lane-pack over the rendered terms so a filtered-out term leaves no vertical gap.
  const { laneOf, laneCount } = useMemo(() => packLanes(renderTerms), [renderTerms]);
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

  // Does `candidate` (proposed dates + this term's scope) overlap another term on a
  // shared (school, year)? That silently corrupts week_no and the DB has no guard, so
  // the popover disables Save and names the clash. Candidate-based (not term-based) so
  // the popover can test its unsaved draft dates against the live terms. Shares the
  // exact rule with the server write path via findTermOverlap — they can't drift.
  const findConflict = useCallback(
    (candidate: TermScope): { name: string; scope: string } | null => {
      const hit = findTermOverlap(candidate, terms);
      if (!hit) return null;
      const name = terms.find((x) => x.id === hit.term.id)?.name ?? '';
      return { name, scope: `${schoolsLabel(hit.schools)} · ${yearsLabel(hit.years)}` };
    },
    [terms, schoolsLabel, yearsLabel],
  );

  // ── draft editing (nothing persists until Save) ───────────────────────────────
  const patchDraft = useCallback((patch: Partial<TermRow>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }, []);

  // ── drag: move start / resize weeks — edits the DRAFT, never the DB ───────────
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
      term,
      grab: pointerFrac(e.clientX) - startFrac,
      origStart: mondayOf(term.startsOn),
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBandPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const pf = pointerFrac(e.clientX);
    if (!d.moved && Math.abs(pf - (d.grab + dateToFrac(d.origStart))) < 0.004) return;
    d.moved = true;
    const patch =
      d.mode === 'move'
        ? // Clamp in DATE space to the selected-AY window so a drag can't push the
          // term out of the AY the axis is rendering (which would vanish it).
          { startsOn: clampStartToAY(mondayOf(fracToDate(pf - d.grab, selectedAY)), selectedAY) }
        : { numWeeks: clampWeeks(daysBetween(d.origStart, fracToDate(pf, selectedAY)) / 7) };
    // Seed the draft from the grabbed band on the first move (drag opens the draft),
    // then keep editing it. Switching bands mid-edit adopts the newly grabbed term.
    setDraft((cur) => ({ ...(cur && cur.id === d.id ? cur : { ...d.term, isNew: false }), ...patch }));
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
    // A click (no drag) toggles the draft open/closed for this term. A drag left the
    // draft holding the new dates — it waits for Save.
    if (!d.moved) {
      setDraft((cur) => (cur && cur.id === term.id && !cur.isNew ? null : { ...term, isNew: false }));
    }
  }

  // ── open / add / save / remove ────────────────────────────────────────────────
  function addTerm() {
    // Default start: the Monday after the latest term's end WITHIN the selected AY,
    // else the first Monday of September of the selected AY. Clamp into the AY window
    // so the new term lands in the AY on screen. Born with EMPTY scope so the amber
    // warning forces an explicit centre/year choice (no silent over-grant). This is a
    // draft only — no DB row and no band until Save.
    let startsOn: string;
    if (visibleTerms.length) {
      const latest = visibleTerms.reduce((a, b) => (a.startsOn >= b.startsOn ? a : b));
      startsOn = clampStartToAY(mondayOf(addDays(latest.startsOn, latest.numWeeks * 7)), selectedAY);
    } else {
      // The axis opens in August, but the year's opener starts late Aug / early Sep
      // (nothing legitimately starts in early August), so default to September.
      startsOn = firstMondayOnOrAfter(`${selectedAY}-09-01`);
    }
    setDraft({
      id: `temp-${crypto.randomUUID()}`,
      name: t('termCalendar.newTermName'),
      startsOn,
      numWeeks: 12,
      schoolIds: [],
      years: [],
      isNew: true,
    });
  }

  // Commit the whole draft in one write — dates, centres and years together. The
  // server re-runs the overlap guard and rejects a bad write (toast, draft stays
  // open to fix). On success the persisted set updates and the popover closes.
  function saveDraft() {
    const d = draft;
    if (!d) return;
    const name = d.name.trim() || t('termCalendar.newTermName');
    const startsOn = mondayOf(d.startsOn);
    const payload = { name, startsOn, numWeeks: d.numWeeks, schoolIds: d.schoolIds, years: d.years };
    startTransition(async () => {
      if (d.isNew) {
        const res = await createTerm(payload);
        if (!res.ok || !res.term) {
          setToast(res.error ?? t('termCalendar.addError'));
          return;
        }
        const real = res.term;
        setTerms((prev) => [...prev, real]);
      } else {
        const res = await updateTerm({ id: d.id, ...payload });
        if (!res.ok) {
          setToast(res.error ?? t('termCalendar.saveError'));
          return;
        }
        setTerms((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...payload } : x)));
      }
      setDraft((cur) => (cur && cur.id === d.id ? null : cur));
    });
  }

  // Remove: delete an existing term (optimistic, revert on failure), or just discard
  // a new draft (nothing was ever written). Distinct from Save/close.
  function removeDraft() {
    const d = draft;
    if (!d) return;
    setDraft(null);
    if (d.isNew) return;
    const snapshot = terms;
    setTerms((prev) => prev.filter((x) => x.id !== d.id));
    startTransition(async () => {
      const res = await deleteTerm({ id: d.id });
      if (!res.ok) {
        setTerms(snapshot);
        setToast(res.error ?? t('termCalendar.saveError'));
      }
    });
  }

  // Reused for the navigator label AND (short form) the empty-state copy. The year
  // reaches ICU as a String, never num()/formatNumber — a calendar year must never
  // pick up the locale's grouping separator ("2,026" / "2٬026"). String() keeps it
  // Latin and ungrouped in both en and ar; the format stays "2026 / 27". `end` is
  // already a 2-digit String.
  const ayEndShort = String((selectedAY + 1) % 100).padStart(2, '0');
  const academicLabel = t('termCalendar.academicYear', {
    start: String(selectedAY),
    end: ayEndShort,
  });
  const ayShort = `${String(selectedAY)} / ${ayEndShort}`;

  return (
    <div className="space-y-[18px]">
      {/* Heading row */}
      <div className="flex flex-wrap items-center gap-[12px]">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#2A2422]">
          {t('termCalendar.title')}
        </h2>
        <span className="rounded-full bg-[#F3ECE2] px-[10px] py-[3px] text-[12px] font-semibold text-[#A79E94]">
          {t('termCalendar.termsCount', { count: visibleTerms.length })}
        </span>
        <button
          ref={addBtnRef}
          type="button"
          onClick={addTerm}
          className="ml-auto inline-flex items-center gap-[6px] rounded-[9px] bg-teal px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#1a6a5d]"
        >
          <span className="text-[15px] leading-none">＋</span> {t('termCalendar.addTerm')}
        </button>
      </div>

      {/* Academic-year navigator — the subtitle turned into ‹ label › with two teal
          icon buttons. Unbounded in both directions; each step rewrites `?ay=`. */}
      <div className="flex items-center gap-[8px]">
        <button
          type="button"
          onClick={() => goToAY(selectedAY - 1)}
          aria-label={t('termCalendar.prevYear')}
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] border border-teal-tint-border bg-teal-tint text-teal transition-opacity hover:opacity-70"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="min-w-[168px] text-center text-[12.5px] font-semibold text-[#6E6358]">{academicLabel}</div>
        <button
          type="button"
          onClick={() => goToAY(selectedAY + 1)}
          aria-label={t('termCalendar.nextYear')}
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] border border-teal-tint-border bg-teal-tint text-teal transition-opacity hover:opacity-70"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      {/* Timeline card */}
      <div className="rounded-[14px] border border-[#ECE4D7] bg-[#FCFAF6] px-[20px] pb-[22px] pt-[18px]">
        {/* Month header — equal 12-column Aug→Jul axis, kept LTR even in RTL. Aug
            carries the start year's short suffix; Jan (the rollover) carries the next. */}
        <div dir="ltr" className="mb-[4px] grid grid-cols-12 border-b border-[#E7DECF] pb-[9px]">
          {MONTH_COLS.map((m, i) => (
            <div
              key={m}
              className={cn(
                'text-[11px] font-semibold',
                i === 0 || i === YEAR_ROLLOVER_COL ? 'text-[#2A2520]' : 'text-[#8A8178]',
              )}
            >
              {m}
              {i === 0 ? <span className="font-medium text-[#B7AEA3]"> &rsquo;{String(selectedAY % 100).padStart(2, '0')}</span> : null}
              {i === YEAR_ROLLOVER_COL ? <span className="font-medium text-[#B7AEA3]"> &rsquo;{ayEndShort}</span> : null}
            </div>
          ))}
        </div>

        {/* Track — a pointerdown on the empty track closes the draft (discards a new
            one, reverts an existing one). Bands stopPropagation, so this fires only
            for genuine background clicks. */}
        <div dir="ltr" ref={trackRef} className="relative" style={{ height: trackHeight }} onPointerDown={() => setDraft(null)}>
          {/* Gridlines */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-12">
            {MONTH_COLS.map((m, i) => (
              <div key={m} style={{ borderLeft: `1px solid ${i === YEAR_ROLLOVER_COL ? '#ECE0CE' : '#F0E9DE'}` }} />
            ))}
          </div>

          {visibleTerms.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center px-[24px] text-center">
              <p className="max-w-[520px] text-[12.5px] leading-[1.6] text-[#9A9087]">
                {t('termCalendar.empty.hintForYear', { year: ayShort })}
              </p>
            </div>
          ) : (
            renderTerms.map((term) => {
              const startMon = mondayOf(term.startsOn);
              const end = addDays(startMon, term.numWeeks * 7);
              const leftFrac = Math.max(0, Math.min(1, dateToFrac(startMon)));
              const rightFrac = Math.max(0, Math.min(1, dateToFrac(end)));
              const left = leftFrac * 100;
              const width = Math.max(6, (rightFrac - leftFrac) * 100);
              const isSel = !!draft && !draft.isNew && draft.id === term.id;
              const noCentres = term.schoolIds.length === 0;
              const noYears = term.years.length === 0;
              // A term with zero centres OR zero years produces zero `term_week`
              // rows — it is inert. Say THAT, not the neutral "No centres · No
              // years" count, which reads like harmless metadata. Scoped terms keep
              // showing their counts.
              const inert = noCentres || noYears;
              const scopeLine = inert
                ? t('termCalendar.scopeInert')
                : `${schoolsLabel(term.schoolIds)} · ${yearsLabel(term.years)}`;

              return (
                <div
                  key={term.id}
                  ref={isSel ? bandAnchorRef : undefined}
                  tabIndex={-1}
                  onPointerDown={(e) => onBandPointerDown(e, term, 'move')}
                  onPointerMove={onBandPointerMove}
                  onPointerUp={(e) => onBandPointerUp(e, term)}
                  className={cn(
                    'group absolute flex touch-none items-center gap-[8px] rounded-[10px] px-[8px] pl-[11px] outline-none',
                    isSel
                      ? 'z-40 border-[1.5px] border-teal bg-[#D2E9E2] shadow-[0_6px_18px_-8px_rgba(31,122,108,0.5)]'
                      : 'z-10 border-[1.5px] border-[#BFDDD5] bg-[#E4F0ED]',
                  )}
                  style={{ left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%`, top: (laneOf.get(term.id) ?? 0) * ROW_STEP + BAND_TOP, height: BAND_H, cursor: 'grab' }}
                >
                  <span className="flex-none text-[9.5px] font-bold text-[#4E9085]">W1</span>
                  <div className="min-w-0 flex-1" dir="auto">
                    <div className="truncate text-[12.5px] font-semibold text-[#15564B]">{term.name}</div>
                    <div
                      className={cn(
                        'truncate text-[10.5px] font-semibold',
                        inert ? 'text-status-progress' : 'font-medium text-[#5E8C84]',
                      )}
                    >
                      {scopeLine}
                    </div>
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
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* One popover for the open draft — keyed by id so it remeasures when switching
          terms. Anchored to the selected band, or to "Add term" for a new draft. */}
      {draft ? (
        <ScopePopover
          key={draft.id}
          draft={draft}
          persisted={draft.isNew ? null : (terms.find((x) => x.id === draft.id) ?? null)}
          getAnchor={getAnchor}
          centres={activeCentres}
          busy={isPending}
          num={num}
          schoolsLabel={schoolsLabel}
          yearsLabel={yearsLabel}
          findConflict={findConflict}
          onPatch={patchDraft}
          onSave={saveDraft}
          onClose={() => setDraft(null)}
          onRemove={removeDraft}
        />
      ) : null}

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
  draft,
  persisted,
  getAnchor,
  centres,
  busy,
  num,
  schoolsLabel,
  yearsLabel,
  findConflict,
  onPatch,
  onSave,
  onClose,
  onRemove,
}: {
  /** The in-memory working copy — every field edited here mutates only this. */
  draft: DraftTerm;
  /** The last-saved row, for the dirty check; null for a new draft. */
  persisted: TermRow | null;
  /** The live anchor element (selected band, or the "Add term" button for a new draft). */
  getAnchor: () => HTMLElement | null;
  centres: CentreRow[];
  /** A save/remove is in flight — disable Save to avoid a double submit. */
  busy: boolean;
  num: (n: number) => string;
  schoolsLabel: (ids: string[]) => string;
  yearsLabel: (years: number[]) => string;
  /** Overlap test for a candidate (draft dates + scope) vs the live terms. */
  findConflict: (candidate: TermScope) => { name: string; scope: string } | null;
  onPatch: (patch: Partial<TermRow>) => void;
  onSave: () => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const popRef = useRef<HTMLDivElement>(null);

  // Dates are two independent Monday anchors on the draft; the week count is derived
  // (N = whole weeks between them, inclusive), so moving EITHER updates it live.
  const startMon = mondayOf(draft.startsOn);
  const endMon = addDays(startMon, (draft.numWeeks - 1) * 7);
  const draftWeeks = draft.numWeeks; // can be <1 (end<start) or >MAX mid-edit
  const orderingOk = draftWeeks >= MIN_WEEKS; // end ≥ start
  const tooLong = draftWeeks > MAX_WEEKS;

  // Overlap only makes sense for in-range, scoped dates; test the DRAFT against the
  // live terms. Empty-scope terms never conflict (findTermOverlap returns null).
  const dateConflict =
    orderingOk && !tooLong
      ? findConflict({
          id: draft.id,
          startsOn: startMon,
          numWeeks: draftWeeks,
          schoolIds: draft.schoolIds,
          years: draft.years,
        })
      : null;

  const noCentres = draft.schoolIds.length === 0;
  const noYears = draft.years.length === 0;

  // The academic year this term files under — DERIVED from the start date (read-only;
  // no override, so nothing to persist). Recomputes live as the start date changes.
  // Same "2026 / 27" label the year navigator uses, and String() keeps the year Latin
  // and ungrouped in both locales (a calendar year must not pick up a thousands
  // separator). This is the seam a future stored override would read from.
  const filingYear = termAcademicYear({ startsOn: startMon });
  const filingYearLabel = `${filingYear} / ${String((filingYear + 1) % 100).padStart(2, '0')}`;

  // Every failing reason, surfaced together in the amber strip (there can be more
  // than one — e.g. empty scope AND an overlap). Order: scope, then dates.
  const reasons: string[] = [];
  if (noCentres) reasons.push(t('termCalendar.validity.noCentres'));
  if (noYears) reasons.push(t('termCalendar.validity.noYears'));
  if (!orderingOk) reasons.push(t('termCalendar.validity.ordering'));
  else if (tooLong) reasons.push(t('termCalendar.validity.tooLong', { max: num(MAX_WEEKS) }));
  if (dateConflict)
    reasons.push(t('termCalendar.validity.overlap', { term: dateConflict.name, scope: dateConflict.scope }));

  const valid = reasons.length === 0;
  // Ordering, the 40-week cap and overlap HARD-block Save. Empty scope only WARNS —
  // a scopeless term is valid-but-inert, so it must still save (a new term is born
  // scopeless). Only these date/overlap rules gate the write.
  const hardBlocked = !orderingOk || tooLong || !!dateConflict;
  const dirty =
    draft.isNew ||
    !persisted ||
    draft.name.trim() !== persisted.name ||
    startMon !== mondayOf(persisted.startsOn) ||
    draftWeeks !== persisted.numWeeks ||
    !sameSet(draft.schoolIds, persisted.schoolIds) ||
    !sameSet(draft.years, persisted.years);
  const canSave = !hardBlocked && dirty && !busy;

  // ── draft edit handlers (mutate the draft only) ──────────────────────────────
  // Start edit keeps the END fixed and recomputes weeks; end edit keeps the start.
  const editStart = (v: string) => {
    if (!v) return;
    const s = mondayOf(v);
    onPatch({ startsOn: s, numWeeks: weeksBetweenMondays(s, endMon) });
  };
  const editEnd = (v: string) => {
    if (!v) return;
    onPatch({ numWeeks: weeksBetweenMondays(startMon, mondayOf(v)) });
  };
  const toggleSchool = (id: string) =>
    onPatch({
      schoolIds: draft.schoolIds.includes(id)
        ? draft.schoolIds.filter((s) => s !== id)
        : [...draft.schoolIds, id],
    });
  const setYears = (years: number[]) => onPatch({ years: [...new Set(years)].sort((a, b) => a - b) });
  const toggleYear = (year: number) =>
    setYears(draft.years.includes(year) ? draft.years.filter((y) => y !== year) : [...draft.years, year]);

  // Fixed viewport coordinates; null until first measured (rendered hidden so it
  // never flashes at 0,0). The timeline card sits inside an `overflow-hidden`
  // console wrapper (SettingsConsole), which clips an in-flow absolute popover
  // regardless of z-index — so we portal to <body> and position against the anchor's
  // viewport rect, mirroring InlinePromptPopover / the worksheet Toolbar dropdown.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Place below the anchor; flip above when there isn't room; clamp into the viewport
  // horizontally (anchors near either timeline edge, LTR or RTL — the rect is physical).
  useLayoutEffect(() => {
    const place = () => {
      const el = popRef.current;
      const a = getAnchor()?.getBoundingClientRect();
      if (!el || !a) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const gap = 10;
      let top = a.bottom + gap;
      if (top + r.height + margin > window.innerHeight) {
        const above = a.top - gap - r.height;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - r.height - margin);
      }
      if (top < margin) top = margin;
      let left = a.left;
      if (left + r.width + margin > window.innerWidth) left = window.innerWidth - r.width - margin;
      if (left < margin) left = margin;
      setPos({ top, left });
    };
    place();
    // Reposition on scroll (capture: catch any scrolling ancestor), viewport
    // resize, and the popover's own height changes (toggling centres/years).
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ro && popRef.current) ro.observe(popRef.current);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      ro?.disconnect();
    };
  }, [getAnchor]);

  // Close on outside pointerdown and on Escape. A pointerdown on the anchor is left
  // alone so the anchor's own handler runs (no close-then-reopen fight).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (getAnchor()?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [getAnchor, onClose]);

  // Return focus to the anchor when the popover closes (captured at open, so a term
  // removed from the popover — its band gone — is a harmless no-op).
  useEffect(() => {
    const anchor = getAnchor();
    return () => anchor?.focus();
  }, [getAnchor]);

  if (typeof document === 'undefined') return null;

  const quick = (active: boolean) =>
    cn(
      'cursor-pointer rounded-[6px] border px-[8px] py-[3px] text-[10.5px] font-semibold',
      active
        ? 'border-teal-tint-border bg-teal-tint text-teal'
        : 'border-[#E7DBC9] bg-[#F3ECE2] text-[#6E6358]',
    );

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={draft.name || t('termCalendar.newTermName')}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-[120] w-[316px] rounded-[14px] border border-[#E2D9CC] bg-white p-[16px] shadow-[0_16px_38px_-12px_rgba(60,40,30,0.4)]"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden', cursor: 'default' }}
    >
      {/* Header */}
      <div className="mb-[15px] flex items-center gap-[9px]">
        <span className="h-[9px] w-[9px] flex-none rounded-[3px] bg-teal" />
        <div className="min-w-0 flex-1">
          <input
            value={draft.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            dir="auto"
            className="w-full truncate border-none bg-transparent p-0 text-[13.5px] font-semibold text-[#2A2520] outline-none"
            placeholder={t('termCalendar.newTermName')}
          />
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

      {/* Editable term dates — start and end both snap to their week's Monday; the
          teaching-week count is derived live. Kept dir="ltr": the w/c dates use Latin
          month/weekday abbreviations, as the band does. */}
      <div dir="ltr" className="mb-[15px] rounded-[10px] border border-[#ECE4D7] bg-[#FCFAF6] p-[11px]">
        <div className="grid grid-cols-2 gap-[10px]">
          <label className="flex min-w-0 flex-col gap-[4px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">
              {t('termCalendar.dates.startLabel')}
            </span>
            <input
              type="date"
              value={startMon}
              max={endMon}
              onChange={(e) => editStart(e.target.value)}
              className="w-full rounded-[7px] border border-[#E2D9CC] bg-white px-[7px] py-[6px] text-[11.5px] text-[#2A2520] outline-none focus:border-teal"
            />
            <span className="text-[10.5px] font-medium text-[#7C7266]">{`w/c ${formatShortWeekdayDate(startMon)}`}</span>
          </label>
          <label className="flex min-w-0 flex-col gap-[4px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">
              {t('termCalendar.dates.endLabel')}
            </span>
            <input
              type="date"
              value={endMon}
              min={startMon}
              max={addDays(startMon, (MAX_WEEKS - 1) * 7)}
              onChange={(e) => editEnd(e.target.value)}
              className="w-full rounded-[7px] border border-[#E2D9CC] bg-white px-[7px] py-[6px] text-[11.5px] text-[#2A2520] outline-none focus:border-teal"
            />
            <span className="text-[10.5px] font-medium text-[#7C7266]">{`w/c ${formatShortWeekdayDate(endMon)}`}</span>
          </label>
        </div>
        <div className="mt-[9px]">
          <span className={cn('text-[11.5px] font-semibold', !orderingOk || tooLong ? 'text-status-progress' : 'text-teal-deep')}>
            {t('termCalendar.dates.weeks', { count: Math.max(0, draftWeeks) })}
          </span>
        </div>
        {/* Academic year — read-only, derived from the start date (August boundary).
            Not an editable control: it can't persist an override, so it must not look
            editable. The confirmation line spells out where the term files, live. */}
        <div className="mt-[10px] border-t border-[#ECE4D7] pt-[9px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">
              {t('termCalendar.dates.academicYear')}
            </span>
            <span className="ml-auto rounded-[6px] bg-[#F3ECE2] px-[8px] py-[3px] text-[11.5px] font-semibold text-[#6E6358]">
              {filingYearLabel}
            </span>
          </div>
          <div className="mt-[5px] text-[10.5px] font-medium text-[#7C7266]">
            {t('termCalendar.dates.willAddTo', { year: filingYearLabel })}
          </div>
        </div>
      </div>

      {/* Centres */}
      <div className="mb-[8px] flex items-center gap-[8px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">
          {t('termCalendar.centres.label')}
        </span>
        <div className="ml-auto flex gap-[5px]">
          <button type="button" onClick={() => onPatch({ schoolIds: centres.map((c) => c.id) })} className={quick(false)}>
            {t('termCalendar.quick.all')}
          </button>
          <button type="button" onClick={() => onPatch({ schoolIds: [] })} className={quick(false)}>
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
            const checked = draft.schoolIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleSchool(c.id)}
                className={cn(
                  'flex items-center gap-[10px] rounded-[8px] border px-[10px] py-[8px] text-start',
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
          <button type="button" onClick={() => setYears(Y1_6)} className={quick(true)}>
            {t('termCalendar.years.y16')}
          </button>
          <button type="button" onClick={() => setYears(YEAR_CHIPS)} className={quick(false)}>
            {t('termCalendar.quick.all')}
          </button>
          <button type="button" onClick={() => setYears([])} className={quick(false)}>
            {t('termCalendar.quick.none')}
          </button>
        </div>
      </div>
      <div className="mb-[14px] flex flex-wrap gap-[6px]">
        {YEAR_CHIPS.map((n) => {
          const checked = draft.years.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggleYear(n)}
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

      {/* Validity strip — teal when valid, amber (status-progress) otherwise. Never
          red. Reflects the DRAFT, and lists EVERY failing reason (empty scope,
          ordering, the 40-week cap, an overlap) so nothing is hidden behind another. */}
      <div
        className={cn(
          'flex items-start gap-[8px] rounded-[9px] border px-[11px] py-[9px]',
          valid
            ? 'border-teal-tint-border bg-teal-tint'
            : 'border-status-progress-border bg-status-progress-bg',
        )}
      >
        {valid ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] flex-none text-teal" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] flex-none text-status-progress" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
        )}
        <div className={cn('flex-1 space-y-[3px] text-[11.5px] font-semibold', valid ? 'text-teal-deep' : 'text-status-progress')} dir="auto">
          {valid ? (
            <span>
              {t('termCalendar.validity.valid', {
                weeks: num(draftWeeks),
                schools: schoolsLabel(draft.schoolIds),
                years: yearsLabel(draft.years),
              })}
            </span>
          ) : (
            reasons.map((reason) => <div key={reason}>{reason}</div>)
          )}
        </div>
      </div>

      {/* Footer — one Save commits the whole draft; Remove deletes an existing term
          or discards a new one. */}
      <div className="mt-[13px] flex items-center gap-[10px]">
        <button
          type="button"
          onClick={onRemove}
          className="text-[12px] font-semibold text-danger hover:opacity-70"
        >
          {draft.isNew ? t('termCalendar.discard') : t('termCalendar.remove')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={cn(
            'ml-auto rounded-[9px] px-[16px] py-[8px] text-[13px] font-semibold transition-colors',
            canSave ? 'bg-teal text-white hover:bg-[#1a6a5d]' : 'cursor-not-allowed bg-[#F0E9DE] text-[#B7AEA3]',
          )}
        >
          {t('termCalendar.save')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
