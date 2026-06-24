'use client';

// A freely-positioned rich-text box. It hosts its own tiptap editor (the same
// extension set as Free blocks) and registers as the chrome toolbar's active
// block on focus, so Paragraph / B / I / U / colour / align / lists all apply
// inside it. Minimal style: a border on/off toggle and a transparent/white fill.

import { useEffect, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { FloatingTextBox as FloatingTextBoxModel, WorksheetDoc } from '@/types/lesson';
import { worksheetEditorExtensions } from './editorExtensions';
import { FloatingElementView, type Geom } from './FloatingElementView';
import type { ActiveBlock } from './FreeBlock';

export function FloatingTextBox({
  el,
  selected,
  boxRef,
  blockId,
  insertTextBox,
  insertFloatingImage,
  onSelect,
  onCommit,
  onDelete,
  onRestack,
  onDocChange,
  onStyleChange,
  onActivate,
  onDeactivate,
}: {
  el: FloatingTextBoxModel;
  selected: boolean;
  boxRef: React.RefObject<HTMLDivElement | null>;
  /** The owning block + its inserters, so the toolbar targets the parent block. */
  blockId: string;
  insertTextBox: () => void;
  insertFloatingImage: () => void;
  onSelect: () => void;
  onCommit: (geom: Geom) => void;
  onDelete: () => void;
  onRestack: (dir: 'forward' | 'backward') => void;
  onDocChange: (doc: WorksheetDoc) => void;
  onStyleChange: (patch: { border?: boolean; fill?: 'transparent' | 'white' }) => void;
  onActivate: (api: ActiveBlock) => void;
  onDeactivate: (id: string) => void;
}) {
  const editor = useEditor({
    extensions: worksheetEditorExtensions(),
    content: (el.doc as JSONContent | null) ?? '',
    immediatelyRender: false,
    editorProps: { attributes: { class: 'worksheet-doc' } },
    onUpdate: ({ editor }) => onDocChange(editor.getJSON() as WorksheetDoc),
  });

  // Register as the toolbar's active context when focused: formatting targets this
  // box's editor, while inserts target the parent block.
  useEffect(() => {
    if (!editor) return;
    const announce = () =>
      onActivate({ activeId: el.id, blockId, editor: editor as Editor, insertTextBox, insertFloatingImage });
    editor.on('focus', announce);
    return () => {
      editor.off('focus', announce);
      onDeactivate(el.id);
    };
  }, [editor, el.id, blockId, insertTextBox, insertFloatingImage, onActivate, onDeactivate]);

  const [hover, setHover] = useState(false);
  const showOutline = selected || hover;

  return (
    <FloatingElementView
      el={el}
      selected={selected}
      boxRef={boxRef}
      resize="box"
      onSelect={onSelect}
      onCommit={onCommit}
      onDelete={onDelete}
      onRestack={onRestack}
      controls={
        <>
          <button
            type="button"
            title={el.border ? 'Border on' : 'Border off'}
            onClick={() => onStyleChange({ border: !el.border })}
            style={toggleBtn(el.border)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray={el.border ? '0' : '3 3'} /></svg>
          </button>
          <button
            type="button"
            title={el.fill === 'white' ? 'White fill' : 'Transparent fill'}
            onClick={() => onStyleChange({ fill: el.fill === 'white' ? 'transparent' : 'white' })}
            style={toggleBtn(el.fill === 'white')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={el.fill === 'white' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 3l7 7-7 11-7-11z" /></svg>
          </button>
        </>
      }
    >
      {/* The box itself = the draggable frame (cursor: move on the padding/border,
          inherited from FloatingElementView). The inner text area stops the drag
          so clicking into it edits, like Word. */}
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: 10,
          background: el.fill === 'white' ? '#fff' : 'transparent',
          border: el.border ? '1.5px solid #C9B89F' : showOutline ? '1px dashed #CFE6E0' : '1px dashed transparent',
          borderRadius: 6,
        }}
      >
        <div
          className="ws-tb-edit"
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          style={{ height: '100%', overflow: 'auto', cursor: 'text' }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </FloatingElementView>
  );
}

function toggleBtn(active: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    background: active ? '#E4F0ED' : 'transparent',
    color: active ? '#186155' : '#5C544E',
  };
}
