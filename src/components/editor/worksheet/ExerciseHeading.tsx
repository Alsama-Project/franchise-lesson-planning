'use client';

// The auto-numbered "Exercise N" heading shown at the top of every exercise block.
// Unlike the editor-only BlockBar chrome (drag handle / duplicate / delete), this
// is real worksheet content the student sees — it renders on the page and prints.
// The number is the block's 1-based position, so it renumbers automatically as
// blocks are added, removed, or reordered. As worksheet content it follows the
// SUBJECT's content language, not the UI locale.

import {
  worksheetArtifactText,
  type WorksheetContentLanguage,
} from '@/lib/editor/worksheet-content-locale';

export function ExerciseHeading({
  index,
  language,
}: {
  index: number;
  language: WorksheetContentLanguage;
}) {
  return (
    <div
      className="ws-exercise-heading"
      style={{
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: '#B62A5C',
        marginBottom: 12,
      }}
    >
      {worksheetArtifactText(language, 'exerciseHeading', { n: index + 1 })}
    </div>
  );
}
