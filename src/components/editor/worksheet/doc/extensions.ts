// The extension set for the v3 continuous-document worksheet editor. One shared
// builder so the live editor, the read-only view, and the print render agree on the
// schema. Standard TipTap extensions wherever possible (maintainability is a hard
// constraint) plus three small app nodes (caption, pageBreak, resourceRef).
//
// Unlike the v2 per-block editors, history is ON here (native TipTap undo/redo owns
// the whole document — there is no bespoke combined stack). Font choice stays
// curated (Heading/Subheading/Body block styles); the toolbar's font-size dropdown
// offers a CURATED set of sizes only (via the FontSize extension), never an
// arbitrary field.

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
import {
  worksheetArtifactText,
  type WorksheetContentLanguage,
} from '@/lib/editor/worksheet-content-locale';
import { ResizableImage } from '../resizableImage';
import { FontSize } from '../fontSize';
import { Caption } from './nodes/Caption';
import { PageBreak } from './nodes/PageBreak';
import { ResourceRef } from './nodes/ResourceRef';
import { Indent } from './nodes/Indent';
import { HintPlaceholder } from './nodes/HintPlaceholder';

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

/** Placeholder text per empty node, in priority order:
 *  1. A per-node HINT (`placeholder` attr, authored in Template Mode) — muted-italic
 *     guidance that never prints (styled + badged in globals.css). This is the
 *     Phase 3a hint mechanism; it works on any paragraph/heading.
 *  2. Empty section headings read "Exercise N" in the subject's content language
 *     (the label disappears on first keystroke).
 *  3. Other empties stay bare. */
function placeholderFor(
  { node, editor, pos }: { node: PMNode; editor: Editor; pos: number },
  language: WorksheetContentLanguage,
): string {
  const hint = node.attrs?.placeholder;
  if (typeof hint === 'string' && hint.trim()) return hint;
  if (node.type.name !== 'heading') return '';
  let ordinal = 0;
  editor.state.doc.descendants((n, p) => {
    if (n.type.name === 'heading' && p <= pos) ordinal += 1;
  });
  return worksheetArtifactText(language, 'exerciseHeading', { n: Math.max(1, ordinal) });
}

/**
 * Build the v3 extension list (a fresh array per editor instance). The slash-command
 * extension is NOT included here — it needs per-editor app callbacks and is added by
 * the editor component; the read-only/print paths use exactly this base schema.
 *
 * `contentLanguage` drives the "Exercise N" placeholder — worksheet content follows
 * the subject's language, not the UI locale. Defaults to English.
 */
export function worksheetDocExtensions(
  contentLanguage: WorksheetContentLanguage = 'en',
): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
    }),
    Underline,
    TextStyle,
    Color,
    FontSize,
    // Per-node hint placeholders (Template Mode authoring). Declares the `placeholder`
    // attr so it round-trips through save; the Placeholder resolver above surfaces it.
    HintPlaceholder,
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
      placeholder: (props) => placeholderFor(props, contentLanguage),
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
