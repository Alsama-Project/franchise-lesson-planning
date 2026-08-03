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
