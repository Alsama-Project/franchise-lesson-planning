// @ts-nocheck — this is a behavioural test over dynamic tiptap/ProseMirror document
// JSON; asserting on `.attrs.wsCompiled` etc. is dynamic by nature. Node's test
// runner strips types and ignores this directive. The extension under test
// (WsCompiledMarker) is fully typed and tsc-clean.
//
// WHAT THIS PROVES — that `WsCompiledMarker` makes compile's `wsCompiled` idempotency
// marker survive an editor round trip (`getJSON()`), so a teacher edit can no longer
// strip the tag and cause the next compile to duplicate every exercise.
//
// WHY A SCHEMA-LEVEL TEST, NOT A LIVE EDITOR OVER THE REAL BUNDLE — the project's
// `node:test` loader only resolves `.ts` (no JSX transform), so the real
// `worksheetDocExtensions` / `worksheetEditorExtensions` cannot be imported here:
// both pull in `resizableImage.tsx` and `ResourceRef.tsx`. And tiptap's
// `generateHTML` needs a DOM (`window`), which this headless runner has not. So the
// test reconstructs a schema faithful to `worksheetDocExtensions` from importable
// pieces:
//   • base `@tiptap/extension-image` EXTENDED with the REAL worksheet image attribute
//     specs (`worksheetImageAttributes`, the same DOM-free module `resizableImage.tsx`
//     spreads) — so this round-trip actually exercises `storagePath` / `slotId` /
//     `brief` survival, the thing the plain base-Image stand-in could never fail on;
//   • a minimal `resourceRef` node (same name/group/atom) stands in for the `.tsx`
//     `ResourceRef`.
// The REAL `WsCompiledMarker` is imported and exercised. Whatever attribute survival
// this schema shows, the shipped bundles show identically — same marker, same names.
//
// getJSON() strips undeclared attributes at the schema-parse boundary
// (`Node.fromJSON`); an edit merely re-serialises. So each round trip below parses
// the doc into the schema, types one character via a real ProseMirror transaction,
// and serialises back with `doc.toJSON()` — exactly what the editor's getJSON does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema, Node as TiptapNode } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import BaseImage from '@tiptap/extension-image';
import { worksheetImageAttributes } from '../../resizableImageAttrs';
import { FontSize } from '../../fontSize';

// The REAL worksheet image node's serialisation surface: base Image + the actual extra
// attribute specs resizableImage.tsx uses. Building the schema from this (not plain base
// Image) is what makes the round-trip below able to FAIL if storagePath/slotId/brief are
// dropped from the declarations.
const Image = BaseImage.extend({
  addAttributes() {
    return { ...this.parent?.(), ...worksheetImageAttributes() };
  },
});
import { Caption } from '../nodes/Caption';
import { PageBreak } from '../nodes/PageBreak';
import { Indent } from '../nodes/Indent';
import { HintPlaceholder } from '../nodes/HintPlaceholder';
import { WsCompiledMarker, WS_COMPILED_MARKER_TYPES } from '../nodes/WsCompiledMarker';

// A minimal stand-in for the `.tsx` ResourceRef node (schema shape only — the real
// one's NodeView is irrelevant to attribute serialisation). Same name/group/atom.
const ResourceRefStub = TiptapNode.create({
  name: 'resourceRef',
  group: 'block',
  atom: true,
  addAttributes() {
    return { resourceId: { default: null }, uploaderName: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div[data-resource-ref]' }];
  },
  renderHTML() {
    return ['div', { 'data-resource-ref': '' }];
  },
});

/** Faithful reconstruction of `worksheetDocExtensions` (see file header). */
function docSchema(withMarker = true) {
  const exts = [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Underline,
    TextStyle,
    Color,
    FontSize,
    HintPlaceholder,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Indent,
    Link.configure({ openOnClick: false }),
    Placeholder,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true, cellMinWidth: 40 }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ inline: false, allowBase64: false }),
    Caption,
    PageBreak,
    ResourceRefStub,
  ];
  if (withMarker) exts.push(WsCompiledMarker);
  return getSchema(exts);
}

// ── Builders for a "compiled" doc — nodes as compile emits them, each top-level
//    node stamped with `wsCompiled: true` exactly like `tagCompiled` does. ─────────
const tag = (node) => ({ ...node, attrs: { ...(node.attrs ?? {}), wsCompiled: true } });
const text = (t) => ({ type: 'text', text: t });
const para = (t) => ({ type: 'paragraph', content: [text(t)] });
const heading = (t) => ({ type: 'heading', attrs: { level: 2 }, content: [text(t)] });
const listItem = (t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(t)] }] });
const bulletList = (...items) => ({ type: 'bulletList', content: items.map(listItem) });
const orderedList = (...items) => ({ type: 'orderedList', content: items.map(listItem) });
const image = () => ({
  type: 'image',
  attrs: { src: null, alt: 'a cat', storagePath: 'x/y.png', slotId: 's1', brief: 'a cartoon cat on a mat' },
});
const taskListNode = () => ({
  type: 'taskList',
  content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [text('do it')] }] }],
});
const tableNode = () => ({
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: [
        { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('h')] }] },
        { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('i')] }] },
      ],
    },
    {
      type: 'tableRow',
      content: [
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('1')] }] },
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('2')] }] },
      ],
    },
  ],
});

/** Round-trip a doc through the schema and TYPE ONE CHARACTER — exactly what the
 *  editor does on a keystroke before `getJSON()`. Returns the re-serialised JSON. */
function roundTripWithEdit(schema, docJSON) {
  const doc = PMNode.fromJSON(schema, docJSON);
  const state = EditorState.create({ schema, doc });
  // Insert 'x' at position 1 — inside the first textblock (the leading heading).
  const tr = state.tr.insertText('x', 1);
  return state.apply(tr).doc.toJSON();
}

/** Count top-level nodes still recognised as compile output — the SAME predicate as
 *  the real `isCompiled` (strict `=== true`). */
const compiledCount = (docJSON) => docJSON.content.filter((n) => n?.attrs?.wsCompiled === true).length;

// ─────────────────────────────────────────────────────────────────────────────────
// Proof 1 — the tag survives a getJSON round trip on every node type compile emits.
// ─────────────────────────────────────────────────────────────────────────────────
test('proof 1: wsCompiled survives an edit + getJSON on every compiled node type', () => {
  const schema = docSchema(true);
  const compiled = {
    type: 'doc',
    content: [
      heading('Exercise heading'), // leading textblock (cursor lands here)
      tag(para('a compiled paragraph')),
      tag(heading('a compiled subheading')),
      tag(bulletList('one', 'two')),
      tag(orderedList('first', 'second')),
      tag(image()),
    ],
  };
  const taggedTypes = compiled.content.slice(1).map((n) => n.type);
  const out = roundTripWithEdit(schema, compiled);

  // Every node that carried the tag still carries it, strictly === true.
  const survivors = out.content.filter((n) => n?.attrs?.wsCompiled === true);
  assert.equal(survivors.length, taggedTypes.length, 'all tagged nodes retain wsCompiled === true');
  for (const type of taggedTypes) {
    assert.ok(
      out.content.some((n) => n.type === type && n.attrs?.wsCompiled === true),
      `tag survived on <${type}>`,
    );
  }

  // The untouched leading heading (never tagged) stays untagged: default false, which
  // the strict === true predicate reads as untagged.
  const lead = out.content[0];
  assert.notEqual(lead.attrs?.wsCompiled, true, 'untagged teacher node stays untagged');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Proof 1b — the exercise IDENTITY marker survives the SAME round trip (load-bearing:
// per-exercise regenerate finds a range by this id after any number of keystrokes).
// ─────────────────────────────────────────────────────────────────────────────────
test('proof 1b: exerciseId survives an edit + getJSON, and never reaches the DOM', () => {
  const schema = docSchema(true);
  const tagId = (node, id) => ({ ...node, attrs: { ...(node.attrs ?? {}), wsCompiled: true, exerciseId: id } });
  const compiled = {
    type: 'doc',
    content: [
      heading('Exercise heading'),
      tagId(para('exercise one, node A'), 'ex-1'),
      tagId(para('exercise one, node B'), 'ex-1'),
      tagId(image(), 'ex-2'),
    ],
  };
  const out = roundTripWithEdit(schema, compiled);
  const ids = out.content.map((n) => n.attrs?.exerciseId ?? null);
  assert.deepEqual(ids, [null, 'ex-1', 'ex-1', 'ex-2'], 'every exercise id round-trips; the teacher heading has none');

  // Static DOM output (the DOMOutputSpec print / generateHTML serialises) must never
  // carry the id — an id-carrying node and a plain one render byte-identical DOM.
  const domOf = (nodeJSON) => {
    const pmNode = PMNode.fromJSON(schema, { type: 'doc', content: [nodeJSON] }).firstChild;
    return JSON.stringify(schema.nodes[pmNode.type.name].spec.toDOM(pmNode));
  };
  const withId = domOf({ ...para('p'), attrs: { wsCompiled: true, exerciseId: 'ex-1' } });
  assert.equal(withId, domOf(para('p')), 'an id-carrying node renders identical DOM to a plain one');
  assert.ok(!/exerciseid|exercise-id/i.test(withId), 'exerciseId never leaks into the DOM');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Proof 1c — the IMAGE payload attributes (storagePath / slotId / brief) survive the
// same round trip. This is the regression guard the earlier base-Image stand-in could
// never provide: the schema here declares the REAL worksheet image attributes, so
// dropping any of them from `worksheetImageAttributes` fails this test.
// ─────────────────────────────────────────────────────────────────────────────────
test('proof 1c: storagePath / slotId / brief survive an edit + getJSON', () => {
  const schema = docSchema(true);
  const compiled = { type: 'doc', content: [heading('lead'), tag(image())] };
  const out = roundTripWithEdit(schema, compiled);
  const img = out.content.find((n) => n.type === 'image');
  assert.ok(img, 'image node present after round trip');
  assert.equal(img.attrs?.storagePath, 'x/y.png', 'storagePath survived getJSON');
  assert.equal(img.attrs?.slotId, 's1', 'slotId survived getJSON');
  assert.equal(img.attrs?.brief, 'a cartoon cat on a mat', 'brief survived getJSON');
  assert.equal(img.attrs?.wsCompiled, true, 'wsCompiled still survives alongside them');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Proof 1d — the SCAFFOLD-heading marker survives the round trip (load-bearing: the
// editor's ScaffoldHeadingLock keys off `wsScaffold` to keep a template section heading
// read-only after any number of keystrokes).
// ─────────────────────────────────────────────────────────────────────────────────
test('proof 1d: wsScaffold survives an edit + getJSON on a scaffold heading', () => {
  const schema = docSchema(true);
  const scaffold = (node) => ({ ...node, attrs: { ...(node.attrs ?? {}), wsScaffold: true } });
  const doc = { type: 'doc', content: [scaffold(heading('New Content')), para('body')] };
  const out = roundTripWithEdit(schema, doc);
  const h = out.content.find((n) => n.type === 'heading');
  assert.equal(h.attrs?.wsScaffold, true, 'wsScaffold survived the round trip');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Proof 2 — a second compile over the round-tripped doc keeps the exercise count,
// not doubled. Modelled on compileWorksheet's fill-not-replace (strip its own tagged
// output via the === true predicate, then append fresh exercises), which cannot run
// here directly (it needs a Supabase client). The pre-fix contrast shows the bug.
// ─────────────────────────────────────────────────────────────────────────────────
test('proof 2: compile twice → identical exercise count (and pre-fix would double)', () => {
  // Mirror of compile's fill-not-replace, anchorless path: strip prior compile output,
  // append the fresh exercises (each re-tagged). Same predicate as the real stripCompiled.
  const stripAndRefill = (templateContent, freshExercises) => [
    ...templateContent.filter((n) => n?.attrs?.wsCompiled !== true),
    ...freshExercises.map(tag),
  ];

  const scaffold = [heading('Worksheet'), para('teacher intro')];
  const exercises = [para('exercise 1'), para('exercise 2'), para('exercise 3')];
  // The bug's real signature is duplicated exercise CONTENT (orphaned untagged copies
  // left behind + a fresh copy appended), so count exercise nodes by content, not by tag.
  const exerciseNodeCount = (docJSON) =>
    docJSON.content.filter((n) => n.type === 'paragraph' && /exercise \d/.test(n.content?.[0]?.text ?? '')).length;

  // Compile run 1: fill the bare scaffold → docA, stored in the worksheet column.
  const docA = { type: 'doc', content: stripAndRefill(scaffold, exercises) };
  assert.equal(exerciseNodeCount(docA), 3);
  assert.equal(compiledCount(docA), 3);

  // POST-FIX: the doc is edited in the document editor (round trip), THEN recompiled.
  const editedA = roundTripWithEdit(docSchema(true), docA);
  assert.equal(compiledCount(editedA), 3, 'post-fix: round trip preserves all three tags');
  const docB = { type: 'doc', content: stripAndRefill(editedA.content, exercises) };
  assert.equal(exerciseNodeCount(docB), 3, 'post-fix: exercise count stable across a second compile');

  // PRE-FIX contrast: without the marker, the round trip strips every tag, so the
  // second compile cannot find its prior output — it keeps the (now untagged) copies
  // AND appends a fresh set. The exercises double.
  const editedPreFix = roundTripWithEdit(docSchema(false), docA);
  assert.equal(compiledCount(editedPreFix), 0, 'pre-fix: round trip strips every tag');
  const docBpreFix = { type: 'doc', content: stripAndRefill(editedPreFix.content, exercises) };
  assert.equal(exerciseNodeCount(docBpreFix), 6, 'pre-fix: the bug — exercises double (3 → 6)');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Proof 3 — the widening case: types that only reach body_doc via a CARD EDIT
// (a table, a checklist). These are the ones the widened type list exists for.
// ─────────────────────────────────────────────────────────────────────────────────
test('proof 3: wsCompiled survives on card-edit-only types (table, checklist)', () => {
  const schema = docSchema(true);
  const compiled = {
    type: 'doc',
    content: [heading('lead'), tag(tableNode()), tag(taskListNode())],
  };
  const out = roundTripWithEdit(schema, compiled);
  const table = out.content.find((n) => n.type === 'table');
  const checklist = out.content.find((n) => n.type === 'taskList');
  assert.equal(table.attrs?.wsCompiled, true, 'tag survived on <table>');
  assert.equal(checklist.attrs?.wsCompiled, true, 'tag survived on <taskList>');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Proof 4 — the marker emits NOTHING to the DOM, so print / PDF / generateHTML output
// is unchanged. generateHTML needs a DOM this runner lacks, so we compare the node
// spec's `toDOM` output — the DOMOutputSpec generateHTML serialises. A tagged node
// and an untagged node must produce byte-identical DOM output, and no output may
// contain a `compiled` attribute anywhere.
// ─────────────────────────────────────────────────────────────────────────────────
test('proof 4: wsCompiled never reaches the DOM (toDOM byte-identical, no leak)', () => {
  const schema = docSchema(true);
  const domOf = (nodeJSON) => {
    const pmNode = PMNode.fromJSON(schema, { type: 'doc', content: [nodeJSON] }).firstChild;
    return JSON.stringify(schema.nodes[pmNode.type.name].spec.toDOM(pmNode));
  };
  for (const build of [() => para('p'), () => heading('h'), () => image(), () => tableNode(), () => taskListNode()]) {
    const tagged = domOf(tag(build()));
    const untagged = domOf(build());
    assert.equal(tagged, untagged, 'tagged and untagged render identical DOM output');
    assert.ok(!/compiled/i.test(tagged), 'no wsCompiled attribute leaks into the DOM');
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// Guard — the marker's type list stays aligned with what compile can tag, and one
// list serves both bundles (absent types are inert — proven by the print bundle).
// ─────────────────────────────────────────────────────────────────────────────────
test('guard: marker declares every direct-child-of-doc type; print bundle inert on extras', () => {
  // Every node the doc schema accepts as a direct child of `doc` must be covered.
  const schema = docSchema(true);
  const accepted = Object.values(schema.nodes)
    .filter((n) => n.name !== 'doc' && schema.nodes.doc.contentMatch.matchType(n) != null)
    .map((n) => n.name)
    .sort();
  const covered = [...WS_COMPILED_MARKER_TYPES].sort();
  assert.deepEqual(accepted, covered, 'marker covers exactly the direct children of doc');

  // The print bundle lacks table/taskList/caption/pageBreak/resourceRef; the marker
  // listing them must not throw and must still round-trip the types it does have.
  const printSchema = getSchema([
    StarterKit.configure({ history: false }),
    Underline,
    TextStyle,
    Color,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: false }),
    WsCompiledMarker,
  ]);
  const out = PMNode.fromJSON(printSchema, { type: 'doc', content: [heading('lead'), tag(para('x'))] }).toJSON();
  assert.equal(out.content[1].attrs?.wsCompiled, true, 'print bundle preserves the tag on its own types');
});
