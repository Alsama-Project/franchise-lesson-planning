// Hint placeholders for the worksheet editor (Template Mode authoring; renders in
// the teacher's editor too).
//
// A hint is NOT document content — it is a `placeholder` ATTRIBUTE on an empty
// paragraph/heading, surfaced by the shared Placeholder decoration (see
// `placeholderFor` in ../extensions). Because it is a decoration, it can never reach
// react-pdf or print: the node's actual content stays empty, so it exports blank.
// The teacher clicks the hint and types; their text replaces the (never-persisted)
// hint glyphs with no guidance-deletion step. Backfill: none — an absent attr is
// today's behaviour exactly.
//
// This extension only DECLARES the attribute (so it round-trips through getJSON) and
// adds set/unset commands. The muted-italic styling and the "hint · won't print"
// badge are pure CSS (`[data-hint].is-empty` in globals.css), shown only while the
// editor is editable (the Placeholder extension adds `is-empty` only when editable),
// so read-only / print / PDF never render either.

import { Extension } from '@tiptap/core';

export interface HintPlaceholderOptions {
  /** Node types that may carry a hint placeholder. */
  types: string[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hintPlaceholder: {
      /** Mark the current empty block as a hint with the given guidance text. */
      setHintPlaceholder: (text: string) => ReturnType;
      /** Clear the hint from the current block (back to a plain empty node). */
      unsetHintPlaceholder: () => ReturnType;
    };
  }
}

export const HintPlaceholder = Extension.create<HintPlaceholderOptions>({
  name: 'hintPlaceholder',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          placeholder: {
            default: null,
            // Round-trips through HTML as `data-hint` (the CSS badge/italic hook);
            // persistence itself rides on getJSON serialising node.attrs.
            parseHTML: (element: HTMLElement) => element.getAttribute('data-hint') || null,
            renderHTML: (attributes: { placeholder?: string | null }) =>
              attributes.placeholder ? { 'data-hint': attributes.placeholder } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const types = this.options.types;
    return {
      setHintPlaceholder:
        (text: string) =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          const node = $from.node($from.depth);
          if (!types.includes(node.type.name)) return false;
          if (dispatch) {
            const pos = $from.before($from.depth);
            dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, placeholder: text || null }));
          }
          return true;
        },
      unsetHintPlaceholder:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          const node = $from.node($from.depth);
          if (!types.includes(node.type.name)) return false;
          if (dispatch) {
            const pos = $from.before($from.depth);
            dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, placeholder: null }));
          }
          return true;
        },
    };
  },
});
