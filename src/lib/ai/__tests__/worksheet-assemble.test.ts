// @ts-nocheck — behavioural test over loose tiptap-doc JSON (`content?: unknown[]`).
// The assembly module (worksheet-assemble.ts) is fully typed and tsc-clean; asserting
// on `.doc.content[i].type` is dynamic by nature. Node's test runner strips types.
//
// These lock the compile IDEMPOTENCY contract George asked to verify: two consecutive
// compiles over unchanged inputs converge, byte-for-byte — including the belt-and-
// braces case where a prior run's output is fed back in as the base (the strip must
// recover the bare scaffold). Plus the anchor-matching and no-scaffold behaviours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleWorksheetDoc, isCompiled, COMPILED_ATTR } from '../worksheet-assemble';
import { markdownToDoc } from '../../editor/markdown';

/** A scaffold with two headings, built the same way compile builds its base. */
function scaffoldContent() {
  return markdownToDoc('# Warm up\n\nDo this first.\n\n# Practice\n\nThen this.').content;
}

/** A prepared exercise: one paragraph of body text under the given anchor. */
function exercise(anchor, text) {
  return { anchor, nodes: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

test('two consecutive assembles over identical inputs are byte-identical', () => {
  const base = scaffoldContent();
  const baseSnapshot = JSON.stringify(base);
  const exercises = [exercise('Practice', 'A gap-fill'), exercise(null, 'An extra')];

  const first = assembleWorksheetDoc(base, exercises);
  const second = assembleWorksheetDoc(base, exercises);

  assert.deepEqual(second, first, 'compile must be deterministic across runs');
  // The pure function must not mutate its caller's arrays (base reused above).
  assert.equal(JSON.stringify(base), baseSnapshot, 'base scaffold array was mutated');
});

test('feeding a prior run’s output back as the base converges (strip recovers scaffold)', () => {
  const base = scaffoldContent();
  const exercises = [exercise('Warm up', 'Say hello'), exercise('Practice', 'Fill the gaps')];

  const first = assembleWorksheetDoc(base, exercises);
  // Simulate the worst case: the previous compiled doc is used as the next base.
  const second = assembleWorksheetDoc(first.doc.content, exercises);

  assert.deepEqual(second, first, 'a re-compile over compiled output must not stack duplicates');
});

test('a matching anchor inserts right after its heading; every inserted node is tagged', () => {
  const base = scaffoldContent();
  const out = assembleWorksheetDoc(base, [exercise('Practice', 'Fill the gaps')]).doc.content;

  const practiceIdx = out.findIndex((n) => n.type === 'heading' && n.content?.[0]?.text === 'Practice');
  assert.ok(practiceIdx >= 0, 'Practice heading missing');
  const inserted = out[practiceIdx + 1];
  assert.equal(inserted.content?.[0]?.text, 'Fill the gaps', 'exercise not placed after its anchor');
  assert.equal(inserted.attrs?.[COMPILED_ATTR], true, 'inserted node not tagged wsCompiled');
  assert.ok(isCompiled(inserted));
  // The scaffold heading itself is never tagged.
  assert.ok(!isCompiled(out[practiceIdx]));
});

test('an unmatched anchor and a null anchor both append after the scaffold, in order', () => {
  const base = scaffoldContent();
  const out = assembleWorksheetDoc(base, [
    exercise('No Such Heading', 'Orphan one'),
    exercise(null, 'Orphan two'),
  ]).doc.content;

  const texts = out.map((n) => n.content?.[0]?.text);
  // Both scaffold headings come first, then the two appended exercises in order.
  assert.deepEqual(texts.slice(-2), ['Orphan one', 'Orphan two']);
});

test('no scaffold → exercises alone, in order, all tagged', () => {
  const out = assembleWorksheetDoc([], [exercise(null, 'One'), exercise(null, 'Two')]).doc.content;
  assert.deepEqual(out.map((n) => n.content?.[0]?.text), ['One', 'Two']);
  assert.ok(out.every(isCompiled), 'every appended node should be tagged');
});

// ── Empty-heading drop ───────────────────────────────────────────────────────
// Compile must not hand a student a bare scaffold heading over blank space. A
// heading survives only when something landed under it: a spliced exercise, or
// coordinator-written prose the template carries. These lock that.

/** A prose-free scaffold: four headings, nothing written under any of them. */
function bareHeadingsScaffold() {
  return markdownToDoc('# One\n\n# Two\n\n# Three\n\n# Four').content;
}

const headingTexts = (content) =>
  content.filter((n) => n.type === 'heading').map((n) => n.content?.[0]?.text);

test('more sections than exercises → sections with nothing under them are dropped', () => {
  const base = bareHeadingsScaffold();
  // Three exercises anchor to three of the four headings; "Three" gets nothing.
  const out = assembleWorksheetDoc(base, [
    exercise('One', 'First task'),
    exercise('Two', 'Second task'),
    exercise('Four', 'Fourth task'),
  ]).doc.content;

  assert.deepEqual(headingTexts(out), ['One', 'Two', 'Four'], 'the empty "Three" heading must be dropped');
  // Each surviving heading still carries its exercise, in order.
  assert.deepEqual(
    out.map((n) => n.content?.[0]?.text),
    ['One', 'First task', 'Two', 'Second task', 'Four', 'Fourth task'],
  );
});

test('a heading with coordinator prose but no exercise survives', () => {
  // "Notes" carries fixed wording a coordinator wrote; no exercise anchors to it.
  const base = markdownToDoc('# Warm up\n\n# Notes\n\nRead the passage aloud before you start.').content;
  const out = assembleWorksheetDoc(base, [exercise('Warm up', 'Say hello')]).doc.content;

  assert.deepEqual(headingTexts(out), ['Warm up', 'Notes'], 'coordinator-written prose must keep its heading');
  const notesIdx = out.findIndex((n) => n.type === 'heading' && n.content?.[0]?.text === 'Notes');
  assert.equal(
    out[notesIdx + 1]?.content?.[0]?.text,
    'Read the passage aloud before you start.',
    'the coordinator prose must remain under its heading',
  );
});

test('nothing anchors → every scaffold heading is dropped, exercises stand alone', () => {
  const base = bareHeadingsScaffold();
  const out = assembleWorksheetDoc(base, [
    exercise('No Such Heading', 'Orphan one'),
    exercise(null, 'Orphan two'),
  ]).doc.content;

  assert.deepEqual(headingTexts(out), [], 'no heading kept any content, so none survive');
  assert.deepEqual(out.map((n) => n.content?.[0]?.text), ['Orphan one', 'Orphan two']);
});

test('a parent heading whose only child heading is empty is dropped with it', () => {
  // "Section" (##) holds only "Subsection" (###); nothing anchors to either.
  const base = markdownToDoc('# Keep\n\n## Section\n\n### Subsection').content;
  const out = assembleWorksheetDoc(base, [exercise('Keep', 'Held')]).doc.content;

  assert.deepEqual(headingTexts(out), ['Keep'], 'empty parent + empty child both drop, non-empty heading stays');
});

test('a parent heading survives when a nested child heading holds an exercise', () => {
  const base = markdownToDoc('# Unit\n\n## Section\n\n### Task').content;
  const out = assembleWorksheetDoc(base, [exercise('Task', 'The deep one')]).doc.content;

  // The exercise sits under the ### child; both ancestors must survive above it.
  assert.deepEqual(headingTexts(out), ['Unit', 'Section', 'Task']);
  const taskIdx = out.findIndex((n) => n.type === 'heading' && n.content?.[0]?.text === 'Task');
  assert.equal(out[taskIdx + 1]?.content?.[0]?.text, 'The deep one');
});

test('a heading inside an exercise body is never dropped as a scaffold heading', () => {
  const base = bareHeadingsScaffold();
  // The exercise body itself opens with a heading node (as a model might emit).
  const exerciseWithHeading = {
    anchor: 'One',
    nodes: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Part A' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
    ],
  };
  const out = assembleWorksheetDoc(base, [exerciseWithHeading]).doc.content;

  // "One" survives (its exercise landed) and the exercise's own "Part A" heading is
  // preserved; the other bare scaffold headings drop.
  assert.deepEqual(headingTexts(out), ['One', 'Part A']);
  assert.ok(isCompiled(out.find((n) => n.content?.[0]?.text === 'Part A')), 'exercise heading stays tagged');
});

test('empty-heading drop still converges across two consecutive compiles', () => {
  const base = bareHeadingsScaffold();
  const exercises = [exercise('One', 'First'), exercise('Three', 'Third')];

  const first = assembleWorksheetDoc(base, exercises);
  // Worst case: feed the compiled output (with empties already dropped) back in.
  const second = assembleWorksheetDoc(first.doc.content, exercises);

  assert.deepEqual(second, first, 'dropping empty headings must not break re-compile convergence');
  assert.deepEqual(headingTexts(first.doc.content), ['One', 'Three'], 'Two and Four dropped, One and Three kept');
});
