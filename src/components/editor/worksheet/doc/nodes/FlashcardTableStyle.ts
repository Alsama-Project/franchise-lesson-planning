// Marks the CELLS of a compile-built FLASHCARD GRID so the grid renders borderless —
// a grid of picture-and-word cards, not a bordered data table.
//
// `compileWorksheet` lays a run of adjacent images out as a `table` whose cells are
// stamped `wsFlashcardCell: true` (see `layoutExerciseImages`). The marker lives on the
// CELL, not the table, on purpose: the live editor renders a table through a NodeView
// (prosemirror-tables' TableView), which ignores the table node's `renderHTML` class —
// but the CELLS are ordinary nodes, so a global attribute's `renderHTML` reaches them in
// the editor AND in the print/PDF `generateHTML` output. The worksheet's cell border is
// on `td`, so removing it per-cell is exactly what makes the grid borderless. A normal
// teacher-inserted table has `wsFlashcardCell` null on its cells and keeps its borders.
//
// The attribute round-trips through `getJSON()` (declared here), so it survives
// save/reload like the other worksheet markers.

import { Extension } from '@tiptap/core';

/** The class each cell of a compile-built flashcard grid renders with (globals.css). */
export const FLASHCARD_CELL_CLASS = 'ws-flashcard-cell';

export const FlashcardTableStyle = Extension.create({
  name: 'flashcardTableStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['tableCell'],
        attributes: {
          wsFlashcardCell: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => (el.getAttribute('data-ws-flashcard-cell') === 'true' ? true : null),
            renderHTML: (attrs) =>
              attrs.wsFlashcardCell === true
                ? { class: FLASHCARD_CELL_CLASS, 'data-ws-flashcard-cell': 'true' }
                : {},
          },
        },
      },
    ];
  },
});
