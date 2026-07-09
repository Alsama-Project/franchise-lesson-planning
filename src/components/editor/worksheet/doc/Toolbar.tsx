'use client';

// The persistent top toolbar for the document editor. Curated controls only:
// block style (Heading/Subheading/Body), bold/italic/underline, the three lists,
// alignment, link, brand colour, insert image / resource / generated resource, and
// undo/redo (native TipTap history). No font or arbitrary size picker.

import type { Editor } from '@tiptap/core';
import { useEditorTick } from './useEditorTick';
import { BRAND } from './theme';
import { TBtn, TSep, BlockStylePicker, ColourPicker, toggleLink } from './toolbarControls';

export function Toolbar({
  editor,
  onInsertImage,
  onInsertResource,
  onGenerateAI,
}: {
  editor: Editor | null;
  onInsertImage: () => void;
  onInsertResource: () => void;
  onGenerateAI: () => void;
}) {
  useEditorTick(editor);
  if (!editor) return null;
  const e = editor;

  return (
    <div
      className="ws-no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        padding: '6px 10px',
        background: '#FBF8F3',
        border: '1px solid #EFE7DA',
        borderRadius: 12,
      }}
    >
      <TBtn title="Undo" onClick={() => e.chain().focus().undo().run()} disabled={!e.can().undo()}>
        ↶
      </TBtn>
      <TBtn title="Redo" onClick={() => e.chain().focus().redo().run()} disabled={!e.can().redo()}>
        ↷
      </TBtn>
      <TSep />

      <BlockStylePicker editor={e} />
      <TSep />

      <TBtn title="Bold (Ctrl/Cmd-B)" active={e.isActive('bold')} onClick={() => e.chain().focus().toggleBold().run()}>
        <b>B</b>
      </TBtn>
      <TBtn title="Italic (Ctrl/Cmd-I)" active={e.isActive('italic')} onClick={() => e.chain().focus().toggleItalic().run()}>
        <i>I</i>
      </TBtn>
      <TBtn title="Underline (Ctrl/Cmd-U)" active={e.isActive('underline')} onClick={() => e.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: 'underline' }}>U</span>
      </TBtn>
      <ColourPicker editor={e} />
      <TSep />

      <TBtn title="Bulleted list" active={e.isActive('bulletList')} onClick={() => e.chain().focus().toggleBulletList().run()}>
        ••
      </TBtn>
      <TBtn title="Numbered list" active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()}>
        1.
      </TBtn>
      <TBtn title="Checklist" active={e.isActive('taskList')} onClick={() => e.chain().focus().toggleTaskList().run()}>
        ☑
      </TBtn>
      <TSep />

      <TBtn title="Align left" active={e.isActive({ textAlign: 'left' })} onClick={() => e.chain().focus().setTextAlign('left').run()}>
        ⇤
      </TBtn>
      <TBtn title="Align centre" active={e.isActive({ textAlign: 'center' })} onClick={() => e.chain().focus().setTextAlign('center').run()}>
        ↔
      </TBtn>
      <TBtn title="Align right" active={e.isActive({ textAlign: 'right' })} onClick={() => e.chain().focus().setTextAlign('right').run()}>
        ⇥
      </TBtn>
      <TBtn title="Link (Ctrl/Cmd-K)" active={e.isActive('link')} onClick={() => toggleLink(e)}>
        🔗
      </TBtn>
      <TSep />

      <TBtn title="Insert image" onClick={onInsertImage}>
        🖼
      </TBtn>
      <TBtn title="Insert resource from bank" onClick={onInsertResource}>
        📎
      </TBtn>
      <button
        type="button"
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={onGenerateAI}
        title="Generate with AI"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 12px',
          marginLeft: 2,
          borderRadius: 8,
          border: 'none',
          background: BRAND.teal,
          color: '#fff',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ✦ Generate
      </button>
    </div>
  );
}
