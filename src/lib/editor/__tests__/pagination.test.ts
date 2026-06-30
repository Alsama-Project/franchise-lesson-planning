import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateBlocks } from '../pagination';

// ── Whole-block worksheet pagination ──────────────────────────────────────────
// The shared packer behind both the on-screen builder and the print/PDF render.
// Whole blocks only; a block crossing a boundary moves to the next page; a block
// taller than a page is kept whole and flagged.

test('packs whole blocks greedily onto pages', () => {
  const r = paginateBlocks([100, 100, 100], 250, 0);
  assert.deepEqual(r.pages, [[0, 1], [2]]);
  assert.deepEqual(r.overflow, [false, false, false]);
});

test('a block taller than a page is flagged, kept whole, and sits alone', () => {
  const r = paginateBlocks([100, 400, 100], 250, 0);
  assert.deepEqual(r.pages, [[0], [1], [2]]);
  assert.deepEqual(r.overflow, [false, true, false]);
});

test('the inter-block gap counts toward the page budget', () => {
  // 100 + 30 (gap) + 100 = 230 > 220 → the second block flows to a new page.
  const r = paginateBlocks([100, 100], 220, 30);
  assert.deepEqual(r.pages, [[0], [1]]);
});

test('before measurement (height <= 0) everything stays on one page', () => {
  const r = paginateBlocks([100, 100], 0);
  assert.deepEqual(r.pages, [[0, 1]]);
});

test('an empty worksheet yields a single empty page', () => {
  const r = paginateBlocks([], 250);
  assert.deepEqual(r.pages, [[]]);
});

test('every block is assigned exactly once, in order', () => {
  const heights = [120, 90, 300, 60, 200, 75];
  const r = paginateBlocks(heights, 400, 12);
  assert.deepEqual(
    r.pages.flat(),
    heights.map((_, i) => i),
  );
});
