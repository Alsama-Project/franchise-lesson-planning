'use client';

// A "Free block" exercise: the teacher's own writing surface. It opens at a
// choice state (Write it yourself · Insert image · Generate with AI); writing and
// generation both land in the same tiptap editor (the preserved rich-text
// surface). Image insert performs a real Storage upload; Generate calls
// /api/generate-resource and parses the markdown result into the editor.
//
// The block is the CONTAINER: its flowing rich text AND any floating elements
// (text boxes / images) are owned by and clamped to this block. The floating
// layer is rendered inside the block's content box (its positioning context), so
// nothing renders outside the block and deleting the block deletes everything in
// it. The block's document and elements are lifted to the parent for autosave.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type {
  FloatingElement,
  FloatingImage,
  WorksheetFreeBlock,
  WorksheetDoc,
} from '@/types/lesson';
import type { HTMLAttributes } from 'react';
import { worksheetEditorExtensions } from './editorExtensions';
import type { FloatImageInfo } from './resizableImage';
import { AiComposer } from './AiComposer';
import { AdjustBar } from './AdjustBar';
import { BlockBar } from './BlockBar';
import { ExerciseHeading } from './ExerciseHeading';
import { FloatingLayer } from './FloatingLayer';
import type { ScreenRect } from './FloatingElementView';
import type { WorksheetContext } from './context';
import { markdownToHtml, docToMarkdown, escapeHtml } from '@/lib/editor/markdown';
import { uploadWorksheetImageAction } from '@/lib/actions/worksheet';
import { clampGeom, newFloatingImage, newTextBox, nextZ, restackElements } from '@/lib/editor/worksheet';
import {
  requestGeneratedResource,
  GenerateResourceRequestError,
} from '@/lib/editor/generate-resource-client';

type View = 'blank' | 'compose' | 'doc';

const MIN_TEXTBOX = { w: 120, h: 56 };
const MIN_IMAGE = { w: 48, h: 48 };

// Resting minimum for a block's document area: enough for the "Exercise N"
// heading plus a line or two. The block grows past this with its content.
const DOC_MIN_HEIGHT = 96;

/**
 * The active context the chrome toolbar formats / inserts into. `editor` is the
 * focused editor (a block's doc or one of its text boxes); `blockId` is the
 * owning Free block (the insert target); `activeId` distinguishes which surface
 * is focused so deactivation is precise.
 */
export interface ActiveBlock {
  activeId: string;
  blockId: string;
  editor: Editor;
  insertTextBox: () => void;
  insertFloatingImage: () => void;
}

/** Natural size of a freshly inserted floating image. */
function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 320, h: img.naturalHeight || 240 });
    img.onerror = () => resolve({ w: 320, h: 240 });
    img.src = src;
  });
}

function PenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function Sparkle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
    </svg>
  );
}

export function FreeBlock({
  block,
  index,
  ctx,
  onChange,
  onElementsChange,
  onDelete,
  onDuplicate,
  onActivate,
  onDeactivate,
  selectedElementId,
  onSelectElement,
  onElementDrop,
  registerBox,
  dragHandleProps,
}: {
  block: WorksheetFreeBlock;
  index: number;
  ctx: WorksheetContext;
  onChange: (doc: WorksheetDoc, fromAI: boolean) => void;
  /** Lift this block's floating elements for autosave. */
  onElementsChange: (blockId: string, elements: FloatingElement[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Register this block (or one of its text boxes) as the toolbar's target. */
  onActivate: (api: ActiveBlock) => void;
  /** Clear the active context for `activeId` when that surface unmounts. */
  onDeactivate: (activeId: string) => void;
  /** The currently selected element id across the worksheet (or null). */
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  /** A move ended — re-home the element (possibly into a different block). */
  onElementDrop: (fromBlockId: string, element: FloatingElement | null, rect: ScreenRect) => void;
  /** Register this block's content box for cross-block drop hit-testing. */
  registerBox: (blockId: string, el: HTMLDivElement | null) => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
}) {
  const t = useTranslations('worksheet');
  const hasContent = Boolean(block.doc) || block.elements.length > 0;
  const [view, setView] = useState<View>(hasContent ? 'doc' : 'blank');

  // The block's resting height tracks its content: the flowing tiptap doc grows
  // naturally, and the (absolutely-positioned) floating layer can't push layout,
  // so we reserve just enough room to contain the lowest floating element. With
  // no floating elements the block stays at a small sensible minimum, so a
  // near-empty exercise is short instead of imposing a large fixed height.
  const floatBottom = block.elements.reduce((m, el) => Math.max(m, el.y + el.h), 0);
  const docMinHeight = floatBottom > 0 ? Math.ceil(floatBottom + 24) : DOC_MIN_HEIGHT;
  const fromAIRef = useRef(block.fromAI);
  const [fromAI, setFromAI] = useState(block.fromAI);

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // ── Generated-doc affordances: teacher-notes tip + stateless Adjust ─────────
  // `teacherNotes` is shown only as a dismissible tip — it is NEVER written into
  // the worksheet doc and never prints. `preAdjust` holds the one-step undo
  // snapshot (the doc + notes as they were before the last adjustment).
  const [teacherNotes, setTeacherNotes] = useState<string | null>(null);
  const [notesDismissed, setNotesDismissed] = useState(false);
  const [adjustText, setAdjustText] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [preAdjust, setPreAdjust] = useState<{ doc: JSONContent; notes: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const floatImgInputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Latest elements, read by the stable insert / float closures captured by the
  // editor extension and the active-block api.
  const elementsRef = useRef(block.elements);
  useEffect(() => {
    elementsRef.current = block.elements;
  }, [block.elements]);

  const commitElements = useCallback(
    (next: FloatingElement[]) => onElementsChange(block.id, next),
    [block.id, onElementsChange],
  );

  const boxSize = useCallback(() => {
    const b = boxRef.current;
    return { w: b?.clientWidth || 590, h: b?.clientHeight || 372 };
  }, []);

  const cascadeGeom = useCallback(
    (w: number, h: number, min: { w: number; h: number }) => {
      const els = elementsRef.current;
      const off = 24 + (els.length % 5) * 18;
      // Clamp against a box tall enough to hold the new element at full size even
      // when the block is currently short — the block then grows to contain it
      // (its min-height tracks the lowest element). Without this, inserting into
      // a near-empty block would shrink the element to the tiny current height.
      const box = boxSize();
      const room = { w: box.w, h: Math.max(box.h, off + h + 40) };
      return clampGeom({ x: off, y: off, w, h }, room, min);
    },
    [boxSize],
  );

  const insertTextBox = useCallback(() => {
    const els = elementsRef.current;
    const g = cascadeGeom(280, 120, MIN_TEXTBOX);
    const el = { ...newTextBox(g.x, g.y, nextZ(els)), ...g };
    setView('doc');
    commitElements([...els, el]);
    onSelectElement(el.id);
  }, [cascadeGeom, commitElements, onSelectElement]);

  const insertFloatingImage = useCallback(() => floatImgInputRef.current?.click(), []);

  const onFloatImgPicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadWorksheetImageAction(fd);
      if (!res.ok || !res.url) return;
      const natural = await loadImageSize(res.url);
      const box = boxSize();
      const w = Math.min(natural.w, 360, box.w);
      const h = w * (natural.h / natural.w);
      const els = elementsRef.current;
      // cascadeGeom already clamps against a box grown to fit the image, so the
      // block can size up to contain it — don't re-clamp to the current height.
      const g = cascadeGeom(w, h, MIN_IMAGE);
      const el = newFloatingImage(res.url, file.name, g, nextZ(els));
      setView('doc');
      commitElements([...els, el]);
      onSelectElement(el.id);
    },
    [boxSize, cascadeGeom, commitElements, onSelectElement],
  );

  // Convert an inline image (in this block's doc) to a free floating element in
  // the same block. The ResizableImage NodeView deletes the inline node itself.
  const handleFloatInline = useCallback(
    (info: FloatImageInfo) => {
      const box = boxSize();
      const w = Math.min(info.w || 320, box.w);
      const h = info.h && info.w ? w * (info.h / info.w) : w * 0.66;
      const els = elementsRef.current;
      const g = cascadeGeom(w, h, MIN_IMAGE);
      const el = newFloatingImage(info.src, info.alt, g, nextZ(els));
      commitElements([...els, el]);
      onSelectElement(el.id);
    },
    [boxSize, cascadeGeom, commitElements, onSelectElement],
  );

  const editor = useEditor({
    // handleFloatInline only runs from a NodeView button (an event), never during
    // render, and is stable — reading the latest elements via a ref inside it is safe.
    // eslint-disable-next-line react-hooks/refs
    extensions: worksheetEditorExtensions({ onFloatImage: handleFloatInline }),
    content: (block.doc as JSONContent | null) ?? '',
    immediatelyRender: false,
    editorProps: { attributes: { class: 'worksheet-doc' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as WorksheetDoc, fromAIRef.current),
  });

  const setFrom = useCallback((value: boolean) => {
    fromAIRef.current = value;
    setFromAI(value);
  }, []);

  const goWrite = useCallback(() => {
    setView('doc');
    setTimeout(() => editor?.chain().focus().run(), 0);
  }, [editor]);

  const pickImage = useCallback(() => fileInputRef.current?.click(), []);

  const onFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !editor) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await uploadWorksheetImageAction(fd);
        if (res.ok && res.url) {
          setView('doc');
          editor.chain().focus().setImage({ src: res.url, alt: file.name }).run();
        } else {
          setGenError(res.error ?? t('free.uploadError'));
        }
      } finally {
        setUploading(false);
      }
    },
    [editor, t],
  );

  const runGenerate = useCallback(async () => {
    if (!editor || prompt.trim().length === 0) return;
    setGenerating(true);
    setGenError(null);
    try {
      const result = await requestGeneratedResource(ctx, prompt.trim());
      const html = `<h1>${escapeHtml(result.title)}</h1>${markdownToHtml(result.body)}`;
      setFrom(true);
      editor.commands.setContent(html, false);
      setTeacherNotes(result.teacher_notes);
      setNotesDismissed(false);
      setPreAdjust(null); // fresh generate clears any earlier undo snapshot
      setView('doc');
      onChange(editor.getJSON() as WorksheetDoc, true);
    } catch (err) {
      setGenError(
        err instanceof GenerateResourceRequestError ? err.message : t('free.generateError'),
      );
    } finally {
      setGenerating(false);
    }
  }, [editor, prompt, ctx, onChange, setFrom, t]);

  // Stateless adjust: send the doc AS IT STANDS (markdown) + the refinement; the
  // endpoint returns the full updated resource, which replaces the editor content.
  // Because the base is the current content, hand-edits and adjustments compose.
  const runAdjust = useCallback(
    async (refinement: string) => {
      const change = refinement.trim();
      if (!editor || change.length === 0 || adjusting) return;
      const snapshotDoc = editor.getJSON() as JSONContent;
      const snapshotNotes = teacherNotes;
      setAdjusting(true);
      setAdjustError(null);
      try {
        const currentMarkdown = docToMarkdown(snapshotDoc);
        const result = await requestGeneratedResource(ctx, '', change, currentMarkdown);
        const html = `<h1>${escapeHtml(result.title)}</h1>${markdownToHtml(result.body)}`;
        setPreAdjust({ doc: snapshotDoc, notes: snapshotNotes }); // enable one-step undo
        setFrom(true);
        editor.commands.setContent(html, false);
        setTeacherNotes(result.teacher_notes);
        setNotesDismissed(false);
        setAdjustText('');
        onChange(editor.getJSON() as WorksheetDoc, true);
      } catch (err) {
        setAdjustError(
          err instanceof GenerateResourceRequestError ? err.message : t('free.adjustError'),
        );
      } finally {
        setAdjusting(false);
      }
    },
    [editor, adjusting, teacherNotes, ctx, onChange, setFrom, t],
  );

  const undoAdjust = useCallback(() => {
    if (!editor || !preAdjust) return;
    editor.commands.setContent(preAdjust.doc, false);
    setTeacherNotes(preAdjust.notes);
    setNotesDismissed(false);
    setPreAdjust(null);
    onChange(editor.getJSON() as WorksheetDoc, true);
  }, [editor, preAdjust, onChange]);

  const toCompose = useCallback(() => {
    setGenError(null);
    setView('compose');
  }, []);

  // Register this block's content box so cross-block drops can hit-test it.
  useEffect(() => {
    registerBox(block.id, boxRef.current);
    return () => registerBox(block.id, null);
  }, [block.id, view, registerBox]);

  // Make this block's doc editor the active toolbar target on focus.
  useEffect(() => {
    if (!editor) return;
    const announce = () =>
      onActivate({ activeId: block.id, blockId: block.id, editor, insertTextBox, insertFloatingImage });
    editor.on('focus', announce);
    return () => {
      editor.off('focus', announce);
      onDeactivate(block.id);
    };
  }, [editor, block.id, insertTextBox, insertFloatingImage, onActivate, onDeactivate]);

  // Convert a floating image back to an inline image in this block's doc.
  const makeImageInline = useCallback(
    (el: FloatingImage) => {
      editor
        ?.chain()
        .focus()
        .insertContent({ type: 'image', attrs: { src: el.src, alt: el.alt ?? null, width: Math.round(el.w), align: 'center' } })
        .run();
      commitElements(elementsRef.current.filter((e) => e.id !== el.id));
      onSelectElement(null);
    },
    [editor, commitElements, onSelectElement],
  );

  const elementActions = useMemo(
    () => ({
      onSelect: (id: string | null) => onSelectElement(id),
      onCommit: (id: string, geom: { x: number; y: number; w: number; h: number }) =>
        commitElements(elementsRef.current.map((e) => (e.id === id ? { ...e, ...geom } : e))),
      onMoveEnd: (id: string, rect: ScreenRect) =>
        onElementDrop(block.id, elementsRef.current.find((e) => e.id === id) ?? null, rect),
      onDelete: (id: string) => {
        commitElements(elementsRef.current.filter((e) => e.id !== id));
        onSelectElement(null);
      },
      onRestack: (id: string, dir: 'forward' | 'backward') =>
        commitElements(restackElements(elementsRef.current, id, dir)),
      onDocChange: (id: string, doc: WorksheetDoc) =>
        commitElements(
          elementsRef.current.map((e) => (e.id === id && e.kind === 'textbox' ? { ...e, doc } : e)),
        ),
      onStyleChange: (id: string, patch: { border?: boolean; fill?: 'transparent' | 'white' }) =>
        commitElements(
          elementsRef.current.map((e) => (e.id === id && e.kind === 'textbox' ? { ...e, ...patch } : e)),
        ),
      onMakeInline: (el: FloatingImage) => makeImageInline(el),
      onActivate,
      onDeactivate,
    }),
    [commitElements, onSelectElement, makeImageInline, onActivate, onDeactivate, onElementDrop, block.id],
  );

  // Activate this block (without focusing text) when its chrome/empty area is
  // clicked, and clear any element selection — clicking the block never spawns an
  // element, it only makes the block the insert target.
  const activateBlock = useCallback(() => {
    if (editor) {
      onActivate({ activeId: block.id, blockId: block.id, editor, insertTextBox, insertFloatingImage });
    }
    onSelectElement(null);
  }, [editor, block.id, insertTextBox, insertFloatingImage, onActivate, onSelectElement]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={activateBlock}
      style={{
        border: '2px solid #B62A5C',
        borderRadius: 14,
        background: '#fff',
        boxShadow: '0 0 0 4px rgba(182,42,92,0.10)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <BlockBar
        badge={{ text: t('block.freeBadge'), variant: 'free' }}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        dragHandleProps={dragHandleProps}
      />

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFilePicked} />
      <input ref={floatImgInputRef} type="file" accept="image/*" hidden onChange={onFloatImgPicked} />

      {/* CHOICE STATE (only while the block is truly empty) */}
      {view === 'blank' ? (
        <div style={{ background: '#fff', padding: '18px 36px 28px' }}>
          <ExerciseHeading index={index} />
          <div style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#F3ECE2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A79E94" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7V5h16v2M9 5v14M7 19h4" />
              </svg>
            </span>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#5C544E' }}>{t('free.startExercise')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" onClick={goWrite} style={choiceBtn}>
                <PenIcon /> {t('free.writeYourself')}
              </button>
              <button type="button" onClick={pickImage} disabled={uploading} style={choiceBtn}>
                <ImageIcon /> {uploading ? t('free.uploading') : t('free.insertImage')}
              </button>
              <button type="button" onClick={toCompose} style={{ ...choiceBtn, color: '#fff', background: '#1F7A6C', border: 'none', boxShadow: '0 6px 16px -8px rgba(31,122,108,0.6)' }}>
                <Sparkle /> {t('free.generateWithAi')}
              </button>
            </div>
            {genError ? <div style={{ fontSize: 12.5, color: '#B62A5C' }}>{genError}</div> : null}
          </div>
        </div>
      ) : null}

      {/* AI COMPOSER */}
      {view === 'compose' ? (
        <AiComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          onGenerate={runGenerate}
          onCancel={() => setView(hasContent ? 'doc' : 'blank')}
          generating={generating}
          error={genError}
        />
      ) : null}

      {/* DOCUMENT + contained floating layer (the block is the positioning context) */}
      <div
        style={{ position: 'relative', background: '#fff', padding: '18px 36px 28px', minHeight: docMinHeight, display: view === 'doc' ? 'block' : 'none' }}
      >
        <ExerciseHeading index={index} />
        {fromAI ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#186155', background: '#E4F0ED', border: '1px solid #CFE6E0', borderRadius: 6, padding: '4px 9px', marginBottom: 14 }}>
            <Sparkle /> {t('free.generatedWithAi')}
          </div>
        ) : null}

        {/* Teacher-notes tip — guidance for the teacher only. Never inserted into
            the student worksheet and never printed (it lives in component state). */}
        {fromAI && teacherNotes && !notesDismissed ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: '#FBF6EF', border: '1px solid #EFE1CF', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            <span style={{ flexShrink: 0, marginTop: 1, color: '#B07A2E', display: 'inline-flex' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
            </span>
            <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5, color: '#6B5A3E' }}>
              <span style={{ fontWeight: 700 }}>{t('free.teacherNoteLabel')}</span> {teacherNotes}
            </div>
            <button
              type="button"
              onClick={() => setNotesDismissed(true)}
              title={t('free.dismiss')}
              style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#9A8A6E', lineHeight: 0, padding: 2 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ) : null}

        {uploading ? (
          <div style={{ fontSize: 12.5, color: '#8A8178', marginBottom: 10 }}>{t('free.uploadingImage')}</div>
        ) : null}
        {/* AI-generated / teacher-authored worksheet content self-orients (LTR or
            RTL) from its first strong character, independent of the UI chrome. */}
        <div dir="auto">
          <EditorContent editor={editor} />
        </div>

        {/* Adjust — stateless AI iteration on a generated doc (presets + undo). */}
        {fromAI ? (
          <AdjustBar
            instruction={adjustText}
            onInstructionChange={setAdjustText}
            onAdjust={runAdjust}
            adjusting={adjusting}
            error={adjustError}
            canUndo={preAdjust !== null}
            onUndo={undoAdjust}
          />
        ) : null}

        <FloatingLayer
          elements={block.elements}
          selectedId={selectedElementId}
          actions={elementActions}
          boxRef={boxRef}
          blockId={block.id}
          insertTextBox={insertTextBox}
          insertFloatingImage={insertFloatingImage}
        />
      </div>
    </div>
  );
}

const choiceBtn: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 11.5,
  fontWeight: 600,
  color: '#2A2422',
  background: '#fff',
  border: '1px solid #DDD4C8',
  padding: '8px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
