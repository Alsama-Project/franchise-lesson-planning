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
 * Apply inline emphasis (bold then italic) to already-escaped text. Only
 * asterisk syntax is honoured — worksheet content routinely contains underscores
 * (fill-in-the-blank runs, snake_case), so treating `_` as emphasis would mangle
 * it. `**bold**` is matched before `*italic*` so the single-asterisk rule does
 * not split a bold run.
 */
function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
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
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push(paragraph(para));
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      const items = list.items.map((i) => `<li>${inline(escapeHtml(i))}</li>`).join('');
      out.push(`<${tag}>${items}</${tag}>`);
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

    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1].trim());
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
      // Bold inside italic, mirroring `inline()` above (** then *).
      if (marks.some((m) => m.type === 'bold')) text = `**${text}**`;
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
    case 'orderedList':
      return (node.content ?? []).map((li, i) => `${i + 1}. ${listItemInline(li)}`).join('\n');
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

/** Parse inline emphasis (asterisk only) into tiptap text nodes with marks. */
function inlineToNodes(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  // `**bold**` is matched before `*italic*` so a bold run is not split by the
  // single-asterisk rule. Underscores are NEVER emphasis — worksheet content is
  // full of `______` blanks and snake_case. Non-nested by construction (the char
  // classes forbid a `*` inside a run), matching `markdownToHtml`'s behaviour.
  const pattern = /\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const pushText = (value: string, mark?: 'bold' | 'italic') => {
    if (!value) return;
    nodes.push(mark ? { type: 'text', text: value, marks: [{ type: mark }] } : { type: 'text', text: value });
  };
  while ((match = pattern.exec(text)) !== null) {
    pushText(text.slice(last, match.index));
    if (match[1] !== undefined) pushText(match[1], 'bold');
    else pushText(match[2], 'italic');
    last = pattern.lastIndex;
  }
  pushText(text.slice(last));
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
 * Convert a simple-markdown string into a tiptap/ProseMirror `doc` — the
 * server-safe counterpart of {@link markdownToHtml}. Supports `#`/`##`/`###`
 * headings, `-`/`*`/`+` bullet lists, `1.` ordered lists, blank-line-separated
 * paragraphs (multi-line paragraphs joined with hard breaks), and
 * `**bold**` / `*italic*` inline marks. Everything else — including
 * `[Picture: …]` markers and `______` blanks — passes through as literal text.
 */
export function markdownToDoc(markdown: string): JSONContent {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const content: JSONContent[] = [];

  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      content.push(paragraphNode(para));
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      content.push({
        type: list.ordered ? 'orderedList' : 'bulletList',
        content: list.items.map(listItemNode),
      });
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (line.trim() === '') {
      // A blank line ends a paragraph but NOT a list — AI markdown routinely puts
      // blank lines between numbered items (mirrors `markdownToHtml`).
      flushPara();
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

    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1].trim());
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
