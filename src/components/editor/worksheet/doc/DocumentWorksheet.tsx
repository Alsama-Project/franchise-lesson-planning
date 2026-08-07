'use client';

// The continuous-document worksheet editor (v3). ONE document-wide TipTap editor
// (native history) renders a white A4-width page on a soft-grey canvas: a single
// masthead at the top, the flowing body, and a footer. It re-houses every v2
// capability as inline behaviour — image insert/resize/crop (ResizableImage), AI
// generation (inline-at-caret generate + selection "Adjust"), bank-resource
// insertion, the slash menu, selection bubble, and the persistent toolbar — and
// autosaves the v3 envelope through the parent's debounced saveWorksheet.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import { useTranslations } from 'next-intl';
import type { WorksheetV3 } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { migrateWorksheetToV3 } from '@/lib/editor/worksheet-migrate';
import { toPlainJSON } from '@/lib/editor/plain-json';
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
import { worksheetArtifactText } from '@/lib/editor/worksheet-content-locale';
import { BRAND, PAGE_WIDTH, PAGE_PAD_X, PAGE_PAD_TOP, PAGE_PAD_BOTTOM, type SaveState } from './theme';
import { ZoomPage } from './ZoomPage';
import { ExerciseGutter, EXERCISE_GUTTER_REDRAW, type ExerciseGutterStorage } from './nodes/ExerciseGutter';
import { SCAFFOLD_LOCK_BYPASS } from './nodes/ScaffoldHeadingLock';
import { applyExerciseSplice, buildExerciseNodes, type ExerciseRegenPayload } from './exerciseSplice';
import type { RegenPhase } from '../exercises/useWorksheetGeneration';
import { nodeExerciseId } from '@/lib/ai/worksheet-assemble';
import { requestImage } from '@/lib/worksheet/generate-client';
import type { RegenerateImageArgs } from '../resizableImage';
import { WorksheetFramePage } from './WorksheetFramePage';
import { PrintPageStyle } from './PrintPageStyle';
import type { FramePlaceholders } from '@/lib/worksheet-frame/frame';

export type { SaveState } from './theme';

/** Imperative handle the generating pane uses to write the WHOLE document into the
 *  live editor — the initial build and Regenerate-all. It must go through the editor
 *  (not the `value` prop), because the seed-once editor never re-reads `value`. */
export interface DocumentWorksheetHandle {
  applyFullDoc: (doc: WorksheetV3) => void;
}

/** Which inline AI popover is open, and where it is anchored (viewport coords). */
type PromptState = { mode: 'generate' | 'adjust'; anchor: Anchor } | null;

interface DocumentWorksheetProps {
  /** The stored worksheet column (any legacy or v2/v3 shape). */
  value: unknown;
  /** Persist path: lift the full v3 envelope for the parent's debounced autosave.
   *  Fires for BOTH teacher edits and programmatic writes (both must persist). */
  onChange: (worksheet: WorksheetV3) => void;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
  saveState?: SaveState;
  zoom?: number;
  onZoomChange?: (next: number | ((z: number) => number)) => void;
  templateMode?: boolean;
  /** A real teacher edit (never a programmatic setContent / splice). Drives the
   *  "document edited since the last full build" gate on Generate / Regenerate-all. */
  onTeacherEdit?: () => void;
  /** Regenerate one exercise: returns its fresh body to splice into the live editor,
   *  or null on abort. An optional teacher `instruction` steers the regeneration (the
   *  adjust pattern). `onStage` reports the real regenerate stage for the gutter chip's
   *  copy. Presence installs the gutter affordance + splice path. */
  onRegenerateExercise?: (
    exerciseId: string,
    instruction?: string,
    onStage?: (phase: RegenPhase) => void,
  ) => Promise<ExerciseRegenPayload | null>;
}

/** The caret/selection position in viewport coordinates, for anchoring a popover. */
function anchorAt(editor: Editor, pos: number): Anchor {
  const c = editor.view.coordsAtPos(pos);
  return { x: c.left, y: c.bottom + 6 };
}

export const DocumentWorksheet = forwardRef<DocumentWorksheetHandle, DocumentWorksheetProps>(
  function DocumentWorksheet(
    {
      value,
      onChange,
      context,
      vocabulary,
      saveState = 'idle',
      templateMode = false,
      zoom = 1,
      onZoomChange,
      onTeacherEdit,
      onRegenerateExercise,
    },
    ref,
  ) {
  const t = useTranslations('worksheetGen');
  const initialDoc = useMemo(() => normalizeTableColwidths(migrateWorksheetToV3(value).doc), [value]);
  // Content-language strings for hint placeholders. The badge is exposed to CSS as a
  // quoted string; the prompt label seeds the slash-menu authoring flow. Memoised so
  // they stay referentially stable across renders (they only change with the subject
  // language), keeping the editor's callbacks stable.
  const hintBadge = useMemo(() => worksheetArtifactText(context.contentLanguage, 'hintBadge'), [context.contentLanguage]);
  const hintPromptLabel = useMemo(() => worksheetArtifactText(context.contentLanguage, 'hintPrompt'), [context.contentLanguage]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [busy, setBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [teacherNotes, setTeacherNotes] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [spliceError, setSpliceError] = useState<string | null>(null);
  // Ids currently regenerating, for the gutter buttons' disabled/spinner state.
  const [regenBusy, setRegenBusy] = useState<Set<string>>(() => new Set());
  // Per-id live stage copy while regenerating ("Having another go" → "Drawing it again"),
  // driven by the hook's real transitions and shown on the chip in place of "Regenerate".
  const [regenStage, setRegenStage] = useState<Record<string, string>>({});
  // The open "regenerate this exercise" comment popover (optional comment → adjust).
  const [regenPrompt, setRegenPrompt] = useState<{ exerciseId: string; anchor: Anchor } | null>(null);

  // True only while WE mutate the editor (applyFullDoc / splice), so onUpdate can
  // tell a programmatic write from a real teacher edit and not trip the edited-gate.
  const programmatic = useRef(false);
  const onTeacherEditRef = useRef(onTeacherEdit);
  onTeacherEditRef.current = onTeacherEdit;

  // Whether the per-exercise gutter + splice path is wired (never in Template Mode).
  const gutterEnabled = !!onRegenerateExercise && !templateMode;
  const failedText = useMemo(
    () => worksheetArtifactText(context.contentLanguage, 'exerciseFailed'),
    [context.contentLanguage],
  );

  // Per-image regenerate is offered only on the editable generating surface (needs a
  // subject to steer the illustrator, and never in Template Mode). The handler swaps a
  // single slot's image; the exercise text is never touched.
  const imageRegenEnabled = !templateMode && !!onRegenerateExercise && !!context.subjectId;
  const handleRegenerateImage = useCallback(
    async ({ slotId, brief, instruction }: RegenerateImageArgs): Promise<string | null> => {
      if (!context.subjectId || !brief) return null;
      const res = await requestImage({
        slot_id: slotId,
        brief,
        lesson_plan_id: context.lessonPlanId,
        subject_id: context.subjectId,
        regenerate: true,
        ...(instruction ? { instruction } : {}),
      });
      if (res.ok) return res.storage_path; // null when the slot is at/over the image cap
      throw new Error(res.error);
    },
    [context.subjectId, context.lessonPlanId],
  );

  const pickImage = useCallback(() => fileInputRef.current?.click(), []);

  const editor = useEditor({
    extensions: [
      ...worksheetDocExtensions(context.contentLanguage, {
        onRegenerateImage: imageRegenEnabled ? handleRegenerateImage : undefined,
      }),
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
        templateMode,
        hintPromptLabel,
      }),
      // The per-exercise Regenerate gutter — installed only when the host wires a
      // regenerate handler (the generating pane). Never in the read-only/print bundle
      // or Template Mode, so those surfaces keep exactly `worksheetDocExtensions`.
      ...(gutterEnabled ? [ExerciseGutter] : []),
    ],
    content: initialDoc as JSONContent,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'ws-doc', spellcheck: 'true' } },
    onUpdate: ({ editor }) => {
      // Persist every change (teacher edit AND our own splice / full-doc write) so the
      // one debounce is the single writer. Only a REAL teacher edit trips the gate.
      //
      // `toPlainJSON` is load-bearing, not cosmetic: `getJSON()`'s `attrs` objects have a
      // NULL prototype, which React's Server Actions wire format silently drops as it
      // crosses to `saveWorksheet` (→ `{type:'image'}`, losing storagePath/exerciseId).
      // Normalising to Object.prototype here — at the single point worksheet JSON leaves
      // the editor — is what actually persists images and per-exercise ids. See
      // `toPlainJSON`.
      const doc = toPlainJSON(editor.getJSON()) as WorksheetV3['doc'];
      onChange({ version: 3, doc });
      if (!programmatic.current) onTeacherEditRef.current?.();
    },
  });

  // Write the WHOLE document into the live editor (initial build / Regenerate-all).
  // `emitUpdate: true` runs onUpdate → onChange → the existing debounce persists it;
  // `programmatic` keeps it from tripping the teacher-edited gate.
  useImperativeHandle(
    ref,
    () => ({
      applyFullDoc: (doc: WorksheetV3) => {
        if (!editor) return;
        programmatic.current = true;
        // A single chained transaction: the bypass meta first (so the scaffold-heading
        // lock never rejects a rebuild — the template itself may have changed), then the
        // whole-document replace. Still one writer, through editor.commands.
        editor
          .chain()
          .command(({ tr }) => {
            tr.setMeta(SCAFFOLD_LOCK_BYPASS, true);
            return true;
          })
          .setContent(doc.doc as JSONContent, true)
          .run();
        programmatic.current = false;
      },
    }),
    [editor],
  );

  /** Open the "regenerate this exercise" comment popover, anchored at the exercise's
   *  first node. The comment is OPTIONAL — submitting empty regenerates plainly. */
  const openRegenPrompt = useCallback(
    (exerciseId: string) => {
      if (!editor) return;
      let found: number | null = null;
      let pos = 0;
      editor.state.doc.forEach((node) => {
        if (found === null && nodeExerciseId(node) === exerciseId) found = pos;
        pos += node.nodeSize;
      });
      setSpliceError(null);
      setRegenPrompt({ exerciseId, anchor: anchorAt(editor, found ?? editor.state.selection.head) });
    },
    [editor],
  );

  /** Regenerate one exercise: fetch its fresh body (optionally steered by the teacher's
   *  comment), then splice it into the live editor in place (its old range removed,
   *  teacher content between it preserved). */
  const handleGutterRegen = useCallback(
    async (exerciseId: string, instruction?: string) => {
      if (!editor || !onRegenerateExercise) return;
      setRegenBusy((prev) => {
        if (prev.has(exerciseId)) return prev;
        const next = new Set(prev);
        next.add(exerciseId);
        return next;
      });
      setSpliceError(null);
      try {
        const payload = await onRegenerateExercise(exerciseId, instruction, (phase) =>
          setRegenStage((prev) => ({
            ...prev,
            [exerciseId]: phase === 'image' ? t('progress.regenImage') : t('progress.regenExercise'),
          })),
        );
        if (payload) {
          const nodes = buildExerciseNodes(exerciseId, payload, failedText);
          programmatic.current = true;
          const ok = applyExerciseSplice(editor, exerciseId, nodes, payload.anchor);
          programmatic.current = false;
          if (!ok) setSpliceError(t('regenerateFailed'));
        }
      } catch (err) {
        setSpliceError(err instanceof Error ? err.message : t('regenerateFailed'));
      } finally {
        setRegenBusy((prev) => {
          const next = new Set(prev);
          next.delete(exerciseId);
          return next;
        });
        setRegenStage((prev) => {
          if (!(exerciseId in prev)) return prev;
          const next = { ...prev };
          delete next[exerciseId];
          return next;
        });
      }
    },
    [editor, onRegenerateExercise, failedText, t],
  );

  // Bridge React state into the gutter widget's storage, and force a redraw (a
  // doc-unchanged, meta-only transaction — no autosave) when the busy set changes so
  // the buttons reflect the disabled/spinner state.
  const regenTitle = t('regenerate');
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.exerciseGutter as ExerciseGutterStorage | undefined;
    if (!storage) return; // gutter extension not installed
    // The gutter button opens the comment popover; submitting it runs the regenerate.
    storage.onRegenerate = openRegenPrompt;
    storage.busy = regenBusy;
    storage.title = regenTitle;
    storage.stageById = regenStage;
    // A doc-unchanged transaction so the decorations recompute against the new busy set
    // AND stage copy. `preventUpdate` + no steps ⇒ tiptap's onUpdate never fires (it gates
    // on `docChanged`), so this never persists or trips the teacher-edited gate.
    editor.view.dispatch(editor.state.tr.setMeta(EXERCISE_GUTTER_REDRAW, true).setMeta('preventUpdate', true));
  }, [editor, openRegenPrompt, regenBusy, regenStage, regenTitle]);

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

  // Zoom is offered only when the parent wires it (the generating pane) and never in
  // Template Mode (which has no zoom control and its own enlarged canvas).
  const zoomable = !!onZoomChange && !templateMode;

  // The subject's page frame renders the Alsama page around the editor on the live
  // pane. Off in Template Mode (which authors the doc body, not the page furniture) —
  // there the hand-built DocMasthead/DocFooter scaffold stays. When a frame is active,
  // DocMasthead/DocFooter are DEAD on this surface (the frame supplies that furniture);
  // they are retained, not deleted, because the read-only/template paths still use them.
  const frame = !templateMode ? context.worksheetFrame : null;
  const framePlaceholders = useMemo<FramePlaceholders>(
    () => ({
      subject: context.subjectName,
      year: context.year ?? '',
      theme: context.theme,
      centre: context.centreName,
      objective: context.smarttObjective,
      lesson_key: context.lessonCode,
    }),
    [context.subjectName, context.year, context.theme, context.centreName, context.smarttObjective, context.lessonCode],
  );

  // The editor surface, wrapped only in the hint-badge CSS var (the frame's `.body`
  // supplies padding/min-height; without a frame the `.ws-doc-body` wrapper does).
  const hintBadgeStyle = { ['--ws-hint-badge' as string]: `"${hintBadge.replace(/"/g, '\\"')}"` };

  // The `.ws-doc-page` contents, shared by the zoomed and unzoomed layouts so the two
  // paths can never drift. With a frame: the parsed Alsama page, the editor portalled
  // at its `{{exercises}}` marker. Without: the hand-built masthead/body/footer.
  const pageInner = frame ? (
    <WorksheetFramePage frame={frame} placeholders={framePlaceholders}>
      <div style={hintBadgeStyle}>
        <EditorContent editor={editor} />
      </div>
    </WorksheetFramePage>
  ) : (
    <>
      {/* No page frame → this surface owns the app-default @page (A4, margin 0). The
          frame path never renders this, so a framed printout keeps ONE @page. */}
      <PrintPageStyle />
      <DocMasthead ctx={context} templateMode={templateMode} />
      <div
        className="ws-doc-body"
        style={{ padding: `${PAGE_PAD_TOP}px ${PAGE_PAD_X}px ${PAGE_PAD_BOTTOM}px`, minHeight: 520, ...hintBadgeStyle }}
      >
        <EditorContent editor={editor} />
      </div>
      <DocFooter ctx={context} className="ws-doc-footer-screen ws-no-print" />
      {/* Print-only running footer — inside .ws-print-area so it survives the print
          rules; it flows once at the document end (see .ws-print-footer in globals). */}
      <DocFooter ctx={context} className="ws-print-footer" />
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Chrome — toolbar (never printed) */}
      <div className="ws-no-print" style={{ padding: '8px 10px' }}>
        <Toolbar
          editor={editor}
          onInsertImage={pickImage}
          onInsertResource={() => setBankOpen(true)}
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
      {spliceError ? (
        <div className="ws-no-print" style={{ margin: '0 12px 8px', fontSize: 12.5, color: BRAND.pink }}>{spliceError}</div>
      ) : null}

      {/* Canvas — soft grey, scrollable; the white page floats on it. Template Mode
          centres + enlarges it and marks editable regions with dashes (globals.css). */}
      {zoomable ? (
        // Zoom-enabled surface: ZoomPage owns the canvas + scroll sizer and scales
        // the `.ws-doc-page` itself (never an ancestor — see ZoomPage / print rules).
        <ZoomPage
          zoom={zoom}
          onZoomChange={onZoomChange!}
          canvasClassName="ws-doc-canvas"
          canvasStyle={{ flex: 1, minHeight: 0, overflow: 'auto', background: BRAND.canvas, padding: '28px 20px 60px' }}
          pageClassName="ws-doc-page ws-print-area"
          pageStyle={{ background: '#fff', boxShadow: BRAND.pageShadow, borderRadius: 2 }}
        >
          {pageInner}
        </ZoomPage>
      ) : (
        <div
          className={`ws-doc-canvas${templateMode ? ' ws-template-mode' : ''}`}
          style={{ flex: 1, minHeight: 0, overflow: 'auto', background: BRAND.canvas, padding: '28px 20px 60px' }}
        >
          <div className="ws-doc-page ws-print-area" style={{ width: PAGE_WIDTH, maxWidth: '100%', margin: '0 auto', background: '#fff', boxShadow: BRAND.pageShadow, borderRadius: 2 }}>
            {pageInner}
          </div>
        </div>
      )}

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

      {/* Regenerate-this-exercise comment (optional). Submitting runs the gutter
          regenerate with the comment; the gutter button then shows its spinner. */}
      {regenPrompt ? (
        <InlinePromptPopover
          anchor={regenPrompt.anchor}
          title={t('regenerateExerciseTitle')}
          placeholder={t('regenerateCommentPlaceholder')}
          submitLabel={t('regenerate')}
          allowEmpty
          busy={false}
          error={null}
          onSubmit={(text) => {
            const { exerciseId } = regenPrompt;
            setRegenPrompt(null);
            void handleGutterRegen(exerciseId, text.trim() || undefined);
          }}
          onCancel={() => setRegenPrompt(null)}
        />
      ) : null}
    </div>
  );
  },
);
