// Helpers for working with a plan's ordered `blocks` array in the wizard editor.
// Blocks are keyed by their fixed `type`; these utilities locate and update a
// block by type and derive the review/materials views the steps render.

import type { Block, LessonBlockType } from '@/types/lesson';
import { blockMinutes } from '@/lib/blocks';

/** Index of the first block of a given type, or -1 if absent. */
export function blockIndex(blocks: Block[], type: LessonBlockType): number {
  return blocks.findIndex((b) => b.type === type);
}

/** The first block of a given type, or undefined. */
export function getBlock(blocks: Block[], type: LessonBlockType): Block | undefined {
  return blocks.find((b) => b.type === type);
}

/**
 * Return a new blocks array with the first block of `type` patched. If no such
 * block exists the array is returned unchanged.
 */
export function patchBlock(
  blocks: Block[],
  type: LessonBlockType,
  patch: Partial<Block>,
): Block[] {
  const i = blockIndex(blocks, type);
  if (i === -1) return blocks;
  return blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
}

/**
 * Derive a starting list of required materials from the planned blocks: every
 * non-empty `resources` entry, split on newlines/commas/semicolons and
 * de-duplicated. Used to pre-fill the Review step's editable chips.
 */
export function deriveMaterials(blocks: Block[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (!b.resources) continue;
    for (const piece of b.resources.split(/[\n,;]+/)) {
      const item = piece.trim();
      if (!item) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** The editable lesson parts shown in the Review table, in lesson order. */
export const REVIEW_EDITABLE_TYPES: LessonBlockType[] = [
  'check_homework',
  'recap',
  'new_content',
  'cfu',
  'independent_practice',
  'exit_ticket',
];

/** The three opening-routine block types, in lesson order. */
const ROUTINE_TYPES: LessonBlockType[] = ['anthem', 'warm_up', 'cool_down'];

/** Total minutes of the three opening routines (anthem · warm-up · cool down). */
export function routinesMinutes(blocks: Block[]): number {
  return blocks
    .filter((b) => ROUTINE_TYPES.includes(b.type))
    .reduce((t, b) => t + blockMinutes(b), 0);
}

/**
 * Return a new blocks array with the opening routines' total minutes set to
 * `total`, distributed as evenly as possible across the routine blocks present
 * (remainder to the earliest blocks) so their sum stays exactly `total`. The
 * routine content stays standard — only the time changes. Negative inputs clamp
 * to 0. If no routine blocks exist the array is returned unchanged.
 */
export function setRoutinesMinutes(blocks: Block[], total: number): Block[] {
  const present = ROUTINE_TYPES.filter((type) => blockIndex(blocks, type) !== -1);
  if (present.length === 0) return blocks;
  const safe = Math.max(0, Math.round(total));
  const base = Math.floor(safe / present.length);
  const remainder = safe % present.length;
  const minutesByType = new Map<LessonBlockType, number>(
    present.map((type, i) => [type, base + (i < remainder ? 1 : 0)]),
  );
  return blocks.map((b) =>
    minutesByType.has(b.type) ? { ...b, minutes: minutesByType.get(b.type)! } : b,
  );
}
