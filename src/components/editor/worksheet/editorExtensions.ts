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

export interface WorksheetEditorOptions {
  /** Called when the teacher converts an inline image to a free floating one. */
  onFloatImage?: (info: FloatImageInfo) => void;
}

/** Build the extension list (a fresh array per editor instance). */
export function worksheetEditorExtensions(opts: WorksheetEditorOptions = {}): AnyExtension[] {
  return [
    StarterKit,
    Underline,
    TextStyle,
    Color,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ResizableImage.configure({ inline: false, allowBase64: false, onFloatImage: opts.onFloatImage }),
  ];
}
