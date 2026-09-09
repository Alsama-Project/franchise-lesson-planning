// Board URL helpers — the single place that encodes the planning board's coordinate
// (curriculum month · week) and view into a URL query. Kept dependency-free (no
// server imports) so both the board's client components and the plan pages can build
// the same "return to this week" links. An empty/absent coordinate yields no query,
// so links fall back to the plain overview (which itself lands on the current week).

export type BoardView = 'calendar' | 'status';

/** A board coordinate as carried in the URL: a curriculum month + week number. */
export interface BoardCoordinateInput {
  month: string;
  week: number;
}

/** Normalise loose params (from `searchParams`) into a coordinate, or null if invalid. */
export function toBoardCoordinate(
  month: string | undefined,
  week: string | number | undefined,
): BoardCoordinateInput | null {
  if (!month) return null;
  const weekNum = typeof week === 'number' ? week : Number(week);
  if (!Number.isFinite(weekNum)) return null;
  return { month, week: weekNum };
}

/** Coerce a loose `view` param to a valid board view (defaults to `calendar`). */
export function toBoardView(view: string | undefined): BoardView {
  return view === 'status' ? 'status' : 'calendar';
}

// Calendar-month order — only a deterministic TIE-BREAK when the same academic week
// number maps to two months across divergent years (Y0 Feb-anchored vs Y1–6 Sep).
const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function monthIndex(month: string): number {
  const i = MONTH_ORDER.indexOf(month);
  return i === -1 ? MONTH_ORDER.length : i;
}

/** A per-year curriculum nav: each month with the academic week numbers it holds. */
export interface MonthWeeks {
  month: string;
  weeks: readonly number[];
}

/**
 * Flatten a set of per-year curriculum navs into ONE scheme-of-work sequence of
 * (month, week) coordinates, ordered by the ACADEMIC week number (Y1–6 Sep=1..38,
 * Y0 Mar=1..20) — NOT by calendar month. This is the fix for the legacy flat
 * counter: because the academic year opens in September, ordering by `week` puts
 * September (Week 1) first and June (Week 38) last, and the label is the week itself
 * (equal to `term_week.week_no` by design), never a January-first position. `month`
 * tie-breaks the rare cross-year divergence where one week number sits in two months.
 */
export function orderBoardCoordinates(
  navs: readonly (readonly MonthWeeks[])[],
): BoardCoordinateInput[] {
  const weeksByMonth = new Map<string, Set<number>>();
  for (const nav of navs) {
    for (const { month, weeks } of nav) {
      const set = weeksByMonth.get(month) ?? weeksByMonth.set(month, new Set()).get(month)!;
      for (const w of weeks) set.add(w);
    }
  }
  return [...weeksByMonth.entries()]
    .flatMap(([month, weeks]) => [...weeks].map((week) => ({ month, week })))
    .sort((a, b) => a.week - b.week || monthIndex(a.month) - monthIndex(b.month));
}

/**
 * The board's URL query string (`month=…&week=…&view=…`) for a coordinate + view, or
 * `''` when there is no real coordinate (the empty board). Consumers append it to a
 * plan link so returning lands on the same week the user left.
 */
export function boardWeekQuery(
  coordinate: BoardCoordinateInput | null | undefined,
  view: BoardView,
): string {
  if (!coordinate || !coordinate.month) return '';
  return new URLSearchParams({
    month: coordinate.month,
    week: String(coordinate.week),
    view,
  }).toString();
}

/** The overview href (`/?…`) for a coordinate + view; plain `/` when there is none. */
export function boardHref(
  coordinate: BoardCoordinateInput | null | undefined,
  view: BoardView,
): string {
  const query = boardWeekQuery(coordinate, view);
  return query ? `/?${query}` : '/';
}
