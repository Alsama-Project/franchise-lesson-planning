'use client';

// A non-editable render of a v3 worksheet document. Used as the flag KILL-SWITCH
// read path: if a row was saved as v3 (editor was enabled) and the flag is later
// turned off, we must NOT mount an editable builder that could autosave a collapsed
// v2 over the v3 row. This view has no onChange and no save path, so it is
// guaranteed render-only. Also usable for read-only contexts (coordinator view).

import { EditorContent, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { migrateWorksheetToV3 } from '@/lib/editor/worksheet-migrate';
import { normalizeTableColwidths } from './normalizeTables';
import type { WorksheetContext } from '../context';
import { worksheetDocExtensions } from './extensions';
import { DocMasthead, DocFooter } from './DocMasthead';
import { BRAND, PAGE_WIDTH, PAGE_PAD_X, PAGE_PAD_TOP, PAGE_PAD_BOTTOM } from './theme';

export function DocumentWorksheetReadOnly({
  value,
  context,
}: {
  value: unknown;
  context: WorksheetContext;
}) {
  const editor = useEditor({
    extensions: worksheetDocExtensions(context.contentLanguage),
    content: normalizeTableColwidths(migrateWorksheetToV3(value).doc) as JSONContent,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'ws-doc' } },
  });

  return (
    <div className="ws-doc-canvas" style={{ height: '100%', overflow: 'auto', background: BRAND.canvas, padding: '28px 20px 60px' }}>
      <div className="ws-doc-page ws-print-area" style={{ width: PAGE_WIDTH, maxWidth: '100%', margin: '0 auto', background: '#fff', boxShadow: BRAND.pageShadow, borderRadius: 2 }}>
        <DocMasthead ctx={context} />
        <div className="ws-doc-body" style={{ padding: `${PAGE_PAD_TOP}px ${PAGE_PAD_X}px ${PAGE_PAD_BOTTOM}px`, minHeight: 520 }}>
          <EditorContent editor={editor} />
        </div>
        <DocFooter ctx={context} className="ws-doc-footer-screen ws-no-print" />
        <DocFooter ctx={context} className="ws-print-footer" />
      </div>
    </div>
  );
}
