'use client';

// Decides which worksheet surface to mount. The v3 continuous DocumentWorksheet is
// now the DEFAULT (live) editor; the v2 block builder is ARCHIVED and reached only
// via the kill-switch (NEXT_PUBLIC_WORKSHEET_DOC_EDITOR=false):
//
//   • default (flag not "false") → the v3 continuous DocumentWorksheet (edits
//     autosave a v3 envelope). This is what every teacher gets.
//   • kill-switch (flag = "false") + the stored row is already v3 → a RENDER-ONLY
//     v3 view. Safety net: the archived block builder would parseWorksheet a v3 row
//     into a collapsed v2 and autosave that back, clobbering the v3 doc — so we
//     never mount an editable v2 builder over a v3 row.
//   • kill-switch (flag = "false") + a legacy v1/v2 row → the archived v2
//     WorksheetBuilder, unchanged.
//
// This lives INSIDE the worksheet editor pane; it does not touch the surrounding
// resizable panel container.

import type { Worksheet, WorksheetV3 } from '@/types/lesson';
import type { TagsByDimension } from '@/types/resource';
import { isWorksheetDocEditorEnabled } from '@/lib/editor/doc-flag';
import { sourceVersion } from '@/lib/editor/worksheet-migrate';
import { WorksheetBuilder } from './WorksheetBuilder';
import type { WorksheetContext } from './context';
import { DocumentWorksheet, type SaveState } from './doc/DocumentWorksheet';
import { DocumentWorksheetReadOnly } from './doc/DocumentWorksheetReadOnly';

export function WorksheetPane({
  value,
  onChange,
  context,
  vocabulary,
  saveState,
}: {
  value: unknown;
  onChange: (worksheet: Worksheet | WorksheetV3) => void;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
  saveState?: SaveState;
}) {
  const docEditor = isWorksheetDocEditorEnabled();

  if (docEditor) {
    return (
      <DocumentWorksheet
        value={value}
        onChange={onChange}
        context={context}
        vocabulary={vocabulary}
        saveState={saveState}
      />
    );
  }

  // Flag off: never edit a v3 row with the old builder — render it read-only so no
  // autosave can overwrite it with the downgraded v2.
  if (sourceVersion(value) === 'v3') {
    return <DocumentWorksheetReadOnly value={value} context={context} />;
  }

  return (
    <WorksheetBuilder value={value} onChange={onChange} context={context} vocabulary={vocabulary} />
  );
}
