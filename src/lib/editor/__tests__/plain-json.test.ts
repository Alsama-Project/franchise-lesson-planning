import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import BaseImage from '@tiptap/extension-image';
import { worksheetImageAttributes } from '../../../components/editor/worksheet/resizableImageAttrs';
import { WsCompiledMarker } from '../../../components/editor/worksheet/doc/nodes/WsCompiledMarker';
import { toPlainJSON } from '../plain-json';

// The REAL worksheet image schema (DOM-free): base Image + the worksheet attribute
// specs, plus the global compile markers. Same shape resizableImage.tsx builds.
const ImageWithAttrs = BaseImage.extend({
  addAttributes() {
    return { ...this.parent?.(), ...worksheetImageAttributes() };
  },
});
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  ImageWithAttrs.configure({ inline: false }),
  WsCompiledMarker,
]);

/** A compiled-doc JSON: an exercise heading + image + paragraph, each id-stamped. */
const DOC_JSON = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 3, wsCompiled: true, exerciseId: 'ex-1' }, content: [{ type: 'text', text: 'Exercise' }] },
    { type: 'image', attrs: { src: null, alt: 'a cat', storagePath: 'u/cat.png', slotId: 's1', wsCompiled: true, exerciseId: 'ex-1' } },
    { type: 'paragraph', attrs: { wsCompiled: true, exerciseId: 'ex-1' }, content: [{ type: 'text', text: 'after' }] },
  ],
};

function findType(node: any, type: string): any {
  if (node?.type === type) return node;
  for (const c of node?.content ?? []) {
    const r = findType(c, type);
    if (r) return r;
  }
  return null;
}

// A ProseMirror node's toJSON() attrs — exactly what editor.getJSON() yields.
function rawToJSON() {
  return PMNode.fromJSON(schema, DOC_JSON).toJSON();
}

test('THE BUG: ProseMirror toJSON() attrs have a NULL prototype', () => {
  const raw = rawToJSON();
  const img = findType(raw, 'image');
  const para = findType(raw, 'paragraph');
  // computeAttrs builds attrs via Object.create(null); toJSON assigns them by reference.
  assert.equal(Object.getPrototypeOf(img.attrs), null, 'image attrs are null-prototype (fails React isSimpleObject)');
  assert.equal(Object.getPrototypeOf(para.attrs), null, 'paragraph attrs are null-prototype');
});

test('THE FIX: after toPlainJSON, every attrs is Object.prototype-backed', () => {
  const plain = toPlainJSON(rawToJSON());
  const img = findType(plain, 'image');
  const para = findType(plain, 'paragraph');
  assert.equal(Object.getPrototypeOf(img.attrs), Object.prototype, 'image attrs now serialisable');
  assert.equal(Object.getPrototypeOf(para.attrs), Object.prototype, 'paragraph attrs now serialisable');
});

test('toPlainJSON preserves storagePath (image) and exerciseId (image + paragraph)', () => {
  const plain = toPlainJSON(rawToJSON());
  const img = findType(plain, 'image');
  const para = findType(plain, 'paragraph');
  assert.equal(img.attrs.storagePath, 'u/cat.png', 'storagePath survives the round trip');
  assert.equal(img.attrs.exerciseId, 'ex-1', 'image exerciseId survives');
  assert.equal(para.attrs.exerciseId, 'ex-1', 'paragraph exerciseId survives (the regenerate-chip key)');
});

test('toPlainJSON normalises a bare null-prototype attrs object directly', () => {
  const attrs = Object.create(null) as Record<string, unknown>;
  attrs.storagePath = 'u/x.png';
  attrs.exerciseId = 'ex-9';
  const node = { type: 'image', attrs };
  assert.equal(Object.getPrototypeOf(node.attrs), null, 'precondition: null prototype');
  const plain = toPlainJSON(node);
  assert.equal(Object.getPrototypeOf(plain.attrs), Object.prototype);
  assert.equal(plain.attrs.storagePath, 'u/x.png');
  assert.equal(plain.attrs.exerciseId, 'ex-9');
});
