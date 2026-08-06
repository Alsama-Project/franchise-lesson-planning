// Tints MODEL-WRITTEN EXERCISE headings pink so the worksheet breaks up visually.
//
// An exercise heading is a heading compile stamped with `wsCompiled: true` (and an
// `exerciseId`) — the title the model wrote for one exercise. It is NOT a template
// SCAFFOLD heading (`wsScaffold: true`, locked, left in the default ink) and NOT a
// teacher-authored heading (neither marker). Those two must stay unchanged.
//
// The markers themselves emit nothing to the DOM (see WsCompiledMarker), so a heading
// carries no CSS hook of its own. This declares one heading-scoped, render-only
// attribute whose `renderHTML` reads the sibling markers and emits `class:
// "ws-ex-heading"` for an exercise heading and nothing otherwise. Because it renders
// through the schema's toDOM, the class appears BOTH in the live editor and in the
// print/PDF `generateHTML` output — so `.ws-ex-heading { color: … }` (globals.css)
// applies on screen and on paper (print-color-adjust is already set on the page).
//
// It carries no value of its own (always null) and never parses from the DOM; it is a
// pure render hook, in the same spirit as the other declare-only marker attributes.

import { Extension } from '@tiptap/core';

/** The class every model-written exercise heading renders with. Styled in globals.css. */
export const EXERCISE_HEADING_CLASS = 'ws-ex-heading';

export const ExerciseHeadingStyle = Extension.create({
  name: 'exerciseHeadingStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          wsExerciseHeading: {
            default: null,
            // Never authored, never parsed — a render hook only.
            keepOnSplit: false,
            parseHTML: () => null,
            // An exercise heading is `wsCompiled` AND not `wsScaffold`. Emit the class
            // for those; emit nothing for scaffold and teacher-authored headings.
            renderHTML: (attrs) =>
              attrs.wsCompiled === true && attrs.wsScaffold !== true
                ? { class: EXERCISE_HEADING_CLASS }
                : {},
          },
        },
      },
    ];
  },
});
