// @ts-nocheck — behavioural test over loose tiptap-doc JSON.
// Heading-based auto-fill: a template with NO {{block:…}} tokens is filled by recognising
// the standard section headings. Token mode must still win when tokens are present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleWorksheetDoc, EXERCISE_ID_ATTR } from '../worksheet-assemble';
import { buildBlockContent } from '../worksheet-blocks';
import { markdownToDoc } from '../../editor/markdown';

const LABELS = { format: 'Format:', teacher: 'Teacher:', you: 'You:' };
const SCAFFOLD = [
  '# [Department Name]',
  'Objective: students will explain teamwork.',
  'Lesson Title',
  '## 1. Warm-up and Recap',
  '*Briefly revisit last lesson.*',
  'hint: Recap box',
  '## 2. New Content',
  '*Introduce the new skill.*',
  '[Insert diagram / illustration / image …]',
  '## 3. Check for Understanding',
  'Format:',
  '*Quick checks.*',
  'Questions / checks:',
  'Write the questions or checks here.',
  '## 4. Independent Practice',
  'Format:',
  '*Students work alone.*',
  'Task instructions:',
  '## 5. Group Practice',
  'Format:',
  '*Students work together.*',
  'Task instructions:',
  'Write the task instructions here.',
  '## 6. Exit Ticket',
  '*One question.*',
  '[Insert exit ticket image / prompt]',
  '## 7. Homework',
  '*Done at home.*',
].join('\n\n');

const tpl = (md = SCAFFOLD) => markdownToDoc(md, { templateMarkers: true }).content;
const txt = (n) => n.content?.map((c) => c.text ?? '').join('') ?? '';
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const ex = (id, slot, text) => ({ id, anchor: null, slot, nodes: [p(text)] });
const hintOf = (n) => n.attrs?.placeholder;

const blocks = [
  { type: 'recap', note: 'Recap the last lesson.', activity_title: 'Quiz' },
  { type: 'new_content', teacher_does: 'Model the skill', students_do: 'Copy it' },
  { type: 'cfu', activity_title: 'Mini whiteboards', teacher_does: 'Ask Qs' },
  { type: 'independent_practice', activity_title: 'Worksheet', students_do: 'Do it alone' },
  { type: 'group_practice', activity_title: 'Role play', teacher_does: 'Circulate' },
  { type: 'exit_ticket', students_do: 'Write one thing' },
  { type: 'homework', students_do: 'Read page 4' },
];
const options = () => ({
  blockContent: buildBlockContent(blocks, LABELS),
  placeholders: { subject: 'Professionalism', theme: 'Teamwork' },
});
const exercises = () => [
  ex('c1', 'check_understanding', 'CFU ex'),
  ex('i1', 'independent_practice', 'IP ex 1'),
  ex('i2', 'independent_practice', 'IP ex 2'),
  ex('g1', 'group_practice', 'GP ex'),
];

test('full scaffold + full plan: every section filled in place, no dup Format, no stubs/hints/boxes', () => {
  const out = assembleWorksheetDoc(tpl(), exercises(), options()).doc.content;
  const texts = out.map(txt);

  // Masthead: substring + exact replacement.
  assert.equal(texts[0], 'Professionalism');
  assert.equal(texts[2], 'Teamwork');

  // Exactly one Format line per section that has an activity_title (cfu, ip, gp, recap).
  const formats = texts.filter((t) => t.startsWith('Format:'));
  assert.deepEqual(formats, ['Format: Quiz', 'Format: Mini whiteboards', 'Format: Worksheet', 'Format: Role play']);

  // No stub or insert-box text anywhere; no italic hint text survives.
  assert.equal(texts.some((t) => /Write the (task|questions)/.test(t)), false);
  assert.equal(texts.some((t) => t.startsWith('[Insert')), false);
  assert.equal(out.some((n) => n.content?.some((c) => c.marks?.some((m) => m.type === 'italic'))), false);
  for (const hint of ['Briefly revisit', 'Introduce the new', 'Quick checks', 'Students work', 'One question', 'Done at home']) {
    assert.equal(texts.some((t) => t.includes(hint)), false, hint);
  }

  // CFU: heading, filled Format, blanked hint, label, plan text, exercise, next heading.
  const cfu = texts.indexOf('3. Check for Understanding');
  assert.deepEqual(texts.slice(cfu, cfu + 7), [
    '3. Check for Understanding', 'Format: Mini whiteboards', '', 'Questions / checks:', 'Teacher:', 'Ask Qs', 'CFU ex',
  ]);
  assert.equal(hintOf(out[cfu + 2]), 'Quick checks.');
  assert.equal(texts[cfu + 7], '4. Independent Practice');

  // Independent practice: label, then plan text, then both exercises contiguous.
  const ip = texts.indexOf('4. Independent Practice');
  assert.deepEqual(texts.slice(ip + 1, ip + 8), [
    'Format: Worksheet', '', 'Task instructions:', 'You:', 'Do it alone', 'IP ex 1', 'IP ex 2',
  ]);
  const ids = out.slice(ip + 6, ip + 8).map((n) => n.attrs[EXERCISE_ID_ATTR]);
  assert.deepEqual(ids, ['i1', 'i2']);

  // Recap (no label): text goes after the blanked hint; old empty dashed box gone.
  const rc = texts.indexOf('1. Warm-up and Recap');
  assert.deepEqual(texts.slice(rc, rc + 4), ['1. Warm-up and Recap', '', 'Format: Quiz', 'Recap the last lesson.']);
  assert.equal(hintOf(out[rc + 1]), 'Briefly revisit last lesson.');

  // Homework (last): hint blanked then plan text.
  const hw = texts.indexOf('7. Homework');
  assert.deepEqual(texts.slice(hw + 1), ['', 'You:', 'Read page 4']);
});

test('heading mode is deterministic over the same scaffold', () => {
  assert.deepEqual(
    assembleWorksheetDoc(tpl(), exercises(), options()),
    assembleWorksheetDoc(tpl(), exercises(), options()),
  );
});

test('empty sections keep their [Insert …] boxes and stubs; hints still blank', () => {
  const out = assembleWorksheetDoc(tpl(), [], { blockContent: {}, placeholders: { subject: 'S', theme: 'T' } }).doc.content;
  const texts = out.map(txt);
  assert.ok(texts.includes('[Insert diagram / illustration / image …]'));
  assert.ok(texts.includes('[Insert exit ticket image / prompt]'));
  assert.ok(texts.includes('Write the task instructions here.'));
  assert.equal(hintOf(out[texts.indexOf('2. New Content') + 1]), 'Introduce the new skill.');
});

test('a renamed heading stays exactly as today (and an exercise falls back to its anchor)', () => {
  const md = SCAFFOLD.replace('## 4. Independent Practice', '## 4. Solo Task');
  const out = assembleWorksheetDoc(tpl(md), [ex('i1', 'independent_practice', 'IP ex')], options()).doc.content;
  const texts = out.map(txt);
  const solo = texts.indexOf('4. Solo Task');
  // Untouched section: Format: stays empty, italic hint still italic text, label has no plan text.
  assert.deepEqual(texts.slice(solo, solo + 4), ['4. Solo Task', 'Format:', 'Students work alone.', 'Task instructions:']);
  assert.ok(out[solo + 2].content[0].marks.some((m) => m.type === 'italic'));
  // Its exercise could not be placed → appended at the end, not lost.
  assert.equal(texts[texts.length - 1], 'IP ex');
});

test('a duplicated heading is ambiguous → both left alone', () => {
  const md = SCAFFOLD + '\n\n## Homework\n\n*again*';
  const out = assembleWorksheetDoc(tpl(md), [], options()).doc.content;
  assert.equal(out.map(txt).includes('Read page 4'), false);
});

test('an Arabic template is left exactly as today', () => {
  const md = ['# [Department Name]', '## ١. الإحماء والمراجعة', '*تلميح*', '## ٢. المحتوى الجديد', '*تلميح آخر*'].join('\n\n');
  const base = tpl(md);
  const out = assembleWorksheetDoc(base, [ex('e1', 'recap', 'x')], options()).doc.content;
  // Scaffold untouched (masthead literal included); the exercise just appends.
  assert.deepEqual(out.slice(0, base.length).map(txt), base.map(txt));
  assert.equal(txt(out[0]), '[Department Name]');
  assert.equal(txt(out[out.length - 1]), 'x');
});

test('token mode keeps priority: tokens win, headings are not auto-filled', () => {
  const md = [
    '# [Department Name]',
    '## 1. Warm-up and Recap',
    '*Hint*',
    '## 4. Independent Practice',
    'hint: Hint 2',
    '{{block:independent_practice}}',
  ].join('\n\n');
  const out = assembleWorksheetDoc(tpl(md), [ex('i1', 'independent_practice', 'IP ex'), ex('r1', 'recap', 'R ex')], options())
    .doc.content;
  const texts = out.map(txt);
  // Recap has no token → its section is untouched (hint still italic text), not auto-filled.
  assert.equal(texts.includes('Recap the last lesson.'), false);
  assert.equal(texts.includes('Hint'), true);
  // Masthead untouched in token mode.
  assert.equal(texts[0], '[Department Name]');
  // The token slot fills as in #453: hint removed, plan text then exercise.
  const ip = texts.indexOf('4. Independent Practice');
  assert.deepEqual(texts.slice(ip + 1, ip + 5), ['Format: Worksheet', 'You:', 'Do it alone', 'IP ex']);
});
