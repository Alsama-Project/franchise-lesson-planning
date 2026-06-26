// Small shared date formatters. Pure (no server-only / client-only bias) so they
// can be used from both Server and Client Components.

/**
 * Format an ISO timestamp as a compact day-month-year, e.g. `26 Jun 2026`.
 * Returns an empty string for a missing/invalid input so callers can render the
 * surrounding label conditionally.
 */
export function formatDayMonthYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
