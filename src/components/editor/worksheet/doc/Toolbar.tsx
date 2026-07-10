'use client';

// The persistent top toolbar for the document editor. Standard word-processor
// icons (lucide-react), a tooltip on every control, grouped with subtle separators.
// Order (left→right): undo/redo | style dropdown | B/I/U | colour | align L/C/R/J |
// bullet/numbered/checklist | outdent/indent | link/image/table/resource-bank |
// (pushed right) Generate + save-state indicator. No font or arbitrary size picker.

import type { CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListChecks,
  IndentDecrease,
  IndentIncrease,
  Link as LinkIcon,
  ImagePlus,
  Table as TableIcon,
  Library,
  Sparkles,
} from 'lucide-react';
import { useEditorTick } from './useEditorTick';
import { BRAND, type SaveState } from './theme';
import { TBtn, TSep, BlockStylePicker, ColourPicker, toggleLink } from './toolbarControls';

const ICON = 17;

/** Shared teal call-to-action style for the Resource bank + Generate pair. */
const tealButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 30,
  padding: '0 13px',
  borderRadius: 8,
  border: 'none',
  background: BRAND.teal,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state === 'saving' ? 'Saving…' : state === 'saved' ? 'All changes saved' : state === 'error' ? 'Couldn’t save' : '';
  if (!label) return null;
  return (
    <span style={{ fontSize: 12, color: state === 'error' ? BRAND.pink : BRAND.faint, whiteSpace: 'nowrap', paddingInline: 4 }}>
      {label}
    </span>
  );
}

export function Toolbar({
  editor,
  onInsertImage,
  onInsertResource,
  onGenerateAI,
  saveState = 'idle',
}: {
  editor: Editor | null;
  onInsertImage: () => void;
  onInsertResource: () => void;
  onGenerateAI: () => void;
  saveState?: SaveState;
}) {
  useEditorTick(editor);
  if (!editor) return null;
  const e = editor;

  const inList = e.isActive('listItem') || e.isActive('taskItem');
  const indent = () => {
    if (e.isActive('taskItem')) e.chain().focus().sinkListItem('taskItem').run();
    else if (e.isActive('listItem')) e.chain().focus().sinkListItem('listItem').run();
    else e.chain().focus().indentBlock().run();
  };
  const outdent = () => {
    if (e.isActive('taskItem')) e.chain().focus().liftListItem('taskItem').run();
    else if (e.isActive('listItem')) e.chain().focus().liftListItem('listItem').run();
    else e.chain().focus().outdentBlock().run();
  };

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
      <TBtn title="Undo (Ctrl/Cmd-Z)" onClick={() => e.chain().focus().undo().run()} disabled={!e.can().undo()}>
        <Undo2 size={ICON} />
      </TBtn>
      <TBtn title="Redo (Ctrl/Cmd-Shift-Z)" onClick={() => e.chain().focus().redo().run()} disabled={!e.can().redo()}>
        <Redo2 size={ICON} />
      </TBtn>
      <TSep />

      <BlockStylePicker editor={e} />
      <TSep />

      <TBtn title="Bold (Ctrl/Cmd-B)" active={e.isActive('bold')} onClick={() => e.chain().focus().toggleBold().run()}>
        <Bold size={ICON} />
      </TBtn>
      <TBtn title="Italic (Ctrl/Cmd-I)" active={e.isActive('italic')} onClick={() => e.chain().focus().toggleItalic().run()}>
        <Italic size={ICON} />
      </TBtn>
      <TBtn title="Underline (Ctrl/Cmd-U)" active={e.isActive('underline')} onClick={() => e.chain().focus().toggleUnderline().run()}>
        <Underline size={ICON} />
      </TBtn>
      <ColourPicker editor={e} />
      <TSep />

      <TBtn title="Align left" active={e.isActive({ textAlign: 'left' })} onClick={() => e.chain().focus().setTextAlign('left').run()}>
        <AlignLeft size={ICON} />
      </TBtn>
      <TBtn title="Align centre" active={e.isActive({ textAlign: 'center' })} onClick={() => e.chain().focus().setTextAlign('center').run()}>
        <AlignCenter size={ICON} />
      </TBtn>
      <TBtn title="Align right" active={e.isActive({ textAlign: 'right' })} onClick={() => e.chain().focus().setTextAlign('right').run()}>
        <AlignRight size={ICON} />
      </TBtn>
      <TBtn title="Justify" active={e.isActive({ textAlign: 'justify' })} onClick={() => e.chain().focus().setTextAlign('justify').run()}>
        <AlignJustify size={ICON} />
      </TBtn>
      <TSep />

      <TBtn title="Bulleted list" active={e.isActive('bulletList')} onClick={() => e.chain().focus().toggleBulletList().run()}>
        <List size={ICON} />
      </TBtn>
      <TBtn title="Numbered list" active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={ICON} />
      </TBtn>
      <TBtn title="Checklist" active={e.isActive('taskList')} onClick={() => e.chain().focus().toggleTaskList().run()}>
        <ListChecks size={ICON} />
      </TBtn>
      <TSep />

      <TBtn title="Decrease indent" onClick={outdent}>
        <IndentDecrease size={ICON} />
      </TBtn>
      <TBtn title={inList ? 'Increase indent (nest)' : 'Increase indent'} onClick={indent}>
        <IndentIncrease size={ICON} />
      </TBtn>
      <TSep />

      <TBtn title="Insert link (Ctrl/Cmd-K)" active={e.isActive('link')} onClick={() => toggleLink(e)}>
        <LinkIcon size={ICON} />
      </TBtn>
      <TBtn title="Insert image" onClick={onInsertImage}>
        <ImagePlus size={ICON} />
      </TBtn>
      <TBtn title="Insert table" onClick={() => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon size={ICON} />
      </TBtn>

      {/* pushed right — the Resource bank + Generate pair (both teal). */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <SaveIndicator state={saveState} />
        <button
          type="button"
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={onInsertResource}
          title="Insert a shared resource from the bank"
          style={tealButton}
        >
          <Library size={15} />
          Resource bank
        </button>
        <button
          type="button"
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={onGenerateAI}
          title="Generate a resource with AI"
          style={tealButton}
        >
          <Sparkles size={15} />
          Generate
        </button>
      </div>
    </div>
  );
}
