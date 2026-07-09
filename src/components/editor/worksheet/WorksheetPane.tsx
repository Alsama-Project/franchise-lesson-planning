'use client';

// Decides which worksheet surface to mount, gated by the document-editor flag:
//
//   • flag ON  → the v3 continuous DocumentWorksheet (edits autosave a v3 envelope).
//   • flag OFF + the stored row is already v3 → a RENDER-ONLY v3 view. This is the
//     kill-switch safety net: the old block builder would parseWorksheet a v3 row
//     into a collapsed v2 and then autosave that back, clobbering the v3 doc — so we
//     never mount an editable builder over a v3 row when the flag is off.
//   • otherwise → the existing v2 WorksheetBuilder, unchanged.
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
