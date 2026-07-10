'use client';

// A compact contextual toolbar that appears whenever the cursor is inside a table:
// add/delete row, add/delete column, delete table. Recognisable lucide icons with a
// short label + tooltip, consistent with the main toolbar. Built on a second
// BubbleMenu (its own pluginKey) so it can show for a collapsed cursor inside a
// table without clashing with the text-selection bubble.

import { BubbleMenu } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { useEditorTick } from './useEditorTick';
import { BRAND } from './theme';

function TableBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 28,
        padding: '0 8px',
        borderRadius: 7,
        border: 'none',
        background: 'transparent',
        color: danger ? BRAND.pink : BRAND.ink,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

export function TableToolbar({ editor }: { editor: Editor | null }) {
  useEditorTick(editor);
  if (!editor) return null;
  const e = editor;

  return (
    <BubbleMenu
      editor={e}
      pluginKey="tableControls"
      className="ws-no-print"
      shouldShow={({ editor: ed }) => ed.isEditable && ed.isActive('table')}
      tippyOptions={{ placement: 'bottom', duration: 120, maxWidth: 'none' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          padding: 4,
          background: '#fff',
          border: '1px solid #E7DECF',
          borderRadius: 10,
          boxShadow: '0 10px 26px -12px rgba(40,30,20,0.4)',
        }}
      >
        <TableBtn title="Add row below" onClick={() => e.chain().focus().addRowAfter().run()}>
          <Plus size={14} /> Row
        </TableBtn>
        <TableBtn title="Delete row" onClick={() => e.chain().focus().deleteRow().run()}>
          <Minus size={14} /> Row
        </TableBtn>
        <span style={{ width: 1, height: 18, background: '#E7DECF', margin: '0 3px' }} />
        <TableBtn title="Add column right" onClick={() => e.chain().focus().addColumnAfter().run()}>
          <Plus size={14} /> Col
        </TableBtn>
        <TableBtn title="Delete column" onClick={() => e.chain().focus().deleteColumn().run()}>
          <Minus size={14} /> Col
        </TableBtn>
        <span style={{ width: 1, height: 18, background: '#E7DECF', margin: '0 3px' }} />
        <TableBtn title="Delete table" danger onClick={() => e.chain().focus().deleteTable().run()}>
          <Trash2 size={14} /> Table
        </TableBtn>
      </div>
    </BubbleMenu>
  );
}
