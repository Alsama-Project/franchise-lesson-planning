// Marks the CELLS of a compile-built IMAGE-BESIDE-SENTENCE table (a picture-prompted gap
// fill) so it renders as a borderless two-column layout — a narrow picture column beside
// the sentence — not a bordered data table.
//
// `compileWorksheet` lays a picture-then-numbered-line run out as a `table` whose cells are
// stamped `wsMediaCell: 'pic'` (the narrow picture column, which sizes the image down) or
// `wsMediaCell: 'text'` (the sentence beside it) — see `layoutExercisePictures`. Like
// `FlashcardTableStyle`, the marker lives on the CELL, not the table: the live editor
// renders a table through a NodeView (prosemirror-tables' TableView) that ignores the table
// node's class, but the cells are ordinary nodes, so a global attribute's `renderHTML`
// reaches them in the editor AND in the print/PDF `generateHTML` output. The picture-column
// width and the borderless look are styled in globals.css off these classes.
//
// The attribute round-trips through `getJSON()` (declared here), so it survives save/reload
// like the other worksheet markers. A teacher-inserted table has `wsMediaCell` null on its
// cells and keeps its borders.

import { Extension } from '@tiptap/core';

/** The class every cell of a compile-built image-beside-sentence table renders with. */
export const MEDIA_CELL_CLASS = 'ws-media-cell';
/** The extra class on the narrow picture column, and on the sentence column. */
export const MEDIA_PIC_CLASS = 'ws-media-pic';
export const MEDIA_TEXT_CLASS = 'ws-media-text';

export const MediaCellStyle = Extension.create({
  name: 'mediaCellStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['tableCell'],
        attributes: {
          wsMediaCell: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => {
              const v = el.getAttribute('data-ws-media-cell');
              return v === 'pic' || v === 'text' ? v : null;
            },
            renderHTML: (attrs) => {
              if (attrs.wsMediaCell !== 'pic' && attrs.wsMediaCell !== 'text') return {};
              const role = attrs.wsMediaCell === 'pic' ? MEDIA_PIC_CLASS : MEDIA_TEXT_CLASS;
              return { class: `${MEDIA_CELL_CLASS} ${role}`, 'data-ws-media-cell': attrs.wsMediaCell };
            },
          },
        },
      },
    ];
  },
});
