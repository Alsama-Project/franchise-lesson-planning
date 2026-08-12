// @ts-nocheck — behavioural/schema test over dynamic tiptap JSON.
//
// WHAT THIS PROVES — the composition PARTS the eleven rules need (ruled answer lines,
// tick boxes, number boxes, borderless cells) are carried by GLOBAL ATTRIBUTES that
//   (1) survive a getJSON() round trip (a teacher keystroke can't strip them), and
//   (2) serialise to the right CSS classes — and the year-banded `min-height` — through
//       the SAME static-DOM path the print / PDF `generateHTML` uses.
//
// (2) is the load-bearing claim: George's decision was that ruled lines be a class on a
// global attribute (the wsFlashcardCell precedent), not a new node — "it survives
// getJSON, it prints, it does not touch the schema". This test exercises exactly that,
// headlessly. It follows `wsCompiledMarker.test.ts`'s technique: `spec.toDOM(node)` is
// the DOMOutputSpec generateHTML serialises, so asserting on it needs no browser DOM.
//
// This is NOT a substitute for printing a real worksheet at Year 0 and Year 4 (see the
// PR notes) — it proves the mechanism, not the finished page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { FlashcardTableStyle } from '../nodes/FlashcardTableStyle';
import { MediaCellStyle } from '../nodes/MediaCellStyle';
import { WorksheetPartStyle } from '../nodes/WorksheetPartStyle';
import { composeExerciseItems } from '../../../../../lib/ai/worksheet-compose';

/** A schema carrying the real part-style extensions over the table/paragraph base — the
 *  serialisation surface the shipped bundle uses for these attributes. */
function schema() {
  return getSchema([
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Table.configure({ resizable: true, cellMinWidth: 40 }),
    TableRow,
    TableHeader,
    TableCell,
    FlashcardTableStyle,
    MediaCellStyle,
    WorksheetPartStyle,
  ]);
}

/** The static DOM (DOMOutputSpec) the print/generateHTML path serialises for one node. */
function domSpec(sch, nodeJSON) {
  const node = PMNode.fromJSON(sch, { type: 'doc', content: [nodeJSON] }).firstChild;
  return JSON.stringify(sch.nodes[node.type.name].spec.toDOM(node));
}

/** Every node in a subtree matching a predicate. */
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

test('a ruled line serialises to .ws-rule with a min-height, and it is year-banded', () => {
  const sch = schema();
  // Rule 6 (writing frame) emits ruled lines at the band's pitch.
  const y0 = composeExerciseItems({ items: [{ prompt: 'Write.', lines: 1 }], passage: null, band: 'y0_1', slots: [] });
  const y4 = composeExerciseItems({ items: [{ prompt: 'Write.', lines: 1 }], passage: null, band: 'y4_6', slots: [] });
  const ruleY0 = findAll(y0, (n) => n.attrs?.wsRule != null)[0];
  const ruleY4 = findAll(y4, (n) => n.attrs?.wsRule != null)[0];
  assert.ok(ruleY0 && ruleY4, 'both bands emit a ruled line');

  const domY0 = domSpec(sch, ruleY0);
  assert.match(domY0, /ws-rule/, 'the ruled line carries the ws-rule class into the print DOM');
  assert.match(domY0, /min-height:\d+px/, 'and an explicit min-height (the band pitch)');

  // The Year 0-1 pitch (10 mm) is taller than the Year 4-6 pitch (8 mm) — the printed
  // number actually differs by band, which is the whole point of the year-band table.
  assert.ok(ruleY0.attrs.wsRule > ruleY4.attrs.wsRule, 'Year 0 ruled pitch exceeds Year 4');
});

test('tick box, number box and borderless cell each serialise to their class', () => {
  const sch = schema();
  // Rule 9 → tick lines; rule 1 numeric → a number box; rule 5 → borderless cells.
  const ticks = composeExerciseItems({ items: [{ sentence: 'Pick.', options: ['a', 'b'] }], passage: null, band: 'y0_1', slots: [] });
  const tick = findAll(ticks, (n) => n.attrs?.wsTick === true)[0];
  assert.match(domSpec(sch, tick), /ws-tick/, 'tick box → .ws-tick in the print DOM');

  const numeric = composeExerciseItems({ items: [{ picture: 'three cats', answer: '3' }], passage: null, band: 'y0_1', slots: [] });
  const numBox = findAll(numeric, (n) => n.attrs?.wsNumBox === true)[0];
  assert.match(domSpec(sch, numBox), /ws-num-box/, 'number box → .ws-num-box in the print DOM');

  const dialogue = composeExerciseItems({ items: [{ speaker: 'Ali', reply: 'Hi?' }, { speaker: 'You', reply: '' }], passage: null, band: 'y0_1', slots: [] });
  const plainCell = findAll(dialogue, (n) => n.attrs?.wsPlainCell === true)[0];
  assert.match(domSpec(sch, plainCell), /ws-plain-cell/, 'borderless cell → .ws-plain-cell in the print DOM');
});

test('the part attributes survive a getJSON round trip (a keystroke cannot strip them)', () => {
  const sch = schema();
  const composed = composeExerciseItems({ items: [{ prompt: 'Write.', lines: 2 }], passage: null, band: 'y0_1', slots: [] });
  const docJSON = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'lead' }] }, ...composed] };
  const doc = PMNode.fromJSON(sch, docJSON);
  const state = EditorState.create({ schema: sch, doc });
  const out = state.apply(state.tr.insertText('x', 1)).doc.toJSON(); // type one char, then getJSON
  const survived = findAll(out.content, (n) => n.attrs?.wsRule != null);
  assert.equal(survived.length, 2, 'both ruled lines still carry wsRule after the round trip');
});
