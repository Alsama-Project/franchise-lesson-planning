// The extension set for the v3 continuous-document worksheet editor. One shared
// builder so the live editor, the read-only view, and the print render agree on the
// schema. Standard TipTap extensions wherever possible (maintainability is a hard
// constraint) plus three small app nodes (caption, pageBreak, resourceRef).
//
// Unlike the v2 per-block editors, history is ON here (native TipTap undo/redo owns
// the whole document — there is no bespoke combined stack). Font choice is the one
// thing deliberately constrained: NO FontSize extension, curated Heading/Subheading/
// Body styles only.

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Extension, type AnyExtension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ResizableImage } from '../resizableImage';
import { Caption } from './nodes/Caption';
import { PageBreak } from './nodes/PageBreak';
import { ResourceRef } from './nodes/ResourceRef';
import { Indent } from './nodes/Indent';

/** Cmd/Ctrl-K → link (Docs/Word parity): prompt for a URL on the current selection.
 *  Bold/italic/underline (Mod-b/i/u), undo/redo (Mod-z / Mod-Shift-z), and Docs-style
 *  Enter / Shift-Enter all come from StarterKit + Underline keymaps already. */
const LinkShortcut = Extension.create({
  name: 'worksheetLinkShortcut',
  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        const editor = this.editor;
        const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
        const url = window.prompt('Link URL', prev);
        if (url === null) return true;
        if (url.trim() === '') editor.chain().focus().unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
        return true;
      },
    };
  },
});

/** Placeholder text per empty node: empty section headings read "Exercise N"
 *  (Phase 2 — the label disappears on first keystroke); other empties stay bare. */
function placeholderFor({ node, editor, pos }: { node: PMNode; editor: Editor; pos: number }): string {
  if (node.type.name !== 'heading') return '';
  let ordinal = 0;
  editor.state.doc.descendants((n, p) => {
    if (n.type.name === 'heading' && p <= pos) ordinal += 1;
  });
  return `Exercise ${Math.max(1, ordinal)}`;
}

/**
 * Build the v3 extension list (a fresh array per editor instance). The slash-command
 * extension is NOT included here — it needs per-editor app callbacks and is added by
 * the editor component; the read-only/print paths use exactly this base schema.
 */
export function worksheetDocExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
    }),
    Underline,
    TextStyle,
    Color,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Indent,
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener nofollow', target: '_blank' },
    }),
    LinkShortcut,
    Placeholder.configure({
      includeChildren: true,
      showOnlyWhenEditable: true,
      placeholder: placeholderFor,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // Column resizing is ON: teachers can drag a column border and the width
    // sticks. Fresh tables insert with no colwidth attrs (even columns); invalid or
    // inconsistent stored colwidths are reset to even on load by
    // `normalizeTableColwidths` (so stale/migrated data can't staircase), and the
    // resize handle + real colgroup widths are styled in globals.css.
    Table.configure({ resizable: true, cellMinWidth: 40 }),
    TableRow,
    TableHeader,
    TableCell,
    ResizableImage.configure({ inline: false, allowBase64: false }),
    Caption,
    PageBreak,
    ResourceRef,
  ];
}
