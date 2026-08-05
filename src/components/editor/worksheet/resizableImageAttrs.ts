// The worksheet image node's persisted ATTRIBUTE specs, factored out of
// `resizableImage.tsx` (which cannot be imported under Node's `--test` type-stripping
// because of its JSX NodeView). This module is pure and DOM-free at import time, so a
// unit test can build the REAL schema from `Image.extend({ addAttributes })` and prove
// `storagePath` / `slotId` / `brief` actually survive a `getJSON()` round trip — the
// thing the previous base-Image stand-in test could never fail on.
//
// `resizableImage.tsx` spreads this over the base Image attrs; the test does the same.
// So the two exercise identical declarations and cannot drift.

import type { Attributes } from '@tiptap/core';

export type ImageAlign = 'left' | 'center' | 'right';
export type ImageFloat = 'none' | 'left' | 'right';

/**
 * The extra attributes the worksheet ResizableImage adds on top of the stock Image
 * node (`src`/`alt`/`title`). `width`/`align`/`float` are folded into inline style by
 * the node's `renderHTML`, so they emit no HTML of their own; `storagePath`/`slotId`
 * round-trip via data attributes; `brief` is JSON-only plumbing that never reaches the
 * DOM (so it stays out of print / PDF / `generateHTML`), exactly like `wsCompiled`.
 */
export function worksheetImageAttributes(): Attributes {
  return {
    width: {
      default: null,
      parseHTML: (el) => {
        const raw = el.getAttribute('width') || (el as HTMLElement).style.width;
        const n = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(n) ? n : null;
      },
      renderHTML: () => ({}),
    },
    align: {
      default: 'center',
      parseHTML: (el) => (el as HTMLElement).getAttribute('data-align') || 'center',
      renderHTML: () => ({}),
    },
    float: {
      default: 'none',
      parseHTML: (el) => (el as HTMLElement).getAttribute('data-float') || 'none',
      renderHTML: () => ({}),
    },
    // The object path of a GENERATED image in the private bucket. When set, both render
    // paths serve through /api/worksheet-image (see resolveImageSrc). Round-trips via
    // data-storage-path. Null for uploads.
    storagePath: {
      default: null,
      parseHTML: (el) => (el as HTMLElement).getAttribute('data-storage-path') || null,
      renderHTML: (attrs) =>
        attrs.storagePath ? { 'data-storage-path': attrs.storagePath as string } : {},
    },
    // The image slot this node is bound to — the handle a per-image regenerate uses.
    // Round-trips via data-slot-id.
    slotId: {
      default: null,
      parseHTML: (el) => (el as HTMLElement).getAttribute('data-slot-id') || null,
      renderHTML: (attrs) =>
        attrs.slotId ? { 'data-slot-id': attrs.slotId as string } : {},
    },
    // The illustrator brief the slot was generated from. Stamped by compile so a
    // per-image regenerate can re-send it (with an optional teacher comment) without
    // reloading the exercise row. JSON-only: it round-trips through getJSON yet emits
    // NOTHING to the DOM — a brief is internal guidance, never printed on a student's
    // sheet. No parseHTML: it arrives via JSON, never a DOM parse.
    brief: {
      default: null,
      parseHTML: () => null,
      renderHTML: () => ({}),
    },
  };
}
