// Small pure selectors over the loaded annotations, shared by the read-side
// affordances (prose fields, duration/grouping cells). Kept separate from the
// context so they stay trivially testable and allocation-light.

import type { Annotation, AnchorType, SuggestionShape } from '@/types/annotation';

/**
 * The single still-PENDING suggestion of a shape on a given anchor, if any. The
 * baseline for an inline re-edit: `undefined` phaseRef/blockRef means "don't filter
 * on it" (so an objective text suggestion matches with both null). Rejected/accepted
 * suggestions are intentionally excluded — a decided suggestion is not an open edit.
 */
export function pendingSuggestion(
  annotations: Annotation[],
  match: {
    shape: SuggestionShape;
    anchorType: AnchorType;
    phaseRef?: string | null;
    blockRef?: string | null;
  },
): Annotation | undefined {
  return annotations.find(
    (a) =>
      a.kind === 'suggestion' &&
      a.status === 'pending' &&
      a.suggestionShape === match.shape &&
      a.anchorType === match.anchorType &&
      (match.phaseRef === undefined || a.phaseRef === match.phaseRef) &&
      (match.blockRef === undefined || a.blockRef === match.blockRef),
  );
}
