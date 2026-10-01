// @ts-nocheck — behavioural test over loose tiptap-doc JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBlockContent, plainTextToNodes, slotOfBlock } from '../worksheet-blocks';

const labels = { format: 'Format:', teacher: 'Teacher:', you: 'You:' };
const block = (type, f = {}) => ({
  type, title: type, activity_title: '', activity_ref: null, teacher_does: '', students_do: '',
  resources: '', phase: null, duration_minutes: 5, ...f,
});
const text = (n) => n.content?.map((c) => c.text ?? (c.type === 'hardBreak' ? '\n' : '')).join('') ?? '';

test('slot mapping: routines and legacy blocks are not on the sheet', () => {
  for (const t of ['anthem', 'warm_up', 'cool_down', 'check_homework']) assert.equal(slotOfBlock(t), null);
  assert.equal(slotOfBlock('cfu'), 'check_understanding');
});

test('order: Format → Teacher: → You:, labels omitted when a field is empty', () => {
  const out = buildBlockContent(
    [block('new_content', { activity_title: 'Whiteboard / Show Me', teacher_does: 'Model it', students_do: 'Copy it' })],
    labels,
  ).new_content;
  assert.deepEqual(out.map(text), ['Format: Whiteboard / Show Me', 'Teacher:', 'Model it', 'You:', 'Copy it']);
  const only = buildBlockContent([block('homework', { students_do: 'Read p3' })], labels).homework;
  assert.deepEqual(only.map(text), ['You:', 'Read p3']);
});

test('recap: the note is the unlabelled body, before Teacher:/You:', () => {
  const out = buildBlockContent([block('recap', { note: 'Last week we…', teacher_does: 'Ask' })], labels).recap;
  assert.deepEqual(out.map(text), ['Last week we…', 'Teacher:', 'Ask']);
});

test('blocks with nothing written yield no slot; excluded fields never leak', () => {
  const r = buildBlockContent(
    [block('exit_ticket', { resources: 'cards', techniques: [{ technique: 'x', note: 'y' }] }), block('warm_up', { students_do: 'hi' })],
    labels,
  );
  assert.deepEqual(r, {});
});

test('plain text stays verbatim: breaks, literal asterisks, lists', () => {
  const nodes = plainTextToNodes('Line *one*\nline two\n\n- a\n- b\n\n1. x\n2. y');
  assert.equal(text(nodes[0]), 'Line *one*\nline two');
  assert.equal(nodes[1].type, 'bulletList');
  assert.equal(nodes[2].type, 'orderedList');
});
