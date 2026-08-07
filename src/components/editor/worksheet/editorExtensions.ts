// The tiptap extension set shared by every Free block's editor and by the
// Markdown→tiptap import. Kept in one place so the editing surface and the
// generated-content parser agree on the schema (headings, lists, underline,
// text colour, alignment, and images).

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import type { AnyExtension } from '@tiptap/core';
import { ResizableImage, type FloatImageInfo } from './resizableImage';
import { FontSize } from './fontSize';
import { WsCompiledMarker } from './doc/nodes/WsCompiledMarker';

export interface WorksheetEditorOptions {
  /** Called when the teacher converts an inline image to a free floating one. */
  onFloatImage?: (info: FloatImageInfo) => void;
}

/** Build the extension list (a fresh array per editor instance). */
export function worksheetEditorExtensions(opts: WorksheetEditorOptions = {}): AnyExtension[] {
  return [
    // History is disabled at the editor level: undo/redo is owned by the
    // worksheet builder's combined history stack so a single Cmd/Ctrl+Z reverses
    // the last action — a text edit OR a block op (add/remove/reorder/insert) —
    // whatever its type, in true order. A per-editor history would fight that
    // stack (double-undo) and could never see structural changes.
    StarterKit.configure({ history: false }),
    Underline,
    TextStyle,
    Color,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    // `inline: true` to match the v3 bundle (doc/extensions.ts) — the ResizableImage
    // node is shared, so both bundles keep it inline-capable. This legacy/kill-switch
    // bundle only ever serialises through `generateHTML`; `docHtml` in
    // WorksheetPrintView wraps any stored bare block-level image before serialising so
    // the inline schema stays valid.
    ResizableImage.configure({ inline: true, allowBase64: false, onFloatImage: opts.onFloatImage }),
    // Declares the compile idempotency marker (`wsCompiled`) so a compiled doc
    // serialised through this bundle (e.g. the print/`generateHTML` path) keeps its
    // tag. Declare-only, emits nothing to the DOM. See doc/nodes/WsCompiledMarker.
    WsCompiledMarker,
  ];
}
