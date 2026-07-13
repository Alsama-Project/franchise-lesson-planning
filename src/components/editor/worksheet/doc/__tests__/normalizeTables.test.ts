// @ts-nocheck — dynamic tiptap-table JSON; the module itself is fully typed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTableColwidths } from '../normalizeTables';

function cell(colwidth) {
  return { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth }, content: [{ type: 'paragraph' }] };
}
function row(...cells) {
  return { type: 'tableRow', content: cells };
}
function table(...rows) {
  return { type: 'table', content: rows };
}
function doc(...content) {
  return { type: 'doc', content };
}
const widthsOf = (t) => t.content.map((r) => r.content.map((c) => c.attrs.colwidth));
const allCellsNull = (t) => t.content.every((r) => r.content.every((c) => c.attrs.colwidth === null));

test('leaves a table with no colwidths untouched (even columns)', () => {
  const d = doc(table(row(cell(null), cell(null)), row(cell(null), cell(null))));
  assert.equal(normalizeTableColwidths(d), d); // same reference — nothing changed
});

test('keeps valid, consistent colwidths (a legitimately resized table)', () => {
  const d = doc(table(row(cell([120]), cell([300])), row(cell([120]), cell([300]))));
  const out = normalizeTableColwidths(d);
  assert.equal(out, d); // same reference — preserved untouched
  assert.deepEqual(widthsOf(out.content[0]), [[[120], [300]], [[120], [300]]]);
});

test('resets a table whose columns are INCONSISTENT across rows', () => {
  const d = doc(table(row(cell([120]), cell([300])), row(cell([200]), cell([220]))));
  const out = normalizeTableColwidths(d);
  assert.notEqual(out, d);
  assert.ok(allCellsNull(out.content[0]));
});

test('resets a table with an INVALID width (negative / non-numeric / absurd)', () => {
  for (const bad of [[-50], [0], ['x'], [99999], [NaN]]) {
    const d = doc(table(row(cell(bad), cell([200])), row(cell(bad), cell([200]))));
    const out = normalizeTableColwidths(d);
    assert.notEqual(out, d, `expected reset for ${JSON.stringify(bad)}`);
    assert.equal(out.content[0].content[0].content[0].attrs.colwidth, null);
  }
});

test('resets a table that mixes sized and unsized columns', () => {
  const d = doc(table(row(cell([120]), cell(null)), row(cell([120]), cell(null))));
  const out = normalizeTableColwidths(d);
  assert.notEqual(out, d);
});

test('normalises tables nested anywhere and leaves other content alone', () => {
  const d = doc(
    { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    table(row(cell([10]), cell([9999])), row(cell([10]), cell([9999]))),
  );
  const out = normalizeTableColwidths(d);
  assert.notEqual(out, d);
  assert.equal(out.content[0].content[0].text, 'hi'); // paragraph untouched
  assert.equal(out.content[1].content[0].content[0].attrs.colwidth, null);
});
