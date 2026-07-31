import { formatDate } from '@/lib/format';
import type { AiContextBoard, AiContextDocView } from '@/types/ai-context';

// Small pure helpers shared across the AI-instructions client components. No
// hooks, no i18n — label lookups live at the call site with `useTranslations`.

/** "12 Mar" — day + short month, for the collapsed cards. */
export function shortDate(iso: string, locale: string): string {
  return formatDate(iso, locale, { day: 'numeric', month: 'short', year: undefined });
}

/** "12 Mar 2026" — day + short month + year, for the popup meta line. */
export function fullDate(iso: string, locale: string): string {
  return formatDate(iso, locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A document name defaulted from an uploaded filename (extension stripped). The
 *  mockup draws no name field on the "Add document" affordance, so a new doc's
 *  name defaults to its file's stem; it can be renamed later via PATCH. */
export function filenameStem(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, '').trim();
  return base || filename;
}

/** Find a document anywhere on the board by id (used to re-derive the open popup /
 *  archive target from fresh props after `router.refresh()`). */
export function findDoc(board: AiContextBoard, id: string): AiContextDocView | null {
  const all: AiContextDocView[] = [
    ...board.org,
    ...board.academic,
    ...board.subjects.flatMap((s) => s.docs),
    ...board.tools.flatMap((t) => t.docs),
  ];
  return all.find((d) => d.id === id) ?? null;
}
