// Heading-based auto-fill vocabulary + matching (pure, dependency-free).
//
// When a subject's worksheet template carries NO `{{block:<slot>}}` tokens, compile
// recognises the standard section headings instead ("4. Independent Practice" →
// `independent_practice`) and fills those sections from the plan. THIS FILE IS THE ONE
// PLACE TO EXTEND: add a heading synonym, a stub line, or a label below — no other file
// needs to change.
//
// Everything is compared after `normalise()`: leading numbering ("4.", "4)") stripped,
// case folded, and every run of punctuation/whitespace collapsed to one space — so
// "Warm-up and Recap", "4) warm up & recap" and "Warm-up, and recap." are all the same
// key. Synonyms below are therefore written in plain words.

import { BLOCK_SLOTS, type BlockSlot } from '@/lib/ai/worksheet-blocks';

/** Heading synonyms per slot. `en` is live; `ar` is deliberately EMPTY for now — an Arabic
 *  subject's headings match nothing and fall back to the old (anchor) behaviour. Fill the
 *  `ar` lists in once Kadria confirms the Arabic template headings. */
export const HEADING_SYNONYMS: Record<BlockSlot, { en: string[]; ar: string[] }> = {
  recap: { en: ['warm-up and recap', 'recap', 'warm up', 'warm-up'], ar: [] /* TODO(ar): pending Kadria */ },
  new_content: { en: ['new content', 'new content / skill'], ar: [] },
  check_understanding: { en: ['check for understanding', 'cfu'], ar: [] },
  independent_practice: { en: ['independent practice'], ar: [] },
  group_practice: { en: ['group practice'], ar: [] },
  exit_ticket: { en: ['exit ticket'], ar: [] },
  homework: { en: ['homework'], ar: [] },
};

/** Placeholder lines the template ships to be written over. Removed from a section that has
 *  content (compared normalised, so case/trailing punctuation don't matter). Exact list. */
export const STUB_LINES: string[] = [
  'Write the task instructions here.',
  'Write the questions or checks here.',
];

/** `[Insert …]` image/diagram boxes: kept while the section is empty, removed once it has
 *  content. Matches a paragraph whose whole text is one bracketed "Insert …" instruction. */
export const INSERT_BOX = /^\[\s*insert\b[^\]]*\]$/i;

/** Label lines that introduce a section's body ("Task instructions:" …). The plan text goes
 *  right after the first one found. Normalised comparison. */
export const BODY_LABELS: string[] = ['Task instructions:', 'Questions / checks:'];

/** The "Format:" line label(s). English only for now (Arabic: add the label here). */
export const FORMAT_LABELS: string[] = ['Format:'];

/** Masthead literals replaced in heading mode. The department placeholder is replaced as a
 *  SUBSTRING (the brackets make it unambiguous); the lesson-title placeholder only when a
 *  text node is EXACTLY that text. */
export const MASTHEAD_DEPARTMENT = '[Department Name]';
export const MASTHEAD_LESSON_TITLE = 'Lesson Title';

/** Lower-case, strip leading numbering, collapse punctuation/whitespace to single spaces. */
export function normalise(text: string): string {
  return text
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const SLOT_BY_HEADING = (() => {
  const map = new Map<string, Set<BlockSlot>>();
  for (const slot of BLOCK_SLOTS) {
    const { en, ar } = HEADING_SYNONYMS[slot];
    for (const s of [...en, ...ar]) {
      const key = normalise(s);
      if (!key) continue;
      const set = map.get(key) ?? new Set<BlockSlot>();
      set.add(slot);
      map.set(key, set);
    }
  }
  return map;
})();

const STUB_KEYS = new Set(STUB_LINES.map(normalise));
const LABEL_KEYS = new Set(BODY_LABELS.map(normalise));
const FORMAT_KEYS = FORMAT_LABELS.map(normalise);

/** The slot a heading's text names, or null when it names none OR is ambiguous. */
export function slotForHeading(text: string): BlockSlot | null {
  const slots = SLOT_BY_HEADING.get(normalise(text));
  return slots && slots.size === 1 ? [...slots][0] : null;
}

type Loose = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: Loose[];
  text?: string;
  marks?: { type?: string }[];
};

/** Concatenated direct text of a node ('' when none). */
export function nodeText(node: unknown): string {
  const n = node as Loose | null;
  if (!n || !Array.isArray(n.content)) return '';
  return n.content.map((c) => (c && c.type === 'text' ? (c.text ?? '') : '')).join('');
}

/** A paragraph whose every child is italic text — the template's printed hint line. A
 *  paragraph already carrying a `placeholder` attr is a hint NODE, not this. */
export function isItalicOnlyParagraph(node: unknown): boolean {
  const n = node as Loose | null;
  if (!n || n.type !== 'paragraph' || n.attrs?.placeholder || !Array.isArray(n.content) || n.content.length === 0) {
    return false;
  }
  return (
    n.content.every((c) => c.type === 'text' && !!c.marks?.some((m) => m.type === 'italic')) &&
    nodeText(n).trim().length > 0
  );
}

/** A `Format:` line (with or without text after the label). */
export function isFormatLine(node: unknown): boolean {
  if ((node as Loose | null)?.type !== 'paragraph') return false;
  const key = normalise(nodeText(node));
  return FORMAT_KEYS.some((f) => key === f || key.startsWith(`${f} `));
}

/** A `Format:` line with nothing after the label (a blank `____` counts as nothing). */
export function isEmptyFormatLine(node: unknown): boolean {
  return isFormatLine(node) && FORMAT_KEYS.includes(normalise(nodeText(node)));
}

export function isBodyLabelLine(node: unknown): boolean {
  return (node as Loose | null)?.type === 'paragraph' && LABEL_KEYS.has(normalise(nodeText(node)));
}

export function isStubLine(node: unknown): boolean {
  return (node as Loose | null)?.type === 'paragraph' && STUB_KEYS.has(normalise(nodeText(node)));
}

export function isInsertBox(node: unknown): boolean {
  return (node as Loose | null)?.type === 'paragraph' && INSERT_BOX.test(nodeText(node).trim());
}

/**
 * Match top-level heading nodes to slots. Returns heading index → slot. A slot claimed by
 * more than one heading is dropped entirely (ambiguous — never guess), as is any heading
 * whose text matches no slot or more than one.
 */
export function matchHeadingSlots(nodes: unknown[]): Map<number, BlockSlot> {
  const found: [number, BlockSlot][] = [];
  nodes.forEach((node, i) => {
    const n = node as Loose;
    if (n?.type !== 'heading') return;
    const slot = slotForHeading(nodeText(n));
    if (slot) found.push([i, slot]);
  });
  const counts = new Map<BlockSlot, number>();
  for (const [, slot] of found) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  return new Map(found.filter(([, slot]) => counts.get(slot) === 1));
}
