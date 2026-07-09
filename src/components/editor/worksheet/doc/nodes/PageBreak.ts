// A `pageBreak` node: an explicit "start a new page here" marker, insertable from
// the slash menu / toolbar. On the pageless editing surface it renders as a subtle
// labelled divider; in the print/PDF export it forces a real page break (see the
// `@media print` rules for `.ws-page-break` in globals.css). It carries no content
// (an atom) and downgrades to a horizontal rule in the v3→v2 kill-switch.

import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a page break at the current selection. */
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': 'true',
        class: 'ws-page-break',
        contenteditable: 'false',
      }),
      ['span', { class: 'ws-page-break__label' }, 'Page break'],
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
