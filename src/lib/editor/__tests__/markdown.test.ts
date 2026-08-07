// @ts-nocheck — behavioural test over loose tiptap-doc JSON (`markdownToDoc` returns
// `JSONContent`, whose `.content[i].attrs.start` etc. is dynamic by nature). The
// converter (markdown.ts) is fully typed and tsc-clean; Node's test runner strips
// types and ignores this directive.
//
// WHAT THESE PROVE — the "worksheet markdown render floor" fixes to `markdownToDoc`
// (the server-side body_md → body_doc converter). These are regression guards over
// the CONVERTER'S OWN behaviour; they are not evidence about what the model emits
// (that was closed by raw rows + a production screenshot). Each block below maps to
// a lettered acceptance case in the task.
//
// The inputs are verbatim from stored `body_md` where a case is marked "real"; the
// rest are minimal synthetic probes for one rule each.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { markdownToDoc, docToMarkdown, PICTURE_MARKER_LINE } from '../markdown';

/** Concatenated plain text of an inline run (text nodes only). */
const plain = (nodes) => (nodes ?? []).map((n) => n.text ?? '').join('');
/** Whether an inline text node carries the bold mark. */
const isBold = (n) => (n.marks ?? []).some((m) => m.type === 'bold');
/** The first paragraph's inline content inside a listItem. */
const itemInline = (li) => li.content?.[0]?.content ?? [];

// ─────────────────────────────────────────────────────────────────────────────────
// Fix 1 — ordered-list numbering. A — numbering survives intervening content.
// ─────────────────────────────────────────────────────────────────────────────────
test('A: numbering across intervening content → two lists, start 1 and 2', () => {
  // Verbatim from row 4b98a98a.
  const md = `1. A good leader only listens to the most experienced person in the group.

 True / False

2. Every team member should have the chance to share their ideas, even if they are new to the group.

 True / False
`;
  const { content } = markdownToDoc(md);
  const lists = content.filter((n) => n.type === 'orderedList');
  assert.equal(lists.length, 2, 'two separate orderedList nodes');
  assert.equal(lists[0].attrs?.start, 1, 'first list starts at 1');
  assert.equal(lists[1].attrs?.start, 2, 'second list starts at 2');
  assert.equal(lists[0].content.length, 1, 'first list has one item');
  assert.equal(lists[1].content.length, 1, 'second list has one item');
  // The "True / False" lines are their own paragraphs between the lists.
  assert.equal(content.filter((n) => n.type === 'paragraph').length, 2);
});

// D — a contiguous 1. 2. 3. must NOT regress: still one list, start 1, three items.
test('D: contiguous list stays one orderedList, start 1, three items', () => {
  const { content } = markdownToDoc('1. one\n2. two\n3. three');
  assert.equal(content.length, 1);
  assert.equal(content[0].type, 'orderedList');
  assert.equal(content[0].attrs?.start, 1);
  assert.equal(content[0].content.length, 3);
  assert.deepEqual(
    content[0].content.map((li) => plain(itemInline(li))),
    ['one', 'two', 'three'],
  );
});

// The heading contract (now in the floor): `## Title` → level-2 heading, `### Label` →
// level-3 heading. The schema declares [2,3], and compile/CSS key exercise layout + the
// pink title off these — so the conversion must hold.
test('heading contract: ## → h2 and ### → h3', () => {
  const { content } = markdownToDoc('## Transport Words\n\nsome text\n\n### Word Bank');
  const headings = content.filter((n) => n.type === 'heading');
  assert.equal(headings.length, 2);
  assert.equal(headings[0].attrs?.level, 2, '## is a level-2 heading');
  assert.equal(plain(headings[0].content), 'Transport Words');
  assert.equal(headings[1].attrs?.level, 3, '### is a level-3 heading');
  assert.equal(plain(headings[1].content), 'Word Bank');
});

// A list whose first marker is not 1 carries that number as `start`.
test('Fix 1: a list beginning at 3 emits start: 3', () => {
  const { content } = markdownToDoc('3. third\n4. fourth');
  assert.equal(content[0].type, 'orderedList');
  assert.equal(content[0].attrs?.start, 3);
});

// The emitted `start` reaches HTML: it round-trips the real StarterKit schema and the
// node's `toDOM` (what `generateHTML` serialises) emits `<ol start="2">`. `start: 1`
// stays implicit (tiptap's OrderedList omits the default), so a normal list is clean.
test('Fix 1: start reaches the DOM via the ordered-list schema (generateHTML path)', () => {
  const schema = getSchema([StarterKit.configure({ heading: { levels: [2, 3] } })]);
  const domOf = (start) => {
    const doc = PMNode.fromJSON(schema, {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }],
        },
      ],
    });
    const ol = doc.firstChild;
    return JSON.stringify(schema.nodes.orderedList.spec.toDOM(ol));
  };
  assert.match(domOf(2), /"start":2/, '<ol start="2"> is emitted for a non-1 start');
  assert.doesNotMatch(domOf(1), /start/, 'start:1 stays implicit (default), so a normal list is unchanged');
});

// docToMarkdown (the reverse — used by FreeBlock / aiInsert as the adjust base) must
// serialise `start + i`, not `i + 1`, so the numbering round-trips.
test('Fix 1: docToMarkdown serialises the real start (start + i, not i + 1)', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'orderedList',
        attrs: { start: 2 },
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ],
      },
    ],
  };
  assert.equal(docToMarkdown(doc), '2. a\n3. b');
  // A doc→markdown→doc round trip preserves the start.
  assert.equal(markdownToDoc(docToMarkdown(doc)).content[0].attrs?.start, 2);
});

// ─────────────────────────────────────────────────────────────────────────────────
// Fix 2 — thematic breaks are dropped (no horizontalRule node in the schema).
// ─────────────────────────────────────────────────────────────────────────────────
test('Fix 2: a thematic break flushes the open blocks and emits nothing', () => {
  for (const rule of ['---', '***', '___', '----']) {
    const { content } = markdownToDoc(`para one\n\n${rule}\n\npara two`);
    assert.equal(content.length, 2, `${rule} emits no node of its own`);
    assert.deepEqual(content.map((n) => n.type), ['paragraph', 'paragraph']);
    assert.equal(plain(content[0].content), 'para one');
    assert.equal(plain(content[1].content), 'para two');
  }
});

// A thematic break also closes an open list (it is not swallowed into the paragraph).
test('Fix 2: a thematic break between a list and prose closes the list', () => {
  const { content } = markdownToDoc('- a\n- b\n\n---\n\nafter');
  assert.deepEqual(content.map((n) => n.type), ['bulletList', 'paragraph']);
});

// ─────────────────────────────────────────────────────────────────────────────────
// Fix 3 — pipe tables build a REAL table node (the v3 schema supports tables, so the
// model's two-column matching structure is honoured, not flattened to a bullet mess).
// ─────────────────────────────────────────────────────────────────────────────────

/** The rows (tableRow nodes) of a table node. */
const rows = (table) => (table.content ?? []).filter((r) => r.type === 'tableRow');
/** One row's cells → their [type, plainText] pairs. */
const rowCells = (row) => (row.content ?? []).map((c) => [c.type, plain(c.content?.[0]?.content)]);

test('B: a one-column word bank becomes a real table (header + one body cell)', () => {
  // Verbatim from production.
  const md = `| Word Bank |
|---|
| bus · car · taxi · bike · train · van |
`;
  const { content } = markdownToDoc(md);
  assert.deepEqual(content.map((n) => n.type), ['table']);
  const r = rows(content[0]);
  assert.deepEqual(rowCells(r[0]), [['tableHeader', 'Word Bank']]);
  assert.deepEqual(rowCells(r[1]), [['tableCell', 'bus · car · taxi · bike · train · van']]);
  assert.ok(!JSON.stringify(content).includes('|'), 'no pipe survives into the doc');
});

test('C: a two-column table keeps its columns; a thematic break after is dropped', () => {
  // Verbatim from row f14ab54b. The second column has a header but an empty body cell —
  // it carries information (the header), so it is KEPT (only all-empty columns drop).
  const md = `| Inclusive Practice | Not Inclusive Practice |
|---|---|
| ✓ **Example** | |

---
`;
  const { content } = markdownToDoc(md);
  assert.deepEqual(content.map((n) => n.type), ['table']);
  const r = rows(content[0]);
  assert.deepEqual(rowCells(r[0]), [
    ['tableHeader', 'Inclusive Practice'],
    ['tableHeader', 'Not Inclusive Practice'],
  ]);
  // Body: '✓ Example' (the ✓ is semantic, NOT a stripped bullet glyph) + an empty cell.
  assert.deepEqual(rowCells(r[1]), [['tableCell', '✓ Example'], ['tableCell', '']]);
  const exampleCell = r[1].content[0].content[0].content;
  assert.ok(exampleCell.some((n) => n.text === 'Example' && isBold(n)), 'inline bold inside a cell survives');
  assert.ok(!JSON.stringify(content).includes('---'), 'no thematic break survives');
});

test('the matching grid: gap column dropped, ✦ decoration stripped, two clean columns', () => {
  // Verbatim shape the model emits when it wants two columns and is not allowed pipes:
  // a THREE-column pipe table whose middle column is an empty draw-a-line gap, with a
  // ✦ bullet prefixing each picture-column option.
  const md = `| Word | | Picture |
|---|---|---|
| **bus** | | ✦ bicycle |
| **car** | | ✦ bus |
| **taxi** | | ✦ car |`;
  const { content } = markdownToDoc(md);
  assert.deepEqual(content.map((n) => n.type), ['table']);
  const r = rows(content[0]);
  // The empty middle gap column is dropped → two columns; the ✦ is stripped.
  assert.deepEqual(rowCells(r[0]), [['tableHeader', 'Word'], ['tableHeader', 'Picture']]);
  assert.deepEqual(rowCells(r[1]), [['tableCell', 'bus'], ['tableCell', 'bicycle']]);
  assert.deepEqual(rowCells(r[3]), [['tableCell', 'taxi'], ['tableCell', 'car']]);
  // The bold word survives in the left column.
  assert.ok(r[1].content[0].content[0].content.some((n) => n.text === 'bus' && isBold(n)));
});

test('the built table is valid against the worksheet Table schema', () => {
  const schema = getSchema([
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
  ]);
  const doc = markdownToDoc(`| A | B |
|---|---|
| 1 | 2 |`);
  // Throws if any built node/attr is not schema-legal.
  assert.doesNotThrow(() => PMNode.fromJSON(schema, doc));
});

// A lone pipe line (a run of ONE) is not a table — it stays literal prose.
test('Fix 3: a single pipe line is not a table and passes through as text', () => {
  const { content } = markdownToDoc('| not a table |');
  assert.equal(content.length, 1);
  assert.equal(content[0].type, 'paragraph');
  assert.equal(plain(content[0].content), '| not a table |');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Fix 4 — escape scrub (defensive): a backslash-escaped ordinal matches the ordered
// regex once unescaped; pipes are deliberately NOT unescaped.
// ─────────────────────────────────────────────────────────────────────────────────
test('Fix 4: a backslash-escaped ordinal is unescaped and then numbers', () => {
  const { content } = markdownToDoc('0\\. text');
  assert.equal(content[0].type, 'orderedList');
  assert.equal(plain(itemInline(content[0].content[0])), 'text');
});

test('Fix 4: an escaped pipe keeps its backslash (never manufactures a table)', () => {
  // Two lines so a table run could only form if the pipes were unescaped.
  const { content } = markdownToDoc('a \\| b\nc \\| d');
  assert.ok(content.every((n) => n.type !== 'table'), 'no table is built from escaped pipes');
  assert.ok(JSON.stringify(content).includes('|'), 'the literal pipe is preserved');
});

// ─────────────────────────────────────────────────────────────────────────────────
// Fix 5 — a `[Picture: …]` marker alone on its line is its OWN paragraph.
// ─────────────────────────────────────────────────────────────────────────────────
test('G: a marker not followed by a blank line still gets its own paragraph', () => {
  const md = `[Picture: a bus on a road]
Use the words in the box to complete each sentence.
`;
  const { content } = markdownToDoc(md);
  assert.equal(content.length, 2, 'marker and instruction do NOT merge into one paragraph');
  assert.equal(content[0].type, 'paragraph');
  assert.equal(content[1].type, 'paragraph');
  // The marker paragraph is PURE text (no hardBreak) — what the substitution sites need.
  assert.equal(content[0].content.length, 1);
  assert.equal(content[0].content[0].type, 'text');
  assert.equal(content[0].content[0].text, '[Picture: a bus on a road]');
  assert.ok(PICTURE_MARKER_LINE.test(plain(content[0].content)), 'marker paragraph matches the shared regex');
  assert.equal(plain(content[1].content), 'Use the words in the box to complete each sentence.');
});

// The shared marker regex is the SINGLE source (imported by compile + the pane), so a
// marker paragraph the converter emits is exactly what those sites detect.
test('Fix 5: the marker regex is exported for the substitution sites to share', () => {
  assert.ok(PICTURE_MARKER_LINE instanceof RegExp);
  assert.ok(PICTURE_MARKER_LINE.test('[Picture: a cat]'));
  assert.ok(PICTURE_MARKER_LINE.test('  [Picture: a cat]  '));
  assert.ok(!PICTURE_MARKER_LINE.test('see [Picture: a cat] here'), 'an inline marker is not marker-alone');
});

// ─────────────────────────────────────────────────────────────────────────────────
// HTML entities — the model spaces/punctuates options with `&nbsp;`, `&amp;`, `&mdash;`
// (and numeric forms); decoded at the line level so none prints as literal text.
// ─────────────────────────────────────────────────────────────────────────────────
test('entities: &nbsp; decodes to an ordinary space in an option run', () => {
  const { content } = markdownToDoc('by bus &nbsp;/&nbsp; by car');
  const text = plain(content[0].content);
  assert.ok(!text.includes('&nbsp;'), 'the entity does not print literally');
  // A normal space (U+0020), never a non-breaking one (U+00A0).
  assert.ok(!text.includes('\u00A0'), 'no non-breaking space survives');
  assert.ok(/by bus\s+\/\s+by car/.test(text), 'the option run reads normally');
});

test('entities: named forms (&amp; &lt; &gt; &mdash; &hellip;) decode', () => {
  const { content } = markdownToDoc('salt &amp; pepper &mdash; 1 &lt; 2 &gt; 0 &hellip;');
  assert.equal(plain(content[0].content), 'salt & pepper — 1 < 2 > 0 …');
});

test('entities: numeric decimal and hex forms decode', () => {
  const { content } = markdownToDoc('caf&#233; then &#x2014; end');
  assert.equal(plain(content[0].content), 'café then — end');
});

test('entities: numeric nbsp (&#160; / &#xA0;) also decodes to a normal space', () => {
  const { content } = markdownToDoc('a&#160;b&#xA0;c');
  const text = plain(content[0].content);
  assert.ok(!text.includes('\u00A0'), 'no non-breaking space survives');
  assert.equal(text, 'a b c');
});


test('entities: an unknown named entity is left untouched, never blanked', () => {
  const { content } = markdownToDoc('a &frobnicate; b');
  assert.equal(plain(content[0].content), 'a &frobnicate; b');
});

test('entities: decoding is a single pass — &amp;lt; becomes literal &lt;, not <', () => {
  const { content } = markdownToDoc('&amp;lt;');
  assert.equal(plain(content[0].content), '&lt;');
});

// The markup-manufacturing guard: a pipe-producing entity is NOT decoded, so two lines
// of encoded pipes can never be read as a table (the same reason `\|` keeps its slash).
test('entities: &#124; / &#x7C; do NOT decode to a pipe (no table is manufactured)', () => {
  const { content } = markdownToDoc('a &#124; b\nc &#x7C; d');
  assert.ok(content.every((n) => n.type !== 'table'), 'no table is built from encoded pipes');
  // The entity is left as its literal text rather than becoming a `|`.
  const text = content.map((n) => plain(n.content)).join('\n');
  assert.ok(text.includes('&#124;') && text.includes('&#x7C;'), 'pipe entities left verbatim');
  assert.ok(!text.includes('|'), 'no bare pipe was produced');
});

// A decoded `#` at line start still classifies as a heading — consistent with how
// `unescapePunctuation` already activates a backslash-escaped `\#`.
test('entities: a decoded &#35; at line start heads a heading (parity with \\#)', () => {
  const { content } = markdownToDoc('&#35; Heading');
  assert.equal(content[0].type, 'heading');
  assert.equal(content[0].attrs.level, 1);
  assert.equal(plain(content[0].content), 'Heading');
});
