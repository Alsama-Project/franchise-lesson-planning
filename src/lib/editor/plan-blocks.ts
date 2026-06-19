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

/** Total minutes of the three fixed opening routines (anthem · warm-up · cool down). */
export function routinesMinutes(blocks: Block[]): number {
  return blocks
    .filter((b) => b.type === 'anthem' || b.type === 'warm_up' || b.type === 'cool_down')
    .reduce((t, b) => t + blockMinutes(b), 0);
}
