import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDegradedImage } from '../worksheet-guard';

/** A well-formed v3 envelope wrapping the given top-level nodes. */
function v3(nodes: unknown[]) {
  return { version: 3, doc: { type: 'doc', content: nodes } };
}

test('passes a generated image (storagePath, null src)', () => {
  const ws = v3([
    { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    { type: 'image', attrs: { src: null, alt: 'a cat', storagePath: 'u/cat.png', slotId: 's1' } },
  ]);
  assert.equal(findDegradedImage(ws), null);
});

test('passes an uploaded/resource image (src, no storagePath)', () => {
  const ws = v3([{ type: 'image', attrs: { src: 'https://x/y.png', alt: null, width: 300, align: 'center' } }]);
  assert.equal(findDegradedImage(ws), null);
});

test('catches the wholesale { type:"image" } corruption (no attrs)', () => {
  const ws = v3([{ type: 'paragraph' }, { type: 'image' }]);
  const hit = findDegradedImage(ws);
  assert.ok(hit, 'expected a degraded image');
  assert.equal(hit!.reason, 'no-attrs');
});

test('catches an image with attrs but no usable source', () => {
  const ws = v3([{ type: 'image', attrs: { src: null, storagePath: null, alt: 'x' } }]);
  const hit = findDegradedImage(ws);
  assert.ok(hit);
  assert.equal(hit!.reason, 'no-source');
});

test('catches empty-string source as degraded', () => {
  const ws = v3([{ type: 'image', attrs: { src: '', storagePath: '   ' } }]);
  assert.equal(findDegradedImage(ws)?.reason, 'no-source');
});

test('finds a degraded image nested inside a table cell', () => {
  const ws = v3([
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'image' }] }] },
      ],
    },
  ]);
  assert.equal(findDegradedImage(ws)?.reason, 'no-attrs');
});

test('null / empty worksheet is not degraded', () => {
  assert.equal(findDegradedImage(null), null);
  assert.equal(findDegradedImage(v3([{ type: 'paragraph' }])), null);
});

test('a v2 block worksheet with a good floating image passes', () => {
  const ws = {
    version: 2,
    blocks: [{ id: 'b1', kind: 'free', doc: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://x/p.png' } }] }, elements: [] }],
  };
  assert.equal(findDegradedImage(ws), null);
});
