'use client';

// A "Free block" exercise: the teacher's own writing surface. It opens at a
// choice state (Write it yourself · Insert image · Generate with AI); writing and
// generation both land in the same tiptap editor (the preserved rich-text
// surface, restyled to the mockup's Word-like document). Image insert performs a
// real Storage upload; Generate calls /api/generate-resource and parses the
// markdown result into the editor. The block's document is lifted to the parent
// on every change for autosave into lesson_plans.worksheet.

import { useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { WorksheetFreeBlock, WorksheetDoc } from '@/types/lesson';
import type { HTMLAttributes } from 'react';
import { worksheetEditorExtensions } from './editorExtensions';
import { WordToolbar } from './WordToolbar';
import { AiComposer } from './AiComposer';
import { BlockBar } from './BlockBar';
import type { WorksheetContext } from './context';
import { markdownToHtml } from '@/lib/editor/markdown';
import { uploadWorksheetImageAction } from '@/lib/actions/worksheet';
import {
  requestGeneratedResource,
  GenerateResourceRequestError,
} from '@/lib/editor/generate-resource-client';

type View = 'blank' | 'compose' | 'doc';

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
  onDelete,
  onDuplicate,
  dragHandleProps,
}: {
  block: WorksheetFreeBlock;
  index: number;
  ctx: WorksheetContext;
  onChange: (doc: WorksheetDoc, fromAI: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
}) {
  const [view, setView] = useState<View>(block.doc ? 'doc' : 'blank');
  // fromAI is tracked in a ref too, so the editor's onUpdate (a stable closure)
  // always lifts the current value rather than a stale one.
  const fromAIRef = useRef(block.fromAI);
  const [fromAI, setFromAI] = useState(block.fromAI);

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: worksheetEditorExtensions(),
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
      e.target.value = ''; // allow re-selecting the same file later
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
          setGenError(res.error ?? 'Could not upload the image.');
        }
      } finally {
        setUploading(false);
      }
    },
    [editor],
  );

  const runGenerate = useCallback(async () => {
    if (!editor || prompt.trim().length === 0) return;
    setGenerating(true);
    setGenError(null);
    try {
      const result = await requestGeneratedResource(ctx, prompt.trim());
      const html = `<h1>${result.title.replace(/</g, '&lt;')}</h1>${markdownToHtml(result.body)}`;
      setFrom(true);
      // setContent's second arg (emitUpdate) is false, so lift the doc explicitly.
      editor.commands.setContent(html, false);
      setView('doc');
      onChange(editor.getJSON() as WorksheetDoc, true);
    } catch (err) {
      setGenError(
        err instanceof GenerateResourceRequestError ? err.message : 'Generation failed. Try again.',
      );
    } finally {
      setGenerating(false);
    }
  }, [editor, prompt, ctx, onChange, setFrom]);

  const toCompose = useCallback(() => {
    setGenError(null);
    setView('compose');
  }, []);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
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
        index={index}
        badge={{ text: 'Free block', variant: 'free' }}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        dragHandleProps={dragHandleProps}
      />

      {editor ? (
        <WordToolbar editor={editor} onInsertImage={pickImage} onGenerate={toCompose} />
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFilePicked} />

      {/* CHOICE STATE */}
      {view === 'blank' ? (
        <div style={{ background: '#fff', padding: '64px 48px', minHeight: 372, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <span style={{ width: 54, height: 54, borderRadius: 14, background: '#F3ECE2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#A79E94" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7V5h16v2M9 5v14M7 19h4" />
            </svg>
          </span>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#5C544E' }}>Start your exercise</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" onClick={goWrite} style={choiceBtn}>
              <PenIcon /> Write it yourself
            </button>
            <button type="button" onClick={pickImage} disabled={uploading} style={choiceBtn}>
              <ImageIcon /> {uploading ? 'Uploading…' : 'Insert image'}
            </button>
            <button type="button" onClick={toCompose} style={{ ...choiceBtn, color: '#fff', background: '#1F7A6C', border: 'none', boxShadow: '0 6px 16px -8px rgba(31,122,108,0.6)' }}>
              <Sparkle /> Generate with AI
            </button>
          </div>
          {genError ? <div style={{ fontSize: 12.5, color: '#B62A5C' }}>{genError}</div> : null}
        </div>
      ) : null}

      {/* AI COMPOSER */}
      {view === 'compose' ? (
        <AiComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          onGenerate={runGenerate}
          onCancel={() => setView('blank')}
          generating={generating}
          error={genError}
        />
      ) : null}

      {/* DOCUMENT */}
      <div style={{ background: '#fff', padding: '30px 48px 38px', minHeight: 372, display: view === 'doc' ? 'block' : 'none' }}>
        {fromAI ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#186155', background: '#E4F0ED', border: '1px solid #CFE6E0', borderRadius: 6, padding: '4px 9px', marginBottom: 14 }}>
            <Sparkle /> Generated with AI
          </div>
        ) : null}
        {uploading ? (
          <div style={{ fontSize: 12.5, color: '#8A8178', marginBottom: 10 }}>Uploading image…</div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

const choiceBtn: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: '#2A2422',
  background: '#fff',
  border: '1px solid #DDD4C8',
  padding: '11px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
};
