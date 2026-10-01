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
import {
  assembleWorksheetDoc,
  isCompiled,
  COMPILED_ATTR,
  EXERCISE_ID_ATTR,
  nodeExerciseId,
  planExerciseSplice,
  fillImageSlots,
} from '../worksheet-assemble';
import { markdownToDoc } from '../../editor/markdown';

/** An image slot as the exercise route hands it to fillImageSlots. `storage_path`
 *  null → the marker is left as text (image not ready). */
function slot(id, storagePath) {
  return { slot_id: id, storage_path: storagePath, subject: 'a fox', brief: 'a red fox' };
}
/** A paragraph node holding the given inline children (text strings become text nodes). */
function paraNodes(...inline) {
  return {
    type: 'paragraph',
    content: inline.map((c) => (typeof c === 'string' ? { type: 'text', text: c } : c)),
  };
}

/** A scaffold with two headings, built the same way compile builds its base. */
function scaffoldContent() {
  return markdownToDoc('# Warm up\n\nDo this first.\n\n# Practice\n\nThen this.').content;
}

/** A prepared exercise: one paragraph of body text under the given anchor. `id` is
 *  optional so the legacy idempotency tests (no identity) stay byte-identical. */
function exercise(anchor, text, id) {
  return { id, anchor, nodes: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
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

test('every scaffold heading is kept, even with nothing under it (no pruning)', () => {
  const base = bareHeadingsScaffold();
  const out = assembleWorksheetDoc(base, [
    exercise('One', 'First task'),
    exercise('Two', 'Second task'),
    exercise('Four', 'Fourth task'),
  ]).doc.content;

  assert.deepEqual(headingTexts(out), ['One', 'Two', 'Three', 'Four'], 'empty "Three" must survive');
  assert.deepEqual(
    out.map((n) => n.content?.[0]?.text),
    ['One', 'First task', 'Two', 'Second task', 'Three', 'Four', 'Fourth task'],
  );
});

test('nothing anchors → every heading stays, orphans append in order', () => {
  const out = assembleWorksheetDoc(bareHeadingsScaffold(), [
    exercise('No Such Heading', 'Orphan one'),
    exercise(null, 'Orphan two'),
  ]).doc.content;
  assert.deepEqual(headingTexts(out), ['One', 'Two', 'Three', 'Four']);
  assert.deepEqual(out.slice(-2).map((n) => n.content?.[0]?.text), ['Orphan one', 'Orphan two']);
});

test('anchor mode still converges when output is fed back as the base', () => {
  const exercises = [exercise('One', 'First'), exercise('Three', 'Third')];
  const first = assembleWorksheetDoc(bareHeadingsScaffold(), exercises);
  const second = assembleWorksheetDoc(first.doc.content, exercises);
  assert.deepEqual(second, first);
});

// ── Token mode ({{block:<slot>}}) ────────────────────────────────────────────

const TEMPLATE = [
  '## Warm-up and Recap',
  'hint: A short activity that recaps prior knowledge.',
  '{{block:recap}}',
  '## Independent Practice',
  'hint: Write the task instructions here.',
  '{{block:independent_practice}}',
  '## Group Practice',
  'hint: Write the task here.',
  '{{block:group_practice}}',
  '## Subject: {{subject}} — {{theme}}',
].join('\n\n');

const tpl = () => markdownToDoc(TEMPLATE, { templateMarkers: true }).content;
const txt = (n) => n.content?.map((c) => c.text ?? '').join('') ?? '';
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

test('markdownToDoc: hint lines become empty attr-only paragraphs; tokens stay as text', () => {
  const content = tpl();
  assert.equal(content[1].type, 'paragraph');
  assert.equal(content[1].attrs.placeholder, 'A short activity that recaps prior knowledge.');
  assert.equal(content[1].content, undefined, 'a hint carries no text content');
  assert.equal(txt(content[2]), '{{block:recap}}');
  // Off by default: AI exercise bodies never get hint/token treatment.
  assert.equal(markdownToDoc('hint: nope').content[0].attrs, undefined);
});

test('token mode: plan text then exercises land at the token, hint/stub removed, headings intact', () => {
  const out = assembleWorksheetDoc(
    tpl(),
    [
      { id: 'e1', anchor: null, slot: 'independent_practice', nodes: [p('Ex A1'), p('Ex A2')] },
      { id: 'e2', anchor: null, slot: 'independent_practice', nodes: [p('Ex B')] },
    ],
    {
      blockContent: { recap: [p('Recap text')], independent_practice: [p('Teacher text')] },
      placeholders: { subject: '', theme: '' },
    },
  ).doc.content;

  assert.deepEqual(out.map(txt), [
    'Warm-up and Recap',
    'Recap text',
    'Independent Practice',
    'Teacher text',
    'Ex A1',
    'Ex A2',
    'Ex B',
    'Group Practice',
    // empty slot keeps its hint (an empty node); the token itself never prints
    '',
    'Subject:  — ',
  ]);
  assert.equal(out[8].attrs.placeholder, 'Write the task here.', 'empty section keeps its hint');
  assert.equal(out.some((n) => txt(n).includes('{{block')), false);
  // The exercise is one contiguous, fully-tagged group inside its section.
  const ids = out.map((n) => n.attrs?.[EXERCISE_ID_ATTR] ?? null);
  assert.deepEqual(ids.slice(4, 7), ['e1', 'e1', 'e2']);
});

test('token mode: field tokens resolve in the template body', () => {
  const out = assembleWorksheetDoc(tpl(), [], { placeholders: { subject: 'Professionalism', theme: 'Teamwork' } })
    .doc.content;
  assert.equal(txt(out[out.length - 1]), 'Subject: Professionalism — Teamwork');
});

test('token mode: a legacy exercise (no slot) falls back to its heading anchor, else appends', () => {
  const out = assembleWorksheetDoc(tpl(), [
    exercise('Group Practice', 'Anchored'),
    exercise(null, 'Loose'),
  ]).doc.content;
  const idx = out.findIndex((n) => txt(n) === 'Group Practice');
  assert.equal(txt(out[idx + 1]), 'Anchored');
  assert.equal(txt(out[out.length - 1]), 'Loose');
});

test('token mode converges across two assembles over the same scaffold', () => {
  const opts = { blockContent: { recap: [p('R')] }, placeholders: { subject: 'S' } };
  const ex = [{ id: 'e1', anchor: null, slot: 'recap', nodes: [p('x')] }];
  assert.deepEqual(assembleWorksheetDoc(tpl(), ex, opts), assembleWorksheetDoc(tpl(), ex, opts));
});

// ── Exercise identity (Option A) ─────────────────────────────────────────────
// Every node of an exercise carries its row id, so a later per-exercise regenerate
// can find and replace exactly that exercise's range. Idempotency is preserved.

test('assemble stamps each exercise’s id on every one of its nodes', () => {
  const twoNode = { id: 'ex-A', anchor: 'Practice', nodes: [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Part A' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
  ] };
  const out = assembleWorksheetDoc(scaffoldContent(), [twoNode, exercise('Warm up', 'Hi', 'ex-B')]).doc.content;

  const aNodes = out.filter((n) => nodeExerciseId(n) === 'ex-A');
  assert.equal(aNodes.length, 2, 'both of exercise A’s nodes carry its id');
  assert.ok(aNodes.every(isCompiled), 'id-carrying nodes are also wsCompiled');
  const bNodes = out.filter((n) => nodeExerciseId(n) === 'ex-B');
  assert.equal(bNodes.length, 1, 'exercise B’s single node carries its own id');
  // Scaffold headings are never stamped with an exercise id.
  assert.equal(nodeExerciseId(out.find((n) => n.content?.[0]?.text === 'Warm up')), null);
});

test('assemble is idempotent WITH ids (re-compile over its own output is byte-identical)', () => {
  const base = scaffoldContent();
  const exercises = [exercise('Warm up', 'Say hello', 'ex-1'), exercise('Practice', 'Fill gaps', 'ex-2')];
  const first = assembleWorksheetDoc(base, exercises);
  const second = assembleWorksheetDoc(first.doc.content, exercises);
  assert.deepEqual(second, first, 're-compile must strip prior ids+markers and restamp identically');
  assert.equal(first.doc.content.find((n) => n.content?.[0]?.text === 'Say hello').attrs[EXERCISE_ID_ATTR], 'ex-1');
});

// ── planExerciseSplice ───────────────────────────────────────────────────────
// The range is every top-level node carrying the id (contiguous or not); the insert
// lands where the first one was; teacher nodes between them are never removed.

const idNode = (id, text) => ({ type: 'paragraph', attrs: { [COMPILED_ATTR]: true, [EXERCISE_ID_ATTR]: id }, content: [{ type: 'text', text }] });
const plainNode = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const headingNode = (text) => markdownToDoc(`# ${text}`).content[0];

test('splice plan: a contiguous exercise range removes all its nodes, inserts at the first', () => {
  const nodes = [headingNode('Warm up'), idNode('ex-1', 'a'), idNode('ex-1', 'b'), idNode('ex-2', 'c')];
  const plan = planExerciseSplice(nodes, 'ex-1', null);
  assert.deepEqual(plan.removeIndices, [1, 2]);
  assert.equal(plan.insertIndex, 1);
});

test('splice plan: a teacher node interleaved in the range survives (not removed)', () => {
  // Teacher wrote a paragraph (index 2) between the exercise’s two nodes.
  const nodes = [idNode('ex-1', 'a'), idNode('ex-1', 'b'), plainNode('teacher note'), idNode('ex-1', 'c')];
  const plan = planExerciseSplice(nodes, 'ex-1', null);
  assert.deepEqual(plan.removeIndices, [0, 1, 3], 'only id-carrying nodes are removed');
  assert.ok(!plan.removeIndices.includes(2), 'the teacher node at index 2 is preserved');
  assert.equal(plan.insertIndex, 0, 'new content lands where the exercise began');
});

test('splice plan: a deleted exercise inserts just after its scaffold anchor', () => {
  const nodes = [headingNode('Warm up'), plainNode('intro'), headingNode('Practice'), plainNode('other')];
  const plan = planExerciseSplice(nodes, 'ex-gone', 'Practice');
  assert.deepEqual(plan.removeIndices, []);
  assert.equal(plan.insertIndex, 3, 'insert right after the "Practice" heading (index 2)');
});

test('splice plan: a deleted exercise with no anchor match appends at the end', () => {
  const nodes = [headingNode('Warm up'), plainNode('intro')];
  assert.deepEqual(planExerciseSplice(nodes, 'ex-gone', 'No Such Heading'), { removeIndices: [], insertIndex: 2 });
  assert.deepEqual(planExerciseSplice(nodes, 'ex-gone', null), { removeIndices: [], insertIndex: 2 });
});

// ── fillImageSlots: marker-RUN replacement (inline images) ───────────────────
// The marker is replaced IN PLACE within its text run, so an image can sit beside a
// word; surrounding text keeps its position. A marker alone in its paragraph yields a
// paragraph holding just the image (the legal inline form of the old block image).
// Pairing is by marker order across the whole exercise; the index advances on every
// marker, resolved or not, and an unresolved marker is left as its literal text.

test('a marker alone in its paragraph becomes a paragraph holding just the image', () => {
  const nodes = [paraNodes('[Picture: a fox]')];
  const [p] = fillImageSlots(nodes, [slot('slot-1', 'imgs/fox.png')]);
  assert.equal(p.type, 'paragraph');
  assert.equal(p.content.length, 1);
  assert.equal(p.content[0].type, 'image');
  assert.equal(p.content[0].attrs.storagePath, 'imgs/fox.png');
  assert.equal(p.content[0].attrs.slotId, 'slot-1');
  assert.equal(p.content[0].attrs.src, null, 'src stays null so resolveImageSrc re-signs');
});

test('a marker embedded in a sentence becomes an inline image between the words', () => {
  const nodes = [paraNodes('The ', '[Picture: a fox]', ' jumped.')];
  const [p] = fillImageSlots(nodes, [slot('slot-1', 'imgs/fox.png')]);
  assert.deepEqual(
    p.content.map((c) => c.type),
    ['text', 'image', 'text'],
  );
  assert.equal(p.content[0].text, 'The ');
  assert.equal(p.content[2].text, ' jumped.');
});

test('a marker mid-text (single text node) splits that node around the image', () => {
  const nodes = [paraNodes('The [Picture: a fox] jumped.')];
  const [p] = fillImageSlots(nodes, [slot('slot-1', 'imgs/fox.png')]);
  assert.deepEqual(
    p.content.map((c) => c.type),
    ['text', 'image', 'text'],
  );
  assert.equal(p.content[0].text, 'The ');
  assert.equal(p.content[2].text, ' jumped.');
});

test('two markers in one paragraph become two inline images, paired in order', () => {
  const nodes = [paraNodes('A [Picture: a fox] and a [Picture: a hen].')];
  const [p] = fillImageSlots(nodes, [slot('s1', 'imgs/fox.png'), slot('s2', 'imgs/hen.png')]);
  const images = p.content.filter((c) => c.type === 'image');
  assert.equal(images.length, 2);
  assert.equal(images[0].attrs.storagePath, 'imgs/fox.png');
  assert.equal(images[1].attrs.storagePath, 'imgs/hen.png');
});

test('an unresolved slot (null storage) leaves the marker text exactly as it was', () => {
  const nodes = [paraNodes('The ', '[Picture: a fox]', ' jumped.')];
  const [p] = fillImageSlots(nodes, [slot('slot-1', null)]);
  // No image node; the run is unchanged text.
  assert.equal(p.content.every((c) => c.type === 'text'), true);
  assert.equal(p.content.map((c) => c.text).join(''), 'The [Picture: a fox] jumped.');
});

test('a null-storage marker still advances the index so a later marker keeps its slot', () => {
  const nodes = [paraNodes('[Picture: first]'), paraNodes('[Picture: second]')];
  // slots[0] not ready, slots[1] ready — the second marker must pair with slots[1].
  const out = fillImageSlots(nodes, [slot('s1', null), slot('s2', 'imgs/second.png')]);
  assert.equal(out[0].content[0].type, 'text', 'first marker left as text');
  assert.equal(out[1].content[0].type, 'image', 'second marker resolved');
  assert.equal(out[1].content[0].attrs.storagePath, 'imgs/second.png');
});

test('marks on the split text are preserved on both sides of the image', () => {
  const bold = { type: 'text', text: 'The [Picture: a fox] ran', marks: [{ type: 'bold' }] };
  const [p] = fillImageSlots([paraNodes(bold)], [slot('s1', 'imgs/fox.png')]);
  const texts = p.content.filter((c) => c.type === 'text');
  assert.equal(texts.length, 2);
  for (const tnode of texts) assert.deepEqual(tnode.marks, [{ type: 'bold' }]);
});

test('a marker nested in a list item resolves inline, list stays the top-level node', () => {
  const list = {
    type: 'bulletList',
    content: [{ type: 'listItem', content: [paraNodes('See [Picture: a fox] here')] }],
  };
  const [out] = fillImageSlots([list], [slot('s1', 'imgs/fox.png')]);
  assert.equal(out.type, 'bulletList', 'top-level node count/shape preserved');
  const li = out.content[0].content[0];
  assert.deepEqual(li.content.map((c) => c.type), ['text', 'image', 'text']);
});

test('nodes with no markers pass through by reference (top-level count preserved)', () => {
  const clean = paraNodes('No pictures here.');
  const nodes = [clean];
  const out = fillImageSlots(nodes, []);
  assert.equal(out.length, 1);
  assert.equal(out[0], clean, 'unchanged node → same reference');
});
