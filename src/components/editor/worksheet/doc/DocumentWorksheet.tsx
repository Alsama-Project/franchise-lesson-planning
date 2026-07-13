'use client';

// The continuous-document worksheet editor (v3). ONE document-wide TipTap editor
// (native history) renders a white A4-width page on a soft-grey canvas: a single
// masthead at the top, the flowing body, and a footer. It re-houses every v2
// capability as inline behaviour — image insert/resize/crop (ResizableImage), AI
// generation (inline-at-caret generate + selection "Adjust"), bank-resource
// insertion, the slash menu, selection bubble, and the persistent toolbar — and
// autosaves the v3 envelope through the parent's debounced saveWorksheet.

import { useCallback, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import type { WorksheetV3 } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { migrateWorksheetToV3 } from '@/lib/editor/worksheet-migrate';
import { normalizeTableColwidths } from './normalizeTables';
import { buildBlocksFromResource } from '@/lib/editor/resource-to-block';
import { uploadWorksheetImageAction } from '@/lib/actions/worksheet';
import type { WorksheetContext } from '../context';
import { ResourceBankModal } from '../ResourceBankModal';
import { worksheetDocExtensions } from './extensions';
import { SlashCommands } from './SlashMenu';
import { Toolbar } from './Toolbar';
import { BubbleToolbar } from './BubbleToolbar';
import { TableToolbar } from './TableToolbar';
import { DocMasthead, DocFooter } from './DocMasthead';
import { InlinePromptPopover, type Anchor } from './InlinePromptPopover';
import { insertGeneratedResource, adjustSelectionWithAI } from './aiInsert';
import { BRAND, PAGE_WIDTH, PAGE_PAD_X, PAGE_PAD_TOP, PAGE_PAD_BOTTOM, type SaveState } from './theme';

export type { SaveState } from './theme';

/** Which inline AI popover is open, and where it is anchored (viewport coords). */
type PromptState = { mode: 'generate' | 'adjust'; anchor: Anchor } | null;

/** The caret/selection position in viewport coordinates, for anchoring a popover. */
function anchorAt(editor: Editor, pos: number): Anchor {
  const c = editor.view.coordsAtPos(pos);
  return { x: c.left, y: c.bottom + 6 };
}

export function DocumentWorksheet({
  value,
  onChange,
  context,
  vocabulary,
  saveState = 'idle',
}: {
  /** The stored worksheet column (any legacy or v2/v3 shape). */
  value: unknown;
  /** Lift the full v3 envelope for the parent's debounced autosave. */
  onChange: (worksheet: WorksheetV3) => void;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
  saveState?: SaveState;
}) {
  const initialDoc = useMemo(() => normalizeTableColwidths(migrateWorksheetToV3(value).doc), [value]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [busy, setBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [teacherNotes, setTeacherNotes] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickImage = useCallback(() => fileInputRef.current?.click(), []);

  const editor = useEditor({
    extensions: [
      ...worksheetDocExtensions(),
      // These callbacks fire only from a slash-menu selection (a user event), never
      // during render, so reading the file-input ref inside pickImage is safe.
      // eslint-disable-next-line react-hooks/refs
      SlashCommands.configure({
        onInsertImage: () => pickImage(),
        // Anchor the generate popover at the caret where "/" was typed. Computed
        // inline from the passed editor so it doesn't depend on state declared below.
        onGenerateAI: (ed) => {
          setPromptError(null);
          setPrompt({ mode: 'generate', anchor: anchorAt(ed, ed.state.selection.head) });
        },
        onInsertResource: () => setBankOpen(true),
      }),
    ],
    content: initialDoc as JSONContent,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'ws-doc', spellcheck: 'true' } },
    onUpdate: ({ editor }) => onChange({ version: 3, doc: editor.getJSON() as WorksheetV3['doc'] }),
  });

  /** Open the generate popover anchored at the caret. */
  const openGenerate = useCallback(
    (ed?: Editor) => {
      const e = ed ?? editor;
      if (!e) return;
      setPromptError(null);
      setPrompt({ mode: 'generate', anchor: anchorAt(e, e.state.selection.head) });
    },
    [editor],
  );

  /** Open the adjust popover anchored at the end of the current selection. */
  const openAdjust = useCallback(() => {
    if (!editor || editor.state.selection.empty) return;
    setPromptError(null);
    setPrompt({ mode: 'adjust', anchor: anchorAt(editor, editor.state.selection.to) });
  }, [editor]);

  const onFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !editor) return;
      setUploadError(null);
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadWorksheetImageAction(fd);
      if (res.ok && res.url) {
        editor.chain().focus().setImage({ src: res.url, alt: file.name }).run();
      } else {
        setUploadError(res.error ?? 'Could not insert the image.');
      }
    },
    [editor],
  );

  const addFromBank = useCallback(
    async (resource: ResourceWithTags) => {
      if (!editor) return;
      const blocks = await buildBlocksFromResource(resource);
      for (const b of blocks) {
        const content = b.doc && Array.isArray(b.doc.content) ? b.doc.content : null;
        if (content) editor.chain().focus().insertContent(content).run();
      }
      setBankOpen(false);
    },
    [editor],
  );

  /** Run the open popover's prompt (generate at caret / adjust the selection). */
  const runPrompt = useCallback(
    async (text: string) => {
      if (!editor || !prompt) return;
      setBusy(true);
      setPromptError(null);
      try {
        if (prompt.mode === 'generate') {
          const { teacherNotes } = await insertGeneratedResource(editor, context, text);
          setTeacherNotes(teacherNotes);
          setPrompt(null);
        } else {
          const { teacherNotes, changed } = await adjustSelectionWithAI(editor, context, text);
          if (changed) {
            setTeacherNotes(teacherNotes);
            setPrompt(null);
          } else {
            setPromptError('Select some text first, then describe the change.');
          }
        }
      } catch (err) {
        setPromptError(err instanceof Error ? err.message : 'The AI request failed.');
      } finally {
        setBusy(false);
      }
    },
    [editor, prompt, context],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Chrome — toolbar (never printed) */}
      <div className="ws-no-print" style={{ padding: '8px 10px' }}>
        <Toolbar
          editor={editor}
          onInsertImage={pickImage}
          onInsertResource={() => setBankOpen(true)}
          onGenerateAI={() => openGenerate()}
          saveState={saveState}
        />
      </div>

      {teacherNotes ? (
        <div
          className="ws-no-print"
          style={{ margin: '0 12px 8px', padding: '9px 12px', borderRadius: 10, background: BRAND.creamSoft, border: '1px solid #ECE0CF', fontSize: 12.5, color: '#5C544E', display: 'flex', gap: 10 }}
        >
          <span style={{ flex: 1 }}><b style={{ color: BRAND.ink }}>Teacher notes:</b> {teacherNotes}</span>
          <button type="button" onClick={() => setTeacherNotes(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: BRAND.faint, fontWeight: 700 }}>×</button>
        </div>
      ) : null}
      {uploadError ? (
        <div className="ws-no-print" style={{ margin: '0 12px 8px', fontSize: 12.5, color: BRAND.pink }}>{uploadError}</div>
      ) : null}

      {/* Canvas — soft grey, scrollable; the white page floats on it */}
      <div className="ws-doc-canvas" style={{ flex: 1, minHeight: 0, overflow: 'auto', background: BRAND.canvas, padding: '28px 20px 60px' }}>
        <div className="ws-doc-page ws-print-area" style={{ width: PAGE_WIDTH, maxWidth: '100%', margin: '0 auto', background: '#fff', boxShadow: BRAND.pageShadow, borderRadius: 2 }}>
          <DocMasthead ctx={context} />
          <div className="ws-doc-body" style={{ padding: `${PAGE_PAD_TOP}px ${PAGE_PAD_X}px ${PAGE_PAD_BOTTOM}px`, minHeight: 520 }}>
            <EditorContent editor={editor} />
          </div>
          <DocFooter ctx={context} className="ws-doc-footer-screen ws-no-print" />
          {/* Print-only running footer — inside .ws-print-area so it stays visible
              under the print rules; position:fixed makes it repeat on every sheet. */}
          <DocFooter ctx={context} className="ws-print-footer" />
        </div>
      </div>

      <BubbleToolbar editor={editor} onAdjustAI={openAdjust} />
      <TableToolbar editor={editor} />

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFilePicked} />

      {bankOpen ? (
        <ResourceBankModal
          ctx={context}
          vocabulary={vocabulary}
          onClose={() => setBankOpen(false)}
          onAdd={(resource) => addFromBank(resource)}
        />
      ) : null}

      {prompt ? (
        <InlinePromptPopover
          anchor={prompt.anchor}
          title={prompt.mode === 'generate' ? 'Generate a resource' : 'Adjust with AI'}
          placeholder={
            prompt.mode === 'generate'
              ? 'Describe the resource you need…'
              : 'How should I change this? e.g. simpler, add a word bank'
          }
          submitLabel={prompt.mode === 'generate' ? 'Generate' : 'Apply'}
          busy={busy}
          error={promptError}
          onSubmit={runPrompt}
          onCancel={() => (busy ? null : setPrompt(null))}
        />
      ) : null}
    </div>
  );
}
