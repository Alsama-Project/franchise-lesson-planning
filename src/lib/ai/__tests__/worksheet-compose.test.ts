// @ts-nocheck — behavioural test over loose tiptap-doc JSON. The composer
// (worksheet-compose.ts) is fully typed and tsc-clean; asserting on `.type` / `.attrs`
// of dynamically-built nodes is loose by nature. Node's test runner strips types.
//
// These lock the eleven composition rules: which arrangement each item shape lands on,
// that the year-band numbers actually differ, and that `buildExerciseContent` splices a
// composed exercise into its framing at the `[Items]` marker while the no-items path
// stays the unchanged markdown pipeline. Unit tests are necessary, not sufficient — the
// real check is generating and printing (see the PR notes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeExerciseItems,
  yearBandForYear,
  bandNumbers,
  DEFAULT_WRITING_LINES,
} from '../worksheet-compose';
import { buildExerciseContent } from '../worksheet-assemble';
import { markdownToDoc } from '../../editor/markdown';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Every node in a subtree matching a predicate (self + descendants). */
function findAll(nodes, pred) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (pred(n)) out.push(n);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  (Array.isArray(nodes) ? nodes : [nodes]).forEach(walk);
  return out;
}
const byType = (nodes, type) => findAll(nodes, (n) => n.type === type);
const ruledLines = (nodes) => findAll(nodes, (n) => n.type === 'paragraph' && n.attrs?.wsRule != null);
const tickLines = (nodes) => findAll(nodes, (n) => n.type === 'paragraph' && n.attrs?.wsTick === true);
const images = (nodes) => byType(nodes, 'image');
/** All text anywhere in a subtree, concatenated. */
function allText(nodes) {
  return findAll(nodes, (n) => n.type === 'text').map((n) => n.text).join(' ');
}
/** A ready image slot for a subject (has a storage_path so it resolves to an image). */
function slot(subject) {
  return { slot_id: `sl-${subject}`, subject, brief: `draw ${subject}`, status: 'ready', storage_path: `path/${subject}.png` };
}
const compose = (items, opts = {}) =>
  composeExerciseItems({ items, passage: opts.passage ?? null, band: opts.band ?? 'y0_1', slots: opts.slots ?? [] });

// ── year band ────────────────────────────────────────────────────────────────

test('yearBandForYear: null → the middle band, else by year', () => {
  assert.equal(yearBandForYear(null), 'y2_3'); // centre-scoped plan: middle fails least badly
  assert.equal(yearBandForYear(undefined), 'y2_3');
  assert.equal(yearBandForYear(0), 'y0_1');
  assert.equal(yearBandForYear(1), 'y0_1');
  assert.equal(yearBandForYear(2), 'y2_3');
  assert.equal(yearBandForYear(3), 'y2_3');
  assert.equal(yearBandForYear(4), 'y4_6');
  assert.equal(yearBandForYear(6), 'y4_6');
});

test('year-band numbers differ across bands (grid across, ruled pitch)', () => {
  assert.equal(bandNumbers('y0_1').gridAcross, 3);
  assert.equal(bandNumbers('y2_3').gridAcross, 4);
  assert.equal(bandNumbers('y4_6').gridAcross, 5);
  // Ruled pitch is 10 mm at Year 0-1 and 8 mm above — a real printed difference.
  assert.ok(bandNumbers('y0_1').ruledPitchPx > bandNumbers('y2_3').ruledPitchPx);
});

// ── the eleven rules ───────────────────────────────────────────────────────────

test('rule 1 — picture + short answer → a grid, n across by band', () => {
  const items = ['bus', 'car', 'bike', 'taxi', 'truck'].map((w) => ({ picture: `a ${w}`, answer: w }));
  const slots = items.map((it) => slot(it.picture));
  const y0 = compose(items, { band: 'y0_1', slots });
  const y4 = compose(items, { band: 'y4_6', slots });
  const rowsY0 = byType(y0, 'tableRow');
  const rowsY4 = byType(y4, 'tableRow');
  // 5 cards: 3 across → 2 rows at Year 0-1; 5 across → 1 row at Year 4-6. The band shows.
  assert.equal(rowsY0.length, 2);
  assert.equal(rowsY4.length, 1);
  assert.equal(images(y0).length, 5); // every card's picture resolved by subject
});

test('rule 1 — example prints its word; numeric → number box; blank → ruled line', () => {
  const items = [
    { picture: 'a bus', answer: 'bus', isExample: true },
    { picture: 'a car', answer: 'car' },
    { picture: 'three cats', answer: '3' },
  ];
  const nodes = compose(items, { slots: items.map((it) => slot(it.picture)) });
  assert.match(allText(nodes), /bus/); // the example word is printed
  assert.equal(findAll(nodes, (n) => n.attrs?.wsNumBox === true).length, 1); // numeric answer
  assert.equal(ruledLines(nodes).length, 1); // the one blank card
});

test('rule 2 — picture + sentence → two-column rows; trueFalse reverses to picture-right', () => {
  const items = [
    { picture: 'a bus', sentence: 'The bus is yellow.' },
    { picture: 'a car', sentence: 'The car is red.' },
  ];
  const nodes = compose(items, { slots: items.map((it) => slot(it.picture)) });
  const picCells = findAll(nodes, (n) => n.attrs?.wsMediaCell === 'pic');
  assert.equal(picCells.length, 2);

  // A judgement (declared trueFalse) flips the order: text cell first, picture cell second.
  const tf = compose([{ picture: 'a bus', sentence: 'The bus is flying.', trueFalse: true }], { slots: [slot('a bus')] });
  const firstRow = byType(tf, 'tableRow')[0];
  assert.equal(firstRow.content[0].attrs?.wsMediaCell, 'text');
  assert.equal(firstRow.content[1].attrs?.wsMediaCell, 'pic');
});

test('rule 3 — left + right → three columns, right shuffled off the diagonal', () => {
  const items = [
    { left: 'bus', right: 'bus' },
    { left: 'car', right: 'car' },
    { left: 'bike', right: 'bike' },
    { left: 'taxi', right: 'taxi' },
  ];
  const nodes = compose(items);
  const rows = byType(nodes, 'tableRow');
  assert.equal(rows.length, 4);
  assert.equal(rows[0].content.length, 3); // left | gap | right
  // No right sits beside the left it answers (a fixed-point-free shuffle).
  rows.forEach((r) => {
    const left = allText(r.content[0]);
    const right = allText(r.content[2]);
    assert.notEqual(left.replace(/\W/g, ''), right.replace(/\W/g, ''));
  });
});

test('rule 3 — more than eight pairs becomes two tables', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ left: `l${i}`, right: `r${i}` }));
  assert.equal(byType(compose(items), 'table').length, 2);
});

test('rule 4 — group → one column per group, one line more than the largest group', () => {
  const items = [
    { answer: 'bus', group: 'On roads' },
    { answer: 'car', group: 'On roads' },
    { answer: 'boat', group: 'On water' },
  ];
  const nodes = compose(items);
  assert.equal(byType(nodes, 'tableHeader').length, 2); // two group headings on cream (th)
  // Largest group has 2 → 3 ruled lines per column, 2 columns → 6 ruled lines.
  assert.equal(ruledLines(nodes).length, 6);
});

test('rule 4 — four or more groups wrap, and every table row stays rectangular', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((w, i) => ({ answer: w, group: `G${i}` }));
  const nodes = compose(items); // 5 groups → wraps to two rows of columns
  const rows = byType(nodes, 'tableRow');
  const widths = new Set(rows.map((r) => r.content.length));
  assert.equal(widths.size, 1, 'all rows have the same cell count (rectangular)');
});

test('rule 5 — speaker + reply → dialogue rows; blank reply is a ruled line', () => {
  const items = [
    { speaker: 'Ali', reply: 'How do you come to school?' },
    { speaker: 'You', reply: '' },
  ];
  const nodes = compose(items);
  assert.equal(byType(nodes, 'tableRow').length, 2);
  assert.equal(ruledLines(nodes).length, 1); // the empty reply becomes a writing line
  assert.match(allText(nodes), /Ali/);
});

test('rule 6 — prompt, no answer → writing frame; lines honoured, else default', () => {
  const explicit = compose([{ prompt: 'Write two sentences.', lines: 6 }]);
  assert.equal(ruledLines(explicit).length, 6);
  const fallback = compose([{ prompt: 'Write a sentence.' }]);
  assert.equal(ruledLines(fallback).length, DEFAULT_WRITING_LINES);
});

test('rule 7 — a shared picture → the scene once, never repeated per item', () => {
  const items = [
    { picture: 'a street scene', answer: 'bus', isExample: true },
    { picture: 'a street scene', answer: 'car' },
    { picture: 'a street scene', answer: 'taxi' },
  ];
  const nodes = compose(items, { slots: [slot('a street scene')] });
  assert.equal(images(nodes).length, 1); // the scene, drawn once
  assert.match(allText(nodes), /bus/); // the example label printed
  assert.ok(ruledLines(nodes).length >= 1); // blank label lines for the rest
});

test('rule 8 — a passage → passage text then numbered question rows', () => {
  const items = [{ sentence: 'What colour is the bus?' }, { sentence: 'Where is it going?' }];
  const nodes = compose(items, { passage: 'The bus is yellow. It goes to school.', band: 'y2_3' });
  assert.match(allText(nodes), /yellow/); // the passage text is present
  assert.equal(ruledLines(nodes).length, 2); // one answer line per question
});

test('rule 9 — options, no picture → tick boxes', () => {
  const nodes = compose([{ sentence: 'Pick one.', options: ['yes', 'no'] }]);
  assert.ok(tickLines(nodes).length >= 2);
  assert.equal(images(nodes).length, 0);
});

test('rule 10 — no picture, answer in a sentence → an inline blank of underscores', () => {
  const nodes = compose([{ sentence: 'The ___ is red.', answer: 'bus' }]);
  assert.match(allText(nodes), /_{6,}/); // the blank is normalised to a wide underscore run
  assert.equal(images(nodes).length, 0);
  assert.equal(byType(nodes, 'table').length, 0); // plain numbered flow, no table
});

test('rule 11 — a mix of shapes falls back to one row per item', () => {
  const items = [
    { picture: 'a bus', answer: 'bus' }, // picture-shaped
    { sentence: 'Write about transport.' }, // prose-shaped
    { left: 'a', right: 'b' }, // matching-shaped
  ];
  const nodes = compose(items, { slots: [slot('a bus')] });
  // A mixed exercise never matches rules 1-10; rule 11 gives it a safe layout.
  assert.ok(nodes.length >= 3);
  assert.match(allText(nodes), /transport/);
});

// ── buildExerciseContent: the items path vs the markdown path ───────────────────

test('buildExerciseContent — items splice into the framing at the [Items] marker', () => {
  const framing = markdownToDoc('## Transport Words\n\nLook and write.\n\n[Items]\n\n### Extension\n\nWrite more.');
  const items = [{ picture: 'a bus', answer: 'bus' }, { picture: 'a car', answer: 'car' }];
  const out = buildExerciseContent(framing, [slot('a bus'), slot('a car')], { items, band: 'y0_1' });
  // The [Items] marker paragraph is gone, replaced by the composed grid; framing kept.
  assert.ok(!findAll(out, (n) => n.type === 'text' && /\[Items\]/.test(n.text)).length);
  assert.equal(byType(out, 'table').length, 1);
  assert.match(allText(out), /Transport Words/);
  assert.match(allText(out), /Extension/);
  assert.equal(images(out).length, 2);
});

test('buildExerciseContent — items with no marker append after the framing', () => {
  const framing = markdownToDoc('## Title\n\nIntro.');
  const out = buildExerciseContent(framing, [], { items: [{ prompt: 'Write.', lines: 2 }], band: 'y2_3' });
  assert.match(allText(out), /Title/);
  assert.equal(ruledLines(out).length, 2);
});

test('buildExerciseContent — no items runs the unchanged markdown path', () => {
  const framing = markdownToDoc('## Title\n\nA plain paragraph, no pictures.');
  const out = buildExerciseContent(framing, [], { items: null, band: 'y2_3' });
  // No composition parts appear; the body is passed through the old pipeline.
  assert.equal(ruledLines(out).length, 0);
  assert.equal(tickLines(out).length, 0);
  assert.match(allText(out), /plain paragraph/);
});

test('buildExerciseContent — a not-yet-ready picture degrades to its [Picture: …] marker', () => {
  // No slot for the subject → the composer leaves the marker text, which a later
  // recompile (after image generation) resolves. No crash, graceful fallback.
  const out = buildExerciseContent(null, [], { items: [{ picture: 'a bus', answer: 'bus' }, { picture: 'a car', answer: 'car' }], band: 'y0_1' });
  assert.equal(images(out).length, 0);
  assert.match(allText(out), /\[Picture: a bus\]/);
});
