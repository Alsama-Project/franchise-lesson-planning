'use client';

// The continuous-document worksheet editor (v3). ONE document-wide TipTap editor
// (native history) renders a white A4-width page on a soft-grey canvas: a single
// masthead at the top, the flowing body, and a footer. It re-houses every v2
// capability as inline behaviour — image insert/resize/crop (ResizableImage), AI
// generation (flowing insert + selection "Adjust"), bank-resource insertion, the
// slash menu, selection bubble, and the persistent toolbar — and autosaves the v3
// envelope through the parent's debounced saveWorksheet.

import { useCallback, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { WorksheetV3 } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { migrateWorksheetToV3 } from '@/lib/editor/worksheet-migrate';
import { buildBlocksFromResource } from '@/lib/editor/resource-to-block';
import { uploadWorksheetImageAction } from '@/lib/actions/worksheet';
import type { WorksheetContext } from '../context';
import { AiComposer } from '../AiComposer';
import { ResourceBankModal } from '../ResourceBankModal';
import { worksheetDocExtensions } from './extensions';
import { SlashCommands } from './SlashMenu';
import { Toolbar } from './Toolbar';
import { BubbleToolbar } from './BubbleToolbar';
import { DocMasthead, DocFooter } from './DocMasthead';
import { insertGeneratedResource, adjustSelectionWithAI } from './aiInsert';
import { BRAND, PAGE_WIDTH, PAGE_PAD_X, PAGE_PAD_TOP, PAGE_PAD_BOTTOM } from './theme';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state === 'saving' ? 'Saving…' : state === 'saved' ? 'All changes saved' : state === 'error' ? 'Couldn’t save' : '';
  if (!label) return null;
  return (
    <span style={{ fontSize: 12, color: state === 'error' ? BRAND.pink : BRAND.faint, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
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
  const initialDoc = useMemo(() => migrateWorksheetToV3(value).doc, [value]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustText, setAdjustText] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
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
        onGenerateAI: () => setGenOpen(true),
      }),
    ],
    content: initialDoc as JSONContent,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'ws-doc', spellcheck: 'true' } },
    onUpdate: ({ editor }) => onChange({ version: 3, doc: editor.getJSON() as WorksheetV3['doc'] }),
  });

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

  const runGenerate = useCallback(async () => {
    if (!editor || prompt.trim().length === 0) return;
    setGenerating(true);
    setGenError(null);
    try {
      const { teacherNotes } = await insertGeneratedResource(editor, context, prompt);
      setTeacherNotes(teacherNotes);
      setGenOpen(false);
      setPrompt('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'The generator failed.');
    } finally {
      setGenerating(false);
    }
  }, [editor, prompt, context]);

  const runAdjust = useCallback(async () => {
    if (!editor || adjustText.trim().length === 0) return;
    setAdjusting(true);
    setAdjustError(null);
    try {
      const { teacherNotes, changed } = await adjustSelectionWithAI(editor, context, adjustText);
      if (changed) {
        setTeacherNotes(teacherNotes);
        setAdjustOpen(false);
        setAdjustText('');
      } else {
        setAdjustError('Select some text first, then describe the change.');
      }
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'The adjust request failed.');
    } finally {
      setAdjusting(false);
    }
  }, [editor, adjustText, context]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Chrome — toolbar + save state (never printed) */}
      <div className="ws-no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Toolbar
            editor={editor}
            onInsertImage={pickImage}
            onInsertResource={() => setBankOpen(true)}
            onGenerateAI={() => setGenOpen(true)}
          />
        </div>
        <SaveIndicator state={saveState} />
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

      <BubbleToolbar editor={editor} onAdjustAI={() => setAdjustOpen(true)} />

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFilePicked} />

      {bankOpen ? (
        <ResourceBankModal
          ctx={context}
          vocabulary={vocabulary}
          onClose={() => setBankOpen(false)}
          onAdd={(resource) => addFromBank(resource)}
        />
      ) : null}

      {genOpen ? (
        <ModalShell onClose={() => (generating ? null : setGenOpen(false))}>
          <AiComposer
            prompt={prompt}
            onPromptChange={setPrompt}
            onGenerate={runGenerate}
            onCancel={() => setGenOpen(false)}
            generating={generating}
            error={genError}
          />
        </ModalShell>
      ) : null}

      {adjustOpen ? (
        <ModalShell onClose={() => (adjusting ? null : setAdjustOpen(false))}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 460, maxWidth: '92vw' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, marginBottom: 4 }}>Adjust with AI</div>
            <div style={{ fontSize: 12.5, color: BRAND.faint, marginBottom: 12 }}>
              The selected text will be rewritten with your instruction.
            </div>
            <textarea
              rows={3}
              value={adjustText}
              onChange={(ev) => setAdjustText(ev.target.value)}
              disabled={adjusting}
              placeholder="e.g. make it simpler, add a word bank, shorten it"
              dir="auto"
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, border: '1px solid #CFE6E0', borderRadius: 10, padding: '10px 12px', outline: 'none', resize: 'vertical' }}
            />
            {adjustError ? <div style={{ marginTop: 8, fontSize: 12.5, color: BRAND.pink }}>{adjustError}</div> : null}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="button" onClick={runAdjust} disabled={adjusting || adjustText.trim().length === 0} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: BRAND.teal, border: 'none', padding: '10px 18px', borderRadius: 10, cursor: adjusting ? 'default' : 'pointer', opacity: adjusting || adjustText.trim().length === 0 ? 0.6 : 1 }}>
                {adjusting ? 'Adjusting…' : 'Apply'}
              </button>
              <button type="button" onClick={() => setAdjustOpen(false)} disabled={adjusting} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#5C544E', background: 'none', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

/** A centred modal backdrop shared by the generate + adjust dialogs. */
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,22,16,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ borderRadius: 16, overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
