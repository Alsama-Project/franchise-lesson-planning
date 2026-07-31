// The "Link it together" model and its read-time normalizer.
//
// "Link it together" is the Recap + Check-for-understanding + Exit-ticket section
// of the editor. Its data lives inside the `lesson_plans.blocks` JSONB array (no
// dedicated columns): the Recap free-text on the `recap` block's `note`, and the
// chosen techniques on the `cfu` / `exit_ticket` blocks' `techniques` array.
//
// There is NO SQL migration: a single normalizer maps ANY plan row — new or
// legacy — into the in-app `LinkIt` shape at read time. Legacy plans stored a
// single technique per block (`activity_ref` + block `note`); that maps to a
// one-element array. The normalizer never throws on missing/old data: a plan with
// nothing planned yields the empty shape.

import type { Block, LinkItTechnique } from '@/types/lesson';
import { getBlock, patchBlock } from '@/lib/editor/plan-blocks';

/** The in-app "Link it together" shape (technique refs are stable activity ids). */
export interface LinkIt {
  recap: string;
  checkForUnderstanding: LinkItTechnique[];
  exitTicket: LinkItTechnique[];
}

/** The safe default for a plan with no Link-it data. */
export const EMPTY_LINK_IT: LinkIt = {
  recap: '',
  checkForUnderstanding: [],
  exitTicket: [],
};

/** A pre-approved technique as the editor knows it (subset of ActivityBankItem). */
export interface TechniqueOption {
  id: string;
  name: string;
}

/** Map a single cfu/exit block to its technique list, mapping legacy storage in. */
function normalizeCategory(block: Block | undefined): LinkItTechnique[] {
  if (!block) return [];
  // New model: an explicit `techniques` array wins, even when empty (the teacher
  // may have removed every technique). Guard each entry so a malformed row can
  // never throw or leak a non-string ref.
  if (Array.isArray(block.techniques)) {
    return block.techniques
      .filter((t): t is LinkItTechnique => !!t && typeof t.technique === 'string' && t.technique !== '')
      .map((t) => ({ technique: t.technique, note: typeof t.note === 'string' ? t.note : '' }));
  }
  // Legacy single-select: one `activity_ref` + the block `note` → one entry.
  if (block.activity_ref) {
    return [{ technique: block.activity_ref, note: block.note ?? '' }];
  }
  return [];
}

/**
 * Turn any plan's blocks into the `LinkIt` shape. Never throws: missing blocks /
 * old data default to the empty shape.
 */
export function normalizeLinkIt(blocks: Block[]): LinkIt {
  if (!Array.isArray(blocks)) return { ...EMPTY_LINK_IT };
  return {
    recap: getBlock(blocks, 'recap')?.note ?? '',
    checkForUnderstanding: normalizeCategory(getBlock(blocks, 'cfu')),
    exitTicket: normalizeCategory(getBlock(blocks, 'exit_ticket')),
  };
}

/**
 * Write a `LinkIt` back onto the blocks array for persistence. Recap goes to the
 * `recap` block's `note`; the technique arrays go to the `cfu` / `exit_ticket`
 * blocks' `techniques`. The legacy `activity_ref` / `activity_title` fields are
 * deliberately untouched (left in place for rollback).
 */
export function applyLinkIt(blocks: Block[], linkIt: LinkIt): Block[] {
  let next = patchBlock(blocks, 'recap', { note: linkIt.recap });
  next = patchBlock(next, 'cfu', { techniques: linkIt.checkForUnderstanding });
  next = patchBlock(next, 'exit_ticket', { techniques: linkIt.exitTicket });
  return next;
}

/** Build an id → display-name map from the loaded technique options. */
export function techniqueLabelMap(...lists: TechniqueOption[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const list of lists) for (const t of list) map.set(t.id, t.name);
  return map;
}

/** Resolve technique entries to display rows, looking up each label by stable id. */
export function resolveTechniques(
  entries: LinkItTechnique[],
  labelById: Map<string, string>,
): { label: string; note: string }[] {
  return entries.map((e) => ({
    label: labelById.get(e.technique) ?? 'Technique',
    note: e.note,
  }));
}
