// The compile-built WORKSHEET PARTS the composition rules need but the tiptap schema
// had no node for: ruled answer lines, tick boxes, number boxes, and borderless
// composition cells. Each is a CSS-class convention carried by a GLOBAL ATTRIBUTE —
// the exact `wsFlashcardCell` / `wsMediaCell` precedent — so it survives `getJSON()`,
// prints through `generateHTML`, and touches NO new node/mark in the schema (which
// this document has been through enough already).
//
//   · `wsRule`  (paragraph) — a ruled answer/writing line. The value is the line's
//     pitch in layout px (year-banded: 10 mm at Year 0-1, 8 mm above), emitted as an
//     inline `min-height` so the printed pitch differs by year. Replaces the rows of
//     underscores the model used to fake — those wrap, break at the wrong place, and
//     print at whatever pitch the font gives. Ruled lines appear in seven of the
//     eleven rules, so this is the single most load-bearing part here.
//   · `wsTick`  (paragraph) — a choice line with a leading tick box (rules 1, 9),
//     drawn as a bordered `::before` square so it needs no inline node.
//   · `wsNumBox` (paragraph) — a small bordered box to write a numeric answer (rule 1).
//   · `wsPlainCell` (tableCell) — a borderless composition cell (matching gap, dialogue
//     name column, scene label lines), where the data-table border would read wrong.
//
// Compile stamps these attrs (see `@/lib/ai/worksheet-compose`); the classes are
// styled in globals.css, screen + print alike. A teacher-authored paragraph/cell has
// every attr null and renders exactly as before.

import { Extension } from '@tiptap/core';

/** Class on a compile-built ruled answer/writing line. */
export const RULE_CLASS = 'ws-rule';
/** Class on a choice line carrying a leading tick box. */
export const TICK_CLASS = 'ws-tick';
/** Class on a numeric-answer box. */
export const NUM_BOX_CLASS = 'ws-num-box';
/** Class on a borderless composition cell. */
export const PLAIN_CELL_CLASS = 'ws-plain-cell';

export const WorksheetPartStyle = Extension.create({
  name: 'worksheetPartStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          // Ruled line: the value is the pitch in px, so the printed line height is
          // year-banded. `null` on any ordinary paragraph.
          wsRule: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => {
              const v = el.getAttribute('data-ws-rule');
              const n = v == null ? NaN : Number(v);
              return Number.isFinite(n) && n > 0 ? n : null;
            },
            renderHTML: (attrs) => {
              const v = Number(attrs.wsRule);
              if (!Number.isFinite(v) || v <= 0) return {};
              return {
                class: RULE_CLASS,
                'data-ws-rule': String(v),
                style: `min-height:${v}px`,
              };
            },
          },
          wsTick: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => (el.getAttribute('data-ws-tick') === 'true' ? true : null),
            renderHTML: (attrs) =>
              attrs.wsTick === true ? { class: TICK_CLASS, 'data-ws-tick': 'true' } : {},
          },
          wsNumBox: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => (el.getAttribute('data-ws-num-box') === 'true' ? true : null),
            renderHTML: (attrs) =>
              attrs.wsNumBox === true ? { class: NUM_BOX_CLASS, 'data-ws-num-box': 'true' } : {},
          },
        },
      },
      {
        types: ['tableCell'],
        attributes: {
          wsPlainCell: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => (el.getAttribute('data-ws-plain-cell') === 'true' ? true : null),
            renderHTML: (attrs) =>
              attrs.wsPlainCell === true
                ? { class: PLAIN_CELL_CLASS, 'data-ws-plain-cell': 'true' }
                : {},
          },
        },
      },
    ];
  },
});
