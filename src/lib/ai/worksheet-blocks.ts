// Plan step → worksheet section content (pure, dependency-free, unit-testable).
//
// The worksheet template marks where each plan step's content lands with a
// `{{block:<slot>}}` token. This module owns (a) the slot vocabulary, (b) the
// plan-block → slot mapping, and (c) turning a block's written fields into tiptap
// nodes VERBATIM: nothing is rewritten, summarised, translated or sent through the AI.
//
// Per section, in order:  Format line → [note, recap only] → "Teacher:" + teacher_does →
// "You:" + students_do.  An empty field omits its line. Not on the sheet: techniques,
// resources, resourceIds, activity_ref, and the anthem / warm_up / cool_down routines.

import type { Block } from '@/types/lesson';

/** The template-token slots, in worksheet order. */
export const BLOCK_SLOTS = [
  'recap',
  'new_content',
  'check_understanding',
  'independent_practice',
  'group_practice',
  'exit_ticket',
  'homework',
] as const;
export type BlockSlot = (typeof BLOCK_SLOTS)[number];

/** Narrow an arbitrary token/model value to a slot, or null. */
export function toBlockSlot(value: unknown): BlockSlot | null {
  return typeof value === 'string' && (BLOCK_SLOTS as readonly string[]).includes(value)
    ? (value as BlockSlot)
    : null;
}

/** Plan block type → template slot. Blocks absent here never reach the sheet. */
const SLOT_OF_BLOCK: Partial<Record<Block['type'], BlockSlot>> = {
  recap: 'recap',
  new_content: 'new_content',
  cfu: 'check_understanding',
  independent_practice: 'independent_practice',
  group_practice: 'group_practice',
  exit_ticket: 'exit_ticket',
  homework: 'homework',
};

/** The slot a plan block fills, or null (anthem / warm_up / cool_down / legacy). */
export function slotOfBlock(type: Block['type']): BlockSlot | null {
  return SLOT_OF_BLOCK[type] ?? null;
}

/** Content-language labels (from `worksheetArtifact.json`). */
export interface BlockLabels {
  format: string;
  teacher: string;
  you: string;
}

type Node = Record<string, unknown>;

const BULLET = /^\s*(?:[-•*])\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

function textNode(text: string, bold = false): Node {
  return bold ? { type: 'text', text, marks: [{ type: 'bold' }] } : { type: 'text', text };
}

/** A paragraph from literal lines joined by hard breaks. No markdown is interpreted. */
function paragraphOfLines(lines: string[]): Node {
  const content: Node[] = [];
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' });
    if (line.length > 0) content.push(textNode(line));
  });
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function listItem(text: string): Node {
  return { type: 'listItem', content: [{ type: 'paragraph', content: [textNode(text)] }] };
}

/**
 * The teacher's plain text as tiptap nodes, VERBATIM. Blank lines separate paragraphs,
 * single newlines become hard breaks, and `- ` / `• ` / `1.` lines keep their list
 * structure. `*`, `_` etc. stay literal — the text is the teacher's, not markdown.
 */
export function plainTextToNodes(text: string | null | undefined): Node[] {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const out: Node[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(paragraphOfLines(para));
    para = [];
  };
  const flushList = () => {
    if (list) {
      const node: Node = {
        type: list.ordered ? 'orderedList' : 'bulletList',
        content: list.items.map(listItem),
      };
      if (list.ordered && list.start !== 1) node.attrs = { start: list.start };
      out.push(node);
    }
    list = null;
  };
  for (const line of lines) {
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }
    const num = NUMBERED.exec(line);
    const bul = num ? null : BULLET.exec(line);
    if (num) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, start: parseInt(num[1], 10), items: [] };
      }
      list.items.push(num[2].trim());
    } else if (bul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, start: 1, items: [] };
      }
      list.items.push(bul[1].trim());
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out;
}

const has = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** The nodes for ONE plan block (empty when it wrote nothing for the sheet). */
export function blockNodes(block: Block, slot: BlockSlot, labels: BlockLabels): Node[] {
  const out: Node[] = [];
  if (has(block.activity_title)) {
    out.push({
      type: 'paragraph',
      content: [textNode(labels.format, true), textNode(` ${block.activity_title.trim()}`)],
    });
  }
  // The Recap step's free text IS the body of Warm-up and Recap — unlabelled.
  if (slot === 'recap' && has(block.note)) out.push(...plainTextToNodes(block.note));
  if (has(block.teacher_does)) {
    out.push({ type: 'paragraph', content: [textNode(labels.teacher, true)] });
    out.push(...plainTextToNodes(block.teacher_does));
  }
  if (has(block.students_do)) {
    out.push({ type: 'paragraph', content: [textNode(labels.you, true)] });
    out.push(...plainTextToNodes(block.students_do));
  }
  return out;
}

/** Every slot's teacher-written nodes for a plan (slots with nothing are omitted). */
export function buildBlockContent(
  blocks: Block[] | null | undefined,
  labels: BlockLabels,
): Partial<Record<BlockSlot, Node[]>> {
  const result: Partial<Record<BlockSlot, Node[]>> = {};
  for (const block of blocks ?? []) {
    const slot = slotOfBlock(block.type);
    if (!slot) continue;
    const nodes = blockNodes(block, slot, labels);
    if (nodes.length > 0) result[slot] = [...(result[slot] ?? []), ...nodes];
  }
  return result;
}
