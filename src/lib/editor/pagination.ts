// Whole-block worksheet pagination — the SINGLE source of truth shared by the
// on-screen builder and the print/PDF render, so content flows onto new pages
// identically in both. Pure and deterministic: given the same measured block
// heights and page content height, it always returns the same page assignment.
//
// Whole blocks only: a block that would cross a page boundary moves entirely to
// the next page. A single block taller than one page is kept whole and FLAGGED
// (see `overflow`) rather than split or silently overlapped — drift fails loudly.

export interface PaginationResult {
  /** Block indices assigned to each page, in order. Always at least one page. */
  pages: number[][];
  /** Per-block: true when the block alone is taller than one page (kept whole
   *  on its own page and surfaced as a warning — never split). */
  overflow: boolean[];
}

/**
 * Greedily pack `heights` (one entry per block, in document order) into pages of
 * at most `pageHeight`, leaving `gap` between consecutive blocks on a page.
 *
 * `pageHeight <= 0` means "not measured yet" — everything stays on one page so
 * the worksheet never renders blank/garbled while the first measurement settles.
 */
export function paginateBlocks(
  heights: number[],
  pageHeight: number,
  gap = 0,
): PaginationResult {
  const overflow = heights.map((h) => pageHeight > 0 && h > pageHeight);

  if (pageHeight <= 0 || heights.length === 0) {
    return { pages: [heights.map((_, i) => i)], overflow };
  }

  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  for (let i = 0; i < heights.length; i++) {
    const add = current.length === 0 ? heights[i] : gap + heights[i];
    if (current.length > 0 && used + add > pageHeight) {
      pages.push(current);
      current = [];
      used = 0;
    }
    const first = current.length === 0;
    current.push(i);
    used += first ? heights[i] : gap + heights[i];
  }
  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);
  return { pages, overflow };
}
