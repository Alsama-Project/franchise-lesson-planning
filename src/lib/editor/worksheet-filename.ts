// The PDF filename for a printed worksheet. Chrome derives the saved-PDF name
// from `document.title` at the moment `window.print()` runs, so we build a
// desktop-friendly title, swap it in, print, and restore the real title.
//
// The name mirrors what is printed on the paper (subject, year, lesson key,
// theme, centre) so the file on a teacher's desktop sorts sensibly and matches
// the sheet it came from, e.g.
//   `Alsama - English Y0 - 1.S0.K0.H9 - Transport and places - Shatila 1`

import type { WorksheetContext } from '@/components/editor/worksheet/context';

// Characters that break filenames on macOS (`/` `:`) and Windows
// (`\ / : * ? " < > |`). Replaced with a space, not dropped, so words don't fuse.
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;

function cleanSegment(part: string): string {
  return part.replace(ILLEGAL_FILENAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The desktop-friendly PDF title for a worksheet (no extension — Chrome appends
 * `.pdf` to the document title itself).
 *
 * Every segment after the `Alsama` prefix is optional: the lesson key
 * (`ctx.lessonCode`) and theme are legitimately absent on centre/org plans that
 * never resolved a curriculum lesson, and the year is null off a class. Missing
 * parts are dropped rather than left as empty ` -  - ` separators, so the worst
 * case still yields a sensible `Alsama`.
 */
export function worksheetPdfTitle(ctx: WorksheetContext): string {
  const subjectYear = [ctx.subjectName, ctx.year != null ? `Y${ctx.year}` : '']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

  return ['Alsama', subjectYear, ctx.lessonCode, ctx.theme, ctx.centreName]
    .map((part) => cleanSegment(part ?? ''))
    .filter(Boolean)
    .join(' - ');
}

/**
 * Print, having set `document.title` to `title` so Chrome names the PDF after
 * it. Chrome's `print()` blocks until the dialog closes, so the `finally`
 * restore runs only after the filename has been read.
 */
export function printWithTitle(title: string): void {
  if (typeof document === 'undefined') return;
  const previous = document.title;
  document.title = title || previous;
  try {
    window.print();
  } finally {
    document.title = previous;
  }
}
