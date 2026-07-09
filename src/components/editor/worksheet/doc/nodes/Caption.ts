// A `caption` node: a small, figure-associated label. The migration emits one
// immediately after an image when a legacy floating text box overlapped that image
// (label-over-figure), and teachers can add one from the slash menu under an image.
//
// It is a plain textblock (no NodeView) so it round-trips cleanly through
// `generateHTML` for the print/read-only path, and downgrades to a paragraph in the
// v3→v2 kill-switch. Rendered as <figcaption class="ws-caption"> and styled in CSS.

import { Node, mergeAttributes } from '@tiptap/core';

export const Caption = Node.create({
  name: 'caption',
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'figcaption' }, { tag: 'p.ws-caption' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figcaption', mergeAttributes(HTMLAttributes, { class: 'ws-caption' }), 0];
  },
});
