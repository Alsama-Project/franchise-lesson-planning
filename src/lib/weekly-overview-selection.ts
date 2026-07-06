// Shared board selection: curriculum coordinate → curriculum_lesson keys → the
// plans whose `curriculum_lesson_id` matches.
//
// The planning board does NOT select plans by class or date. It selects by a
// curriculum coordinate — (subject space · year(s) · month · week) — expands that
// to the set of `curriculum_lesson` keys for the week, and reads every plan whose
// `curriculum_lesson_id` is one of those keys. RLS on `lesson_plans` does the
// class/centre/org scoping; there is deliberately NO class filter and NO date
// filter on this path.
//
// Both the board data layer (`@/lib/weekly-overview`) and the weekly PDF export
// (`@/lib/pdf/load`) call this module, so the two can never diverge on which
// plans belong to a coordinate.

import type { createClient } from '@/lib/supabase/server';
import { getCurriculumWeekCells } from '@/lib/curriculumUtils';
import type { PickerCell } from '@/components/create-lesson/types';

/** A Supabase client as returned by createClient (untyped project schema). */
type Db = Awaited<ReturnType<typeof createClient>>;

/** The lesson keys for a coordinate plus the per-key lookups callers re-derive. */
export interface WeekSlotKeys {
  /** Every `curriculum_lesson.lesson_key` across the selected years for the week. */
  slotKeys: Set<string>;
  /** lessonKey → curriculum period (1–5). The board's weekday/period fallback. */
  periodByKey: Map<string, number>;
  /** lessonKey → daily learning outcome (stem-cleaned). */
  outcomeByKey: Map<string, string>;
  /** The raw picker cells per year, in the order `years` was given. */
  cellsByYear: PickerCell[][];
}

/**
 * Expand a curriculum coordinate to its lesson keys. `years` is the set of year
 * groups in scope (the board's taught years, or every curriculum year for a
 * no-class member); the keys are the union across them. The maps let a caller map
 * a plan's `curriculum_lesson_id` back to its curriculum period / daily outcome.
 */
export async function resolveWeekSlotKeys(
  subjectCode: string,
  years: number[],
  month: string,
  week: number,
): Promise<WeekSlotKeys> {
  const cellsByYear = await Promise.all(
    years.map((y) => getCurriculumWeekCells(subjectCode, y, month, week)),
  );

  const slotKeys = new Set<string>();
  const periodByKey = new Map<string, number>();
  const outcomeByKey = new Map<string, string>();
  for (const cells of cellsByYear) {
    for (const cell of cells) {
      slotKeys.add(cell.lessonKey);
      periodByKey.set(cell.lessonKey, cell.period);
      outcomeByKey.set(cell.lessonKey, cell.dailyOutcome);
    }
  }

  return { slotKeys, periodByKey, outcomeByKey, cellsByYear };
}

/**
 * Read every plan whose `curriculum_lesson_id` is one of `slotKeys`, selecting
 * the given columns. RLS scopes visibility (class/centre/org within the user's
 * subject membership) — there is intentionally no class or date filter here.
 * Trashed plans (`deleted_at` set — soft delete, migration 0048) are excluded so
 * neither the board nor the weekly PDF (both route through here) shows a ghost card.
 * Returns an empty array when there are no lesson keys (the query is skipped).
 */
export async function selectWeekPlanRows<T>(
  supabase: Db,
  slotKeys: Set<string>,
  columns: string,
): Promise<T[]> {
  if (slotKeys.size === 0) return [];
  const { data } = await supabase
    .from('lesson_plans')
    .select(columns)
    .in('curriculum_lesson_id', [...slotKeys])
    .is('deleted_at', null);
  return (data ?? []) as unknown as T[];
}
