import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFlashcards } from '../worksheet-assemble';

// `layoutFlashcards` runs BEFORE `fillImageSlots`, on the OUTPUT of `markdownToDoc` — so
// a card's picture is still a `[Picture: …]` MARKER paragraph, not a resolved image node.
// It keys on STRUCTURE (consecutive marker paragraphs, each with at most one short line
// between), never on the label's content, because the label form keeps changing: a
// **bold** word, a `### word` heading, or NOTHING (the model's `______` writing blanks are
// dropped by markdownToDoc's thematic-break rule, so a blank card arrives label-less and
// the layout synthesises the writing line).

const marker = (subject: string) => ({ type: 'paragraph', content: [{ type: 'text', text: `[Picture: ${subject}]` }] });
const blabel = (word: string) => ({ type: 'paragraph', content: [{ type: 'text', text: word, marks: [{ type: 'bold' }] }] });
const hlabel = (word: string) => ({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: word }] });
const title = (word: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: word }] });
const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });

/** Every cell in every row of a table (flattened). */
function cells(table: any): any[] {
  return (table.content ?? []).flatMap((row: any) => row.content ?? []);
}
function rowLengths(table: any): number[] {
  return (table.content ?? []).map((row: any) => (row.content ?? []).length);
}
/** The text of a cell's synthesised writing line, if it carries one. */
function isWritingLine(node: any): boolean {
  return node?.type === 'paragraph' && node.content?.[0]?.text === '__________';
}

test('a LONE marker stays inline (single flashcard is large, no table)', () => {
  const out = layoutFlashcards([para('intro'), marker('a bus'), para('after')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'paragraph', 'paragraph']);
});

test('a lone marker + its label stay inline', () => {
  const out = layoutFlashcards([marker('a bus'), blabel('bus')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'paragraph']);
});

test('TWO markers become one side-by-side row (a wsFlashcards table)', () => {
  const out = layoutFlashcards([marker('a'), marker('b')]);
  assert.equal(out.length, 1);
  const table: any = out[0];
  assert.equal(table.type, 'table');
  assert.deepEqual(rowLengths(table), [2]); // one row, two cells
  assert.equal(cells(table).length, 2);
  // Every cell carries the borderless-grid marker (styled via FlashcardTableStyle).
  assert.ok(cells(table).every((c: any) => c.attrs.wsFlashcardCell === true));
});

test('each cell carries its marker paragraph over its word', () => {
  const out = layoutFlashcards([marker('a bus'), blabel('bus'), marker('a car'), blabel('car')]);
  const c = cells(out[0]);
  // Cell content = [ marker paragraph, label ].
  assert.equal(c[0].content[0].content[0].text, '[Picture: a bus]');
  assert.equal(c[0].content[1].content[0].text, 'bus');
});

test('a card the model left BLANK gets a synthesised writing line (the real case)', () => {
  // "say the word aloud, then write it on the line" — only the worked example carries a
  // word; the blank cards must still show a writing line, not an empty cell.
  const out = layoutFlashcards([marker('a bus'), blabel('bus'), marker('a car'), marker('a taxi')]);
  const c = cells(out[0]);
  assert.equal(c[0].content[1].content[0].text, 'bus'); // labelled example
  assert.ok(isWritingLine(c[1].content[1])); // blank → writing line
  assert.ok(isWritingLine(c[2].content[1]));
});

test('the label may be a level-3 HEADING (### word), not only **bold**', () => {
  const out = layoutFlashcards([marker('a'), hlabel('bus'), marker('b'), hlabel('car')]);
  const table: any = out[0];
  assert.equal(table.type, 'table');
  const c = cells(table);
  assert.equal(c[0].content[1].type, 'heading');
  assert.equal(c[0].content[1].content[0].text, 'bus');
});

test('a level-2 TITLE between markers is NOT a label — it breaks the run', () => {
  const out = layoutFlashcards([marker('a'), title('Fruits'), marker('b')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'heading', 'paragraph']);
});

test('a full-sentence paragraph between markers breaks the run', () => {
  const out = layoutFlashcards([marker('a'), para('a full sentence of real exercise text here'), marker('b')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'paragraph', 'paragraph']);
});

test('FIVE markers grid to 3 per row and pad the last row rectangular', () => {
  const out = layoutFlashcards(['a', 'b', 'c', 'd', 'e'].map(marker));
  const table: any = out[0];
  assert.deepEqual(rowLengths(table), [3, 3]); // 3 + 3, last padded from 2
  const withMarker = cells(table).filter((cell: any) =>
    cell.content.some((n: any) => n.content?.[0]?.text?.startsWith('[Picture:')),
  );
  assert.equal(withMarker.length, 5);
});

test('FOUR markers grid to 4 per row', () => {
  const out = layoutFlashcards(['a', 'b', 'c', 'd'].map(marker));
  assert.deepEqual(rowLengths(out[0] as any), [4]);
});

test('nodes with no markers pass through untouched', () => {
  const nodes = [para('one'), title('T')];
  assert.deepEqual(layoutFlashcards(nodes), nodes);
});
