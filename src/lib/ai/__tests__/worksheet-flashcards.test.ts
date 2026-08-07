import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutExerciseImages } from '../worksheet-assemble';

const img = (slotId: string) => ({ type: 'image', attrs: { src: null, storagePath: `u/${slotId}.png`, slotId } });
const label = (word: string) => ({ type: 'paragraph', content: [{ type: 'text', text: word, marks: [{ type: 'bold' }] }] });
const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });

/** Every cell in every row of a table (flattened). */
function cells(table: any): any[] {
  return (table.content ?? []).flatMap((row: any) => row.content ?? []);
}
function rowLengths(table: any): number[] {
  return (table.content ?? []).map((row: any) => (row.content ?? []).length);
}

test('a LONE image stays inline and large (no table)', () => {
  const out = layoutExerciseImages([para('intro'), img('a'), para('after')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'image', 'paragraph']);
});

test('a lone image + its label stay inline (single flashcard is large)', () => {
  const out = layoutExerciseImages([img('a'), label('bus')]);
  assert.deepEqual(out.map((n: any) => n.type), ['image', 'paragraph']);
});

test('TWO images become one side-by-side row (a wsFlashcards table)', () => {
  const out = layoutExerciseImages([img('a'), img('b')]);
  assert.equal(out.length, 1);
  const table: any = out[0];
  assert.equal(table.type, 'table');
  assert.deepEqual(rowLengths(table), [2]); // one row, two cells
  assert.equal(cells(table).length, 2);
  // Every cell carries the borderless-grid marker (styled via FlashcardTableStyle).
  assert.ok(cells(table).every((c: any) => c.attrs.wsFlashcardCell === true));
});

test('flashcards carry image + label together in each cell', () => {
  const out = layoutExerciseImages([img('a'), label('bus'), img('b'), label('car')]);
  const table: any = out[0];
  const c = cells(table);
  assert.equal(c[0].content[0].type, 'image');
  assert.equal(c[0].content[1].type, 'paragraph');
  assert.equal(c[0].content[1].content[0].text, 'bus');
});

test('FIVE images grid to 3 per row and pad the last row rectangular', () => {
  const out = layoutExerciseImages(['a', 'b', 'c', 'd', 'e'].map(img));
  const table: any = out[0];
  // perRowFor(5) === 3 → rows of 3 and 3 (last padded from 2 → 3 with an empty cell).
  assert.deepEqual(rowLengths(table), [3, 3]);
  // Exactly 5 cells hold an image; the 6th (pad) holds only an empty paragraph.
  const withImage = cells(table).filter((cell: any) => cell.content.some((n: any) => n.type === 'image'));
  assert.equal(withImage.length, 5);
  const empties = cells(table).filter((cell: any) => cell.content.every((n: any) => n.type === 'paragraph' && !(n.content?.length)));
  assert.equal(empties.length, 1);
});

test('FOUR images grid to 4 per row (small)', () => {
  const out = layoutExerciseImages(['a', 'b', 'c', 'd'].map(img));
  assert.deepEqual(rowLengths(out[0] as any), [4]);
});

test('a non-label paragraph between images breaks the run (both stay large)', () => {
  const out = layoutExerciseImages([img('a'), para('a full sentence of real exercise text here'), img('b')]);
  assert.deepEqual(out.map((n: any) => n.type), ['image', 'paragraph', 'image']);
});

test('images are left untouched when there are none to group', () => {
  const nodes = [para('one'), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] }];
  assert.deepEqual(layoutExerciseImages(nodes), nodes);
});
