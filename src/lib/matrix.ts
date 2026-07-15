// Shared axes + cell-key helpers for the settings subject × year matrix. Both
// matrix surfaces (Profile "Classes you teach" and the admin Classes tab) and
// the class-input validator import from here so there is a single source of
// truth for the year rows and the cell key — no per-surface drift.

/**
 * The canonical year groups (Year 0 … Year 6), the ROW axis of every
 * subject × year matrix. Rendered in full on both surfaces regardless of which
 * classes exist. Previously duplicated as a literal in ClassesTab and as the
 * 0..6 bound in the class-input validator.
 */
export const YEARS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** Inclusive year bounds, for input validation. */
export const MIN_YEAR = 0;
export const MAX_YEAR = 6;

/** The `${subjectId}:${year}` key identifying one matrix cell. */
export function cellKey(subjectId: string, year: number): string {
  return `${subjectId}:${year}`;
}
