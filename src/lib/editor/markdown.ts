// A deliberately small Markdown ↔ HTML/doc converter for the AI generator.
//
// `POST /api/generate-resource` returns "simple markdown" (headings, paragraphs,
// bold/italic, and unordered/ordered lists). Rather than pull in a full Markdown
// dependency, we convert that subset to HTML and let tiptap parse the HTML into
// its own schema (via `editor.commands.setContent`). Anything fancier than the
// subset degrades gracefully to plain paragraphs. `docToMarkdown` is the reverse:
// it serialises a tiptap doc back to the same markdown subset so the builder can
// send a Free block's current content to the generator as the base for a
// stateless "Adjust" refinement.
//
// Note for type-only consumers: JSONContent is imported from @tiptap/core.

import type { JSONContent } from '@tiptap/core';

/** Escape the five HTML-significant characters in raw text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Remove `*` / `~` left over AFTER emphasis parsing — an unclosed `*word` or a stray `**`
 * the model emitted, which otherwise prints as literal punctuation. Any such delimiter is
 * unpaired by definition (the paired ones were already consumed into marks), so a run of
 * them that TOUCHES a word character on either side is a scrap and is dropped; a space-
 * flanked ` * ` (multiplication) is left alone. `_` is never touched — worksheet content is
 * full of `______` blanks and snake_case. Applied only to non-emphasised text.
 */
function stripStrayEmphasis(text: string): string {
  return text
    // A delimiter run jammed against a word — `*word`, `word**`.
    .replace(/(?<=\w)[*~]+|[*~]+(?=\w)/g, '')
    // …or stranded at the very start/end of a non-emphasised piece, where a mis-parse's
    // leftover closing delimiter lands (`* and …`). An INTERIOR space-flanked ` * `
    // (multiplication, always mid-piece with digits either side) is untouched.
    .replace(/^\s*[*~]+|[*~]+\s*$/g, '');
}

/**
 * Apply inline emphasis (bold, then strikethrough, then italic) to already-escaped text.
 * Only asterisk/tilde syntax is honoured — worksheet content routinely contains underscores
 * (fill-in-the-blank runs, snake_case), so treating `_` as emphasis would mangle it.
 * `**bold**` is matched before `*italic*` so the single-asterisk rule does not split a bold
 * run; `~~strike~~` sits between. Any leftover stray `*`/`~` is then scrubbed.
 */
function inline(text: string): string {
  return stripStrayEmphasis(
    text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>'),
  );
}

/** Render one block of non-list lines as a paragraph (single <br> between lines). */
function paragraph(lines: string[]): string {
  const html = lines.map((l) => inline(escapeHtml(l.trim()))).join('<br>');
  return `<p>${html}</p>`;
}

/**
 * Convert a simple-markdown string into an HTML fragment tiptap can parse.
 * Supports `#`/`##`/`###` headings, `-`/`*`/`+` bullet lists, `1.` ordered
 * lists, blank-line-separated paragraphs, and **bold** / *italic* inline marks.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let para: string[] = [];
  let list: { ordered: boolean; items: string[]; start?: number } | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push(paragraph(para));
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((i) => `<li>${inline(escapeHtml(i))}</li>`).join('');
      if (list.ordered) {
        // Honour the first item's own number as the list's `start` (a `3. 4.` run
        // starts at 3), so a doc→markdown→html round trip keeps its numbering. `1`
        // is the default and is left implicit, matching tiptap's OrderedList.
        const attr = list.start && list.start !== 1 ? ` start="${list.start}"` : '';
        out.push(`<ol${attr}>${items}</ol>`);
      } else {
        out.push(`<ul>${items}</ul>`);
      }
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (line.trim() === '') {
      // A blank line ends a paragraph but NOT a list: AI markdown routinely puts
      // blank lines between numbered items, and flushing here would emit one
      // single-item <ol> per item (every item rendering as "1."). The list is
      // instead closed when a non-list line (heading / bullet of the other kind /
      // plain text) appears, or at end of input.
      flushPara();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }

    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [], start: parseInt(ordered[1], 10) };
      }
      list.items.push(ordered[2].trim());
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1].trim());
      continue;
    }

    // Plain text line — part of the current paragraph.
    flushList();
    para.push(line);
  }

  flushPara();
  flushList();
  return out.join('');
}

/** Serialise tiptap inline content (text nodes with bold/italic marks) to markdown. */
function inlineToMarkdown(nodes: JSONContent[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\n';
      if (node.type !== 'text') return '';
      let text = node.text ?? '';
      const marks = node.marks ?? [];
      // Bold, then strike, then italic — mirroring `inline()` above (** ~~ *).
      if (marks.some((m) => m.type === 'bold')) text = `**${text}**`;
      if (marks.some((m) => m.type === 'strike')) text = `~~${text}~~`;
      if (marks.some((m) => m.type === 'italic')) text = `*${text}*`;
      return text;
    })
    .join('');
}

/** First paragraph's inline content inside a list item (the subset we emit). */
function listItemInline(item: JSONContent): string {
  const firstBlock = item.content?.[0];
  return inlineToMarkdown(firstBlock?.content);
}

/** Serialise one top-level tiptap block to a markdown string (or '' to skip). */
function blockToMarkdown(node: JSONContent): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
      return `${'#'.repeat(level)} ${inlineToMarkdown(node.content)}`;
    }
    case 'paragraph':
      return inlineToMarkdown(node.content);
    case 'bulletList':
      return (node.content ?? []).map((li) => `- ${listItemInline(li)}`).join('\n');
    case 'orderedList': {
      // Emit the list's own `start` (a list beginning at 3 serialises `3. 4. …`),
      // so the numbering survives a doc→markdown→doc/html round trip. Defaults to 1.
      const start = Number(node.attrs?.start) || 1;
      return (node.content ?? []).map((li, i) => `${start + i}. ${listItemInline(li)}`).join('\n');
    }
    case 'image':
      // Images don't round-trip into the generator's markdown; the adjust prompt
      // works on text. The teacher's image stays in the editor regardless.
      return '';
    default:
      return inlineToMarkdown(node.content);
  }
}

/**
 * Convert a tiptap/ProseMirror doc into the simple-markdown subset
 * {@link markdownToHtml} consumes — the inverse direction. Used to send a Free
 * block's current content to the resource generator as the base for an adjust.
 */
export function docToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc?.content) return '';
  return doc.content
    .map(blockToMarkdown)
    .filter((block) => block.trim().length > 0)
    .join('\n\n')
    .trim();
}

// ── Server-safe markdown → tiptap doc ────────────────────────────────────────
//
// `markdownToHtml` (above) is the browser path: the HTML it emits is handed to a
// live tiptap editor via `setContent`, or to `generateJSON` in a Client
// Component (see `resource-to-block.ts`). Neither works in a Node route handler:
// `generateJSON` reaches for `window.DOMParser`, and `worksheetEditorExtensions`
// is `'use client'`. The worksheet-exercise route needs `body_md → body_doc`
// server-side, so `markdownToDoc` builds the ProseMirror/tiptap JSON directly —
// no DOM, no dependency, no client import.
//
// It emits ONLY nodes valid in `worksheetEditorExtensions` (StarterKit): `doc`,
// `heading`, `paragraph`, `bulletList`, `orderedList`, `listItem`, `text`, plus
// the `bold`/`italic` marks and `hardBreak`. It honours the SAME markdown subset
// `markdownToHtml` does (the two are kept deliberately parallel), so a worksheet
// exercise renders identically whether its doc was built here or by the editor.
// `[Picture: …]` markers and `______` blanks are ordinary text and pass through
// verbatim, exactly as the floor's marker conventions require.

/** Parse inline emphasis (asterisk + `~~strike~~`) into tiptap text nodes with marks. */
function inlineToNodes(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  // `**bold**` is matched before `*italic*` so a bold run is not split by the
  // single-asterisk rule; `~~strike~~` sits between. Underscores are NEVER emphasis —
  // worksheet content is full of `______` blanks and snake_case. Non-nested by
  // construction (the char classes forbid the delimiter inside a run), matching
  // `markdownToHtml`'s behaviour.
  const pattern = /\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const pushMark = (value: string, mark: 'bold' | 'italic' | 'strike') => {
    if (value) nodes.push({ type: 'text', text: value, marks: [{ type: mark }] });
  };
  // Non-emphasised text is scrubbed of any stray `*`/`~` an unclosed run left behind, so
  // a leftover delimiter never prints as literal punctuation on the sheet.
  const pushPlain = (value: string) => {
    const clean = stripStrayEmphasis(value);
    if (clean) nodes.push({ type: 'text', text: clean });
  };
  while ((match = pattern.exec(text)) !== null) {
    pushPlain(text.slice(last, match.index));
    if (match[1] !== undefined) pushMark(match[1], 'bold');
    else if (match[2] !== undefined) pushMark(match[2], 'strike');
    else pushMark(match[3], 'italic');
    last = pattern.lastIndex;
  }
  pushPlain(text.slice(last));
  return nodes;
}

/** Build a paragraph node from lines, joining them with hard breaks. */
function paragraphNode(lines: string[]): JSONContent {
  const content: JSONContent[] = [];
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' });
    content.push(...inlineToNodes(line.trim()));
  });
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/** Wrap inline content as a list item (`listItem` holds a `paragraph`). */
function listItemNode(text: string): JSONContent {
  const inline = inlineToNodes(text);
  return {
    type: 'listItem',
    content: [inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' }],
  };
}

/**
 * A line — or a paragraph's whole text — that is EXACTLY one `[Picture: …]` marker
 * and nothing else. The single source of truth for marker-alone detection, reused
 * by the two image-substitution sites (compile's `markerParagraphText`, the pane's
 * `PICTURE_ONLY_RE`) so the converter and its consumers can never drift on what
 * counts as a marker paragraph.
 */
export const PICTURE_MARKER_LINE = /^\s*\[Picture:\s*[^\]]+\]\s*$/;

/**
 * A single `[Picture: …]` marker ANYWHERE within a text run — not anchored to the
 * whole string. The inline counterpart of `PICTURE_MARKER_LINE`, used by
 * `fillImageSlots` to find a marker embedded beside words in a sentence (so an image
 * can sit inline, not only alone in its own paragraph). Non-global on purpose: build a
 * fresh global copy (`new RegExp(PICTURE_MARKER.source, 'g')`) per scan so no shared
 * `lastIndex` state leaks between calls. Shares the marker body with the line form, so
 * the two can never drift on what a marker looks like.
 */
export const PICTURE_MARKER = /\[Picture:\s*[^\]]+\]/;

/** A CommonMark thematic break: a whole (trimmed) line of 3+ of the same `-`/`*`/`_`.
 *  There is no `horizontalRule` node in the worksheet schema, so a match is dropped. */
const THEMATIC_BREAK = /^([-*_])\1{2,}$/;

/** A markdown table-row line: its trim starts AND ends with a pipe. */
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.length >= 2 && t.startsWith('|') && t.endsWith('|');
}

/** The trimmed cells of one `| a | b |` row, PRESERVING internal empty cells — only the
 *  leading/trailing pipe artifacts are stripped. `| bus | | car |` → `['bus', '', 'car']`,
 *  so a deliberately-empty column (a matching sheet's draw-a-line gap) keeps its position
 *  and every row aligns to the same columns. Callers drop columns that are empty in EVERY
 *  row (see {@link tableToNodes}), so a spurious gap still disappears. */
function tableCells(line: string): string[] {
  const t = line.trim();
  return t.slice(1, -1).split('|').map((c) => c.trim());
}

/** True when a row is a table separator (`---`, `:--`, `--:`, `:-:` in every NON-EMPTY
 *  cell), i.e. the `|---|---|` line under a header. Empty cells are ignored so a padded
 *  separator still reads as one. */
function isSeparatorRow(cells: string[]): boolean {
  const filled = cells.filter((c) => c.length > 0);
  return filled.length > 0 && filled.every((c) => /^:?-+:?$/.test(c));
}

/** Leading decorative bullet glyphs the model prepends to a matching option (`✦ bicycle`).
 *  Pure decoration inside a table cell, stripped at the boundary — restricted to unambiguous
 *  symbol glyphs so real content (a `-` sign, an `*`) is never touched. */
const CELL_BULLET = /^[✦•◆★●○▪▸►·»]\s+/;

/** One cell's markdown → the block content of a `tableCell`/`tableHeader`: a single
 *  paragraph of inline nodes (so a `**bold**` word survives), or a bare empty paragraph
 *  for an empty cell. A leading decorative bullet ({@link CELL_BULLET}) is stripped. */
function cellContent(text: string): JSONContent[] {
  const inline = inlineToNodes(text.replace(CELL_BULLET, '').trim());
  return [inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' }];
}

/**
 * Build a real `table` node from a contiguous run of pipe-table rows. The worksheet v3
 * schema supports tables (the flashcard grid is one), so the model's two-column matching
 * structure — `| Word | | Picture |` — is honoured as an actual bordered table rather than
 * flattened to a bullet-list mess. The separator row (`|---|---|`) is dropped; the row
 * before it becomes `tableHeader` cells, every other row `tableCell`. Rows are padded to a
 * common width, then any column empty in EVERY row (the model's spurious draw-a-line gap)
 * is dropped, so `| Word | | Picture |` renders as a clean two-column table. Returns [] for
 * a run that holds only a separator / only empties.
 */
function tableToNodes(rows: string[]): JSONContent[] {
  const parsed = rows.map(tableCells);
  const sepIndex = parsed.findIndex(isSeparatorRow);
  const headerIndex = sepIndex >= 1 ? sepIndex - 1 : -1;

  // Keep the content rows (drop the separator), remembering which one is the header.
  const bodyRows: { cells: string[]; header: boolean }[] = [];
  parsed.forEach((cells, i) => {
    if (isSeparatorRow(cells)) return;
    bodyRows.push({ cells, header: i === headerIndex });
  });
  if (bodyRows.length === 0) return [];

  // Pad every row to the widest, then keep only columns with content SOMEWHERE — a
  // column empty in every row is the model's gap artifact and carries no information.
  const cols = Math.max(...bodyRows.map((r) => r.cells.length));
  const matrix = bodyRows.map((r) => {
    const padded = r.cells.slice(0, cols);
    while (padded.length < cols) padded.push('');
    return padded;
  });
  const keep: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (matrix.some((row) => row[c].length > 0)) keep.push(c);
  }
  if (keep.length === 0) return [];

  const tableRows: JSONContent[] = bodyRows.map((r, ri) => ({
    type: 'tableRow',
    content: keep.map((c) => ({
      type: r.header ? 'tableHeader' : 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: cellContent(matrix[ri][c]),
    })),
  }));
  return [{ type: 'table', content: tableRows }];
}

/** Unescape backslash-escaped markdown punctuation at the LINE level, BEFORE block
 *  classification, so a stray `0\. text` becomes `0. text` and then matches the
 *  ordered regex (unescaping inside `inlineToNodes` would be too late). `|` is
 *  deliberately EXCLUDED — unescaping pipes could manufacture table syntax out of
 *  prose, so an escaped pipe keeps its backslash. */
function unescapePunctuation(line: string): string {
  return line.replace(/\\([\\`*_{}[\]()#+.!>~-])/g, '$1');
}

/**
 * The named HTML entities a model plausibly emits into worksheet prose — the five
 * escapes plus the typography it reaches for when spacing multiple-choice options or
 * writing money/measure vocabulary. `nbsp` (and the other spaces) decode to an
 * ORDINARY space, never U+00A0: the sheet wants a normal gap, not a non-breaking one.
 * Deliberately absent: `vert` / `VerticalLine` (both `|`) — see {@link decodeEntities}.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', hairsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»',
  times: '×', divide: '÷', deg: '°', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾',
  copy: '©', reg: '®', trade: '™', sect: '§', para: '¶',
  pound: '£', euro: '€', cent: '¢',
};

/** Matches one named entity (`&nbsp;`), decimal (`&#160;`) or hex (`&#xA0;`) form. */
const ENTITY_RE = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Decode HTML entities at the LINE level, in the same place — and for the same reason —
 * as {@link unescapePunctuation}: the model emits `&nbsp;`/`&amp;`/`&mdash;` (and numeric
 * `&#124;`-style forms) to space out or punctuate options, and passed through verbatim
 * they print as literal `&nbsp;` on a student's sheet. Named entities in {@link
 * NAMED_ENTITIES} and both numeric forms are decoded; an unknown named entity is left
 * untouched (never blanked). One left-to-right pass — replaced output is NOT re-scanned —
 * so `&amp;lt;` decodes to the literal text `&lt;`, not to `<`.
 *
 * Markup-manufacturing guard: decoding `&#124;` / `&#x7C;` (and the omitted `&vert;` /
 * `&VerticalLine;`) would yield a `|`, which the table-run scan ({@link isTableRow}) could
 * then read as a pipe table built out of prose — the exact hazard the `|` exclusion in
 * `unescapePunctuation` guards. So a codepoint of U+007C is left as its literal entity, not
 * decoded. Other markup-significant characters (`#`, `*`, `-`, digits + `.`) are decoded:
 * `unescapePunctuation` already activates those from backslash escapes by design, and the
 * established policy treats the pipe/table case as the only one to suppress.
 */
function decodeEntities(line: string): string {
  if (line.indexOf('&') === -1) return line;
  return line.replace(ENTITY_RE, (whole, body: string) => {
    if (body.charCodeAt(0) === 35 /* '#' */) {
      const hex = body.charCodeAt(1) === 120 || body.charCodeAt(1) === 88; /* 'x' | 'X' */
      const cp = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isInteger(cp) || cp < 1 || cp > 0x10ffff) return whole;
      if (cp >= 0xd800 && cp <= 0xdfff) return whole; // lone surrogate — invalid
      if (cp === 0x7c) return whole; // '|' — mirror the pipe exclusion above
      if (cp === 0xa0) return ' '; // numeric nbsp → an ordinary space, as `&nbsp;` above
      try {
        return String.fromCodePoint(cp);
      } catch {
        return whole;
      }
    }
    const mapped = NAMED_ENTITIES[body];
    return mapped === undefined ? whole : mapped;
  });
}

/**
 * Convert a simple-markdown string into a tiptap/ProseMirror `doc` — the
 * server-safe counterpart of {@link markdownToHtml}. Supports `#`/`##`/`###`
 * headings, `-`/`*`/`+` bullet lists, `1.` ordered lists (honouring the first
 * item's number as the list `start`), blank-line-separated paragraphs (multi-line
 * paragraphs joined with hard breaks), and `**bold**` / `*italic*` inline marks.
 * Thematic breaks (`---`) are dropped, a contiguous run of pipe-table rows becomes a
 * real `table` node (the v3 schema supports tables — the model's two-column matching
 * grid is honoured, not flattened), and a `[Picture: …]` marker alone on its line is
 * kept as its OWN paragraph (so the image-substitution sites can find it). HTML entities
 * (`&nbsp;`, `&amp;`, `&mdash;`, numeric `&#160;`/`&#xA0;`) are decoded so they never
 * print as literal text (see {@link decodeEntities}). Everything else — including
 * inline `[Picture: …]` markers and `______` blanks — passes through as literal text.
 */
export function markdownToDoc(markdown: string): JSONContent {
  // Right-trim, unescape, then decode HTML entities on every line up front, so block
  // classification (and the table run scan below) sees the same, normalised text.
  // Unescape runs BEFORE decode so a decoded backslash is never re-consumed as an escape.
  const lines = (markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => decodeEntities(unescapePunctuation(l.replace(/\s+$/, ''))));
  const content: JSONContent[] = [];

  let para: string[] = [];
  let list: { ordered: boolean; items: string[]; start?: number } | null = null;

  const flushPara = () => {
    if (para.length) {
      content.push(paragraphNode(para));
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const node: JSONContent = {
        type: list.ordered ? 'orderedList' : 'bulletList',
        content: list.items.map(listItemNode),
      };
      // A faithful `start` (the first item's own number) so a `2. 3.` run — closed
      // out of a longer sequence by intervening prose — still renders `2. 3.`.
      if (list.ordered && typeof list.start === 'number') node.attrs = { start: list.start };
      content.push(node);
      list = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '') {
      // A blank line ends a paragraph but NOT a list — AI markdown routinely puts
      // blank lines between numbered items (mirrors `markdownToHtml`).
      flushPara();
      continue;
    }

    // A thematic break: drop it (no schema node), closing any open paragraph/list.
    if (THEMATIC_BREAK.test(line.trim())) {
      flushPara();
      flushList();
      continue;
    }

    // A `[Picture: …]` marker alone on its line becomes its OWN paragraph and does
    // NOT absorb the following line — the substitution sites (compile / pane) only
    // match a marker that is the paragraph's entire content.
    if (PICTURE_MARKER_LINE.test(line)) {
      flushPara();
      flushList();
      content.push(paragraphNode([line]));
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: inlineToNodes(heading[2].trim()),
      });
      continue;
    }

    // A contiguous run of >=2 pipe-table rows flattens to legible text. A lone pipe
    // line is not a table — it falls through to the plain-text branch verbatim.
    if (isTableRow(line)) {
      let j = i;
      while (j + 1 < lines.length && isTableRow(lines[j + 1])) j++;
      if (j > i) {
        flushPara();
        flushList();
        content.push(...tableToNodes(lines.slice(i, j + 1)));
        i = j;
        continue;
      }
    }

    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [], start: parseInt(ordered[1], 10) };
      }
      list.items.push(ordered[2].trim());
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1].trim());
      continue;
    }

    flushList();
    para.push(line);
  }

  flushPara();
  flushList();
  return { type: 'doc', content };
}
