import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { layoutExercisePictures } from '../worksheet-assemble';

// `layoutExercisePictures` runs BEFORE `fillImageSlots`, on the OUTPUT of `markdownToDoc` — so
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
  const out = layoutExercisePictures([para('intro'), marker('a bus'), para('after')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'paragraph', 'paragraph']);
});

test('a lone marker + its label stay inline', () => {
  const out = layoutExercisePictures([marker('a bus'), blabel('bus')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'paragraph']);
});

test('TWO markers become one side-by-side row (a wsFlashcards table)', () => {
  const out = layoutExercisePictures([marker('a'), marker('b')]);
  assert.equal(out.length, 1);
  const table: any = out[0];
  assert.equal(table.type, 'table');
  assert.deepEqual(rowLengths(table), [2]); // one row, two cells
  assert.equal(cells(table).length, 2);
  // Every cell carries the borderless-grid marker (styled via FlashcardTableStyle).
  assert.ok(cells(table).every((c: any) => c.attrs.wsFlashcardCell === true));
});

test('each cell carries its marker paragraph over its word', () => {
  const out = layoutExercisePictures([marker('a bus'), blabel('bus'), marker('a car'), blabel('car')]);
  const c = cells(out[0]);
  // Cell content = [ marker paragraph, label ].
  assert.equal(c[0].content[0].content[0].text, '[Picture: a bus]');
  assert.equal(c[0].content[1].content[0].text, 'bus');
});

test('a card the model left BLANK gets a synthesised writing line (the real case)', () => {
  // "say the word aloud, then write it on the line" — only the worked example carries a
  // word; the blank cards must still show a writing line, not an empty cell.
  const out = layoutExercisePictures([marker('a bus'), blabel('bus'), marker('a car'), marker('a taxi')]);
  const c = cells(out[0]);
  assert.equal(c[0].content[1].content[0].text, 'bus'); // labelled example
  assert.ok(isWritingLine(c[1].content[1])); // blank → writing line
  assert.ok(isWritingLine(c[2].content[1]));
});

test('the label may be a level-3 HEADING (### word), not only **bold**', () => {
  const out = layoutExercisePictures([marker('a'), hlabel('bus'), marker('b'), hlabel('car')]);
  const table: any = out[0];
  assert.equal(table.type, 'table');
  const c = cells(table);
  assert.equal(c[0].content[1].type, 'heading');
  assert.equal(c[0].content[1].content[0].text, 'bus');
});

test('a level-2 TITLE between markers is NOT a label — it breaks the run', () => {
  const out = layoutExercisePictures([marker('a'), title('Fruits'), marker('b')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'heading', 'paragraph']);
});

test('a full-sentence paragraph between markers breaks the run', () => {
  const out = layoutExercisePictures([marker('a'), para('a full sentence of real exercise text here'), marker('b')]);
  assert.deepEqual(out.map((n: any) => n.type), ['paragraph', 'paragraph', 'paragraph']);
});

test('FIVE markers grid to 3 per row and pad the last row rectangular', () => {
  const out = layoutExercisePictures(['a', 'b', 'c', 'd', 'e'].map(marker));
  const table: any = out[0];
  assert.deepEqual(rowLengths(table), [3, 3]); // 3 + 3, last padded from 2
  const withMarker = cells(table).filter((cell: any) =>
    cell.content.some((n: any) => n.content?.[0]?.text?.startsWith('[Picture:')),
  );
  assert.equal(withMarker.length, 5);
});

test('FOUR markers grid to 4 per row', () => {
  const out = layoutExercisePictures(['a', 'b', 'c', 'd'].map(marker));
  assert.deepEqual(rowLengths(out[0] as any), [4]);
});

test('nodes with no markers pass through untouched', () => {
  const nodes = [para('one'), title('T')];
  assert.deepEqual(layoutExercisePictures(nodes), nodes);
});

// ── Image-beside-sentence rows (picture-prompted gap fill) ───────────────────────────
// A `[Picture: …]` marker followed by a NUMBERED line — after markdownToDoc, a single-item
// orderedList — is NOT a flashcard: the picture belongs beside its OWN sentence. The run
// becomes a two-column table (narrow picture | sentence), one row per pair.

const olist = (t: string, start = 1) => ({ type: 'orderedList', attrs: { start }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }] });
const blist = (t: string) => ({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }] });

test('a picture followed by a numbered line builds an image-beside-sentence row', () => {
  const out = layoutExercisePictures([marker('a car'), olist('The ___ is waiting.')]);
  assert.equal(out.length, 1);
  const table: any = out[0];
  assert.equal(table.type, 'table');
  assert.deepEqual(rowLengths(table), [2]); // one row: pic | text
  const [pic, text] = cells(table);
  assert.equal(pic.attrs.wsMediaCell, 'pic');
  assert.equal(text.attrs.wsMediaCell, 'text');
  // The pic cell holds the marker paragraph (fillImageSlots resolves it later).
  assert.equal(pic.content[0].content[0].text, '[Picture: a car]');
  // The text cell holds the sentence list.
  assert.equal(text.content[0].type, 'orderedList');
});

test('FOUR picture+sentence pairs become one table of four rows (the real gap fill)', () => {
  const out = layoutExercisePictures([
    marker('a car'), olist('The ___ is waiting.', 1),
    marker('a truck'), olist('A ___ carries boxes.', 2),
    marker('a bus'), olist('The ___ stops.', 3),
    marker('a bike'), olist('She rides her ___.', 4),
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(rowLengths(out[0] as any), [2, 2, 2, 2]);
  // Every row is pic | text.
  assert.ok(cells(out[0] as any).every((c: any) => c.attrs.wsMediaCell === 'pic' || c.attrs.wsMediaCell === 'text'));
});

test('a bulletted sentence also triggers an image-beside-sentence row', () => {
  const out = layoutExercisePictures([marker('a dog'), blist('The ___ barks.')]);
  assert.equal((out[0] as any).type, 'table');
  assert.equal(cells(out[0] as any)[1].content[0].type, 'bulletList');
});

test('the built tables are valid against the worksheet Table schema', () => {
  const schema = getSchema([
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
  ]);
  // A media table (orderedList inside a cell) AND a flashcard grid must both parse.
  const media = layoutExercisePictures([marker('a car'), olist('The ___ is here.'), marker('a bus'), olist('A ___ waits.')]);
  const grid = layoutExercisePictures([marker('a'), blabel('bus'), marker('b'), blabel('car')]);
  assert.doesNotThrow(() => PMNode.fromJSON(schema, { type: 'doc', content: media }));
  assert.doesNotThrow(() => PMNode.fromJSON(schema, { type: 'doc', content: grid }));
});

test('a list following a marker wins over the flashcard grid (media, not grid)', () => {
  // [marker, list] is a media pair; the trailing [marker, marker] is a flashcard grid.
  const out = layoutExercisePictures([marker('a'), olist('x'), marker('b'), marker('c')]);
  assert.equal(out.length, 2);
  const media: any = out[0];
  const grid: any = out[1];
  assert.equal(media.type, 'table');
  assert.equal(media.content[0].content[0].attrs.wsMediaCell, 'pic');
  assert.equal(grid.type, 'table');
  assert.ok(cells(grid).every((c: any) => c.attrs.wsFlashcardCell === true));
});
