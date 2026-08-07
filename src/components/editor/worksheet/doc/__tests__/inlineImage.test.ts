// @ts-nocheck — behavioural test over dynamic tiptap/ProseMirror document JSON.
// Node's `--test` runner strips types and ignores this directive.
//
// WHAT THIS PROVES — the Phase 1 "inline: true" switch, at the schema + persistence
// level (the parts verifiable headlessly, without an authenticated browser):
//
//   1. An image sitting INLINE in a sentence ("The <img> jumped.") is a VALID document
//      against the real inline image schema, and it HOLDS THAT POSITION through a
//      getJSON round trip + an edit — i.e. it survives a reload with its place and its
//      attrs (storagePath / slotId) intact.
//   2. A stored BARE top-level image — every worksheet saved before this switch — is
//      REJECTED by the inline schema (`doc.check()` throws). This is exactly why the
//      read-time heal exists; `wrapBareBlockImages` makes such a doc valid again.
//   3. `toPlainJSON` (the save-boundary normaliser) preserves the inline image's attrs,
//      so the null-prototype "$T" Server-Action bug cannot resurface for inline images.
//
// WHY A SCHEMA-LEVEL TEST — the `.ts`-only test loader can't import the JSX NodeView
// (`resizableImage.tsx`), and `generateHTML` needs a DOM this runner lacks. So, exactly
// like `wsCompiledMarker.test.ts`, the schema is rebuilt from importable pieces: base
// `@tiptap/extension-image` extended with the REAL DOM-free attribute specs
// (`worksheetImageAttributes`) and configured `inline: true` — the same node the shipped
// bundle configures. Whatever this schema accepts/rejects, the live editor does too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import BaseImage from '@tiptap/extension-image';
import { worksheetImageAttributes } from '../../resizableImageAttrs';
import { WsCompiledMarker } from '../nodes/WsCompiledMarker';
import { wrapBareBlockImages } from '@/lib/editor/worksheet-migrate';
import { toPlainJSON } from '@/lib/editor/plain-json';

// The real worksheet image node's serialisation surface: base Image + the actual extra
// attribute specs, configured INLINE exactly as `worksheetDocExtensions` now does.
const Image = BaseImage.extend({
  addAttributes() {
    return { ...this.parent?.(), ...worksheetImageAttributes() };
  },
});

const inlineSchema = getSchema([
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Image.configure({ inline: true, allowBase64: false }),
  WsCompiledMarker,
]);

const text = (t) => ({ type: 'text', text: t });
const image = () => ({
  type: 'image',
  attrs: { src: null, alt: 'a fox', storagePath: 'imgs/fox.png', slotId: 's1', brief: 'a red fox' },
});

test('an image inline in a sentence is a valid document under the inline schema', () => {
  const docJSON = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [text('The '), image(), text(' jumped.')] }],
  };
  const doc = PMNode.fromJSON(inlineSchema, docJSON);
  assert.doesNotThrow(() => doc.check(), 'inline image in a paragraph must satisfy the schema');
});

test('an inline image HOLDS its mid-sentence position across a getJSON round trip + edit', () => {
  const docJSON = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
      { type: 'paragraph', content: [text('The '), image(), text(' jumped.')] },
    ],
  };
  const doc = PMNode.fromJSON(inlineSchema, docJSON);
  const state = EditorState.create({ schema: inlineSchema, doc });
  // Type a character in the leading heading (as the editor would before getJSON).
  const out = state.apply(state.tr.insertText('x', 1)).doc.toJSON();

  const para = out.content.find((n) => n.type === 'paragraph');
  assert.deepEqual(
    para.content.map((c) => c.type),
    ['text', 'image', 'text'],
    'the image stays BETWEEN the two words after the round trip',
  );
  assert.equal(para.content[0].text, 'The ');
  assert.equal(para.content[2].text, ' jumped.');
  const img = para.content[1];
  assert.equal(img.attrs.storagePath, 'imgs/fox.png', 'storagePath survives the round trip');
  assert.equal(img.attrs.slotId, 's1', 'slotId survives the round trip');
});

test('two inline images can share one paragraph', () => {
  const docJSON = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [image(), text(' and '), image()] }],
  };
  const doc = PMNode.fromJSON(inlineSchema, docJSON);
  assert.doesNotThrow(() => doc.check(), 'two inline images in one paragraph is valid');
});

test('a stored BARE top-level image is rejected by the inline schema (heal is required)', () => {
  const bareJSON = { type: 'doc', content: [{ type: 'paragraph', content: [text('Look:')] }, image()] };
  const bareDoc = PMNode.fromJSON(inlineSchema, bareJSON);
  assert.throws(() => bareDoc.check(), 'a top-level inline image is invalid — this is why the heal exists');

  // The read-time heal wraps it, and the healed doc parses cleanly.
  const healed = PMNode.fromJSON(inlineSchema, wrapBareBlockImages(bareJSON));
  assert.doesNotThrow(() => healed.check(), 'wrapBareBlockImages makes the stored doc valid');
});

test('toPlainJSON preserves an inline image’s attrs (the $T Server-Action guard)', () => {
  const docJSON = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [text('The '), image(), text(' jumped.')] }],
  };
  // getJSON()'s attrs carry a null prototype; toPlainJSON re-materialises them on
  // Object.prototype so the Server Action wire format keeps them. The inline image's
  // storagePath/slotId must be present and intact afterwards.
  const doc = PMNode.fromJSON(inlineSchema, docJSON);
  const plain = toPlainJSON(doc.toJSON());
  const img = plain.content[0].content[1];
  assert.equal(img.type, 'image');
  assert.equal(img.attrs.storagePath, 'imgs/fox.png');
  assert.equal(img.attrs.slotId, 's1');
  assert.equal(Object.getPrototypeOf(img.attrs), Object.prototype, 'attrs is a plain object (crosses the boundary)');
});
