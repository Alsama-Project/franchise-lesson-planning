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
