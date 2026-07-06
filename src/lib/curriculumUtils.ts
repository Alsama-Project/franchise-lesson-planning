import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { parseTaxonomyId } from '@/lib/curriculum/taxonomy';
import { planCurriculumLabelKey, type PlanCurriculumLabel } from '@/lib/curriculum/plan-labels';
import type { CurriculumLesson } from '@/types/curriculum';
import type { CurriculumLessonRow } from '@/lib/curriculum/types';
import type { MonthNav, PickerCell } from '@/components/create-lesson/types';

// ── Supabase-backed curriculum (was: committed curriculum.json) ──────────────────
//
// Curriculum lives in the `curriculum_lesson` Supabase table, populated via
// /api/curriculum/import. This module preserves the public surface of the old
// flat-file utils; every query is async.
//
// SCOPED READS — every consumer reads ONLY the rows it needs (by subject / year /
// month / week / lesson_key), filtered in the DB against the `idx_curr_nav`
// (subject_code, year, month, week) index. This replaced a single "load ALL active
// rows, slice in memory" cache: PostgREST caps a plain select at 1000 rows, so that
// read silently truncated 6071 active rows to 1000 and made most subjects/years
// invisible in the picker, weekly board, and editor. No scope here exceeds a few
// hundred rows, so the cap can never bite; there is no cross-request cache, so there
// is nothing to invalidate (a sync is visible on the next request). The distinct
// subject list — the one read that isn't naturally scoped — comes from the
// `curriculum_active_subjects` view (0045): a ~7-row DISTINCT that is uncapped by
// construction. Reads use the service-role client because curriculum is global
// reference data, identical for every authenticated user (see @/lib/supabase/admin).

/** Strip the leading ". " stem some LO fields carry (legacy curriculum.json artefact). */
export function cleanLO(raw: string): string {
  if (!raw) return '';
  return raw.replace(/^(\.\s*)+/, '').trim();
}

// ── Scoped DB fetch ───────────────────────────────────────────────────────────

const COLUMNS =
  'subject_code, year, month, week, period, lesson_key, daily_outcome, focus_area, ' +
  'linguistic_skill, theme, resources, taxonomy_id, monthly_knowledge_lo, ' +
  'monthly_skills_lo, weekly_knowledge_lo, weekly_skills_lo, grammar_vocabulary, monthly_lo, ' +
  'subject_learning_outcome, annual_learning_outcome';

interface RowFilters {
  subjectCode?: string;
  year?: number;
  month?: string;
  week?: number;
  lessonKey?: string;
  taxonomyId?: string;
  /**
   * Pin the read to one curriculum VERSION (a plan-pinned resolve). When set, the
   * read hits the base `curriculum_lesson` table scoped to this version — so a plan
   * on a historical version resolves that version's rows, silently. When ABSENT the
   * read hits the `curriculum_lesson_active` view (the subject's active version only),
   * which is what every browse/picker/board caller wants.
   */
  versionId?: string;
}

/**
 * Fetch `curriculum_lesson` rows narrowed by the given natural-key filters.
 *
 * Version scoping (see {@link RowFilters.versionId}):
 *   • no `versionId` → the `curriculum_lesson_active` view — active version + active
 *     rows only. Since `lesson_key` is unique per version, resolving through the
 *     active view keeps the old "single active row per key" semantics for browse.
 *   • `versionId` set → the base table pinned to that version (plan-pinned resolve);
 *     historical rows are `is_active = true` (never mutated on demotion), so the read
 *     still filters `is_active` for parity without hiding a historical plan's rows.
 *
 * Every caller passes enough of (subject, year, month, week) — or an exact key — that
 * the result is at most a few hundred rows, so the PostgREST 1000-row cap is never
 * reached.
 */
async function fetchRows(filters: RowFilters): Promise<CurriculumLessonRow[]> {
  const supabase = createAdminClient();
  const source = filters.versionId != null ? 'curriculum_lesson' : 'curriculum_lesson_active';
  let query = supabase.from(source).select(COLUMNS).eq('is_active', true);
  if (filters.versionId != null) query = query.eq('curriculum_version_id', filters.versionId);
  if (filters.subjectCode != null) query = query.eq('subject_code', filters.subjectCode);
  if (filters.year != null) query = query.eq('year', filters.year);
  if (filters.month != null) query = query.eq('month', filters.month);
  if (filters.week != null) query = query.eq('week', filters.week);
  if (filters.lessonKey != null) query = query.eq('lesson_key', filters.lessonKey);
  if (filters.taxonomyId != null) query = query.eq('taxonomy_id', filters.taxonomyId);
  const { data, error } = await query;
  if (error) throw new Error(`Curriculum read failed: ${error.message}`);
  return (data ?? []) as unknown as CurriculumLessonRow[];
}

/**
 * The id of a subject's ACTIVE curriculum version, or null when the subject has no
 * curriculum yet. Used to stamp a new lesson plan at creation so it pins to the
 * version it was authored under.
 */
export async function getActiveCurriculumVersionId(
  subjectCode: string,
): Promise<string | null> {
  if (!subjectCode) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('curriculum_version')
    .select('id')
    .eq('subject_code', subjectCode)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Active curriculum version read failed: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

// ── Per-plan curriculum labels (version-pinned) ─────────────────────────────────

// The label type + key builder are pure and live in a server-free module so the
// version-keying contract is unit-testable in isolation; re-exported here so
// callers import the whole label API from one place.
export { planCurriculumLabelKey, type PlanCurriculumLabel };

/**
 * Resolve the display label (daily outcome + focus area) for a SET of lesson
 * plans, each PINNED to the plan's stamped `curriculum_version_id`. A list entry
 * for a historical plan then shows the same curriculum the plan renders when
 * opened — silently, no version marker — instead of drifting to the active
 * version's text after a re-author.
 *
 * Read scoping mirrors {@link getLessonById}: a stamped plan reads the base
 * `curriculum_lesson` table pinned to its version; an unstamped plan reads the
 * `curriculum_lesson_active` view (the subject's active version). Batched into at
 * most two reads regardless of list size. Missing/archived rows simply have no
 * entry, so callers fall back to their own placeholder (parity with the old
 * active-only lookup). Keyed by {@link planCurriculumLabelKey}.
 */
export async function getPlanCurriculumLabels(
  plans: ReadonlyArray<{ lessonKey: string; versionId: string | null }>,
): Promise<Map<string, PlanCurriculumLabel>> {
  const out = new Map<string, PlanCurriculumLabel>();
  if (plans.length === 0) return out;

  const supabase = createAdminClient();

  // Partition the requested plans: version-stamped keys resolve against the base
  // table pinned to their version; unstamped keys resolve against the active view.
  const pinnedKeys = new Set<string>();
  const pinnedVersionIds = new Set<string>();
  const activeKeys = new Set<string>();
  for (const p of plans) {
    if (!p.lessonKey) continue;
    if (p.versionId) {
      pinnedKeys.add(p.lessonKey);
      pinnedVersionIds.add(p.versionId);
    } else {
      activeKeys.add(p.lessonKey);
    }
  }

  const reads: Array<PromiseLike<void>> = [];

  if (pinnedKeys.size > 0) {
    // Over-fetches the (keys × versions) cross-product, but the exact
    // (lesson_key, version) pair is what we key on, so unrelated pairs are
    // ignored. `is_active` keeps parity with the resolve path (historical rows
    // stay active on demotion, so this never hides a pinned plan's row).
    reads.push(
      supabase
        .from('curriculum_lesson')
        .select('lesson_key, curriculum_version_id, daily_outcome, focus_area')
        .eq('is_active', true)
        .in('lesson_key', [...pinnedKeys])
        .in('curriculum_version_id', [...pinnedVersionIds])
        .then(({ data, error }) => {
          if (error) throw new Error(`Plan curriculum label read failed: ${error.message}`);
          for (const r of (data ?? []) as Array<{
            lesson_key: string;
            curriculum_version_id: string;
            daily_outcome: string | null;
            focus_area: string | null;
          }>) {
            out.set(planCurriculumLabelKey(r.lesson_key, r.curriculum_version_id), {
              dailyOutcome: (r.daily_outcome ?? '').trim(),
              focusArea: (r.focus_area ?? '').trim(),
            });
          }
        }),
    );
  }

  if (activeKeys.size > 0) {
    reads.push(
      supabase
        .from('curriculum_lesson_active')
        .select('lesson_key, daily_outcome, focus_area')
        .in('lesson_key', [...activeKeys])
        .then(({ data, error }) => {
          if (error) throw new Error(`Plan curriculum label read failed: ${error.message}`);
          for (const r of (data ?? []) as Array<{
            lesson_key: string;
            daily_outcome: string | null;
            focus_area: string | null;
          }>) {
            out.set(planCurriculumLabelKey(r.lesson_key, null), {
              dailyOutcome: (r.daily_outcome ?? '').trim(),
              focusArea: (r.focus_area ?? '').trim(),
            });
          }
        }),
    );
  }

  await Promise.all(reads);
  return out;
}

// ── Row → legacy CurriculumLesson mapping ───────────────────────────────────────
//
// The legacy presentational shape is preserved so consumers (and their hand-narrow
// types) don't change. The S/K refs come from the canonical taxonomy parser
// (`FA.S.K.H` — segment 1 is the Focus Area, NOT the year); the new natural key is
// (subject, year, month, week, period), so `year` here always comes from the row's
// dedicated `year` column, never inferred from the taxonomy id.

function parseTaxonomy(id: string | null): { skillRef: string; knowledgeRef: string } {
  const t = parseTaxonomyId(id);
  return { skillRef: t.skillLo ?? '', knowledgeRef: t.knowledgeLo ?? '' };
}

function rowToLesson(row: CurriculumLessonRow): CurriculumLesson {
  const { skillRef, knowledgeRef } = parseTaxonomy(row.taxonomy_id);
  return {
    id: row.taxonomy_id ?? row.lesson_key,
    year: `Year ${row.year}`,
    yearNum: row.year,
    month: row.month,
    week: row.week,
    period: `Period ${row.period}`,
    periodNum: row.period,
    dailyLO: cleanLO(row.daily_outcome ?? ''),
    linguisticSkill: row.linguistic_skill ?? row.focus_area ?? '',
    skillLORef: skillRef,
    skillLO: cleanLO(row.monthly_skills_lo ?? ''),
    knowledgeLORef: knowledgeRef,
    knowledgeLO: cleanLO(row.weekly_knowledge_lo ?? ''),
    // Combined "Monthly Learning Outcome" column (distinct from monthly_skills_lo
    // above); flows to the AI resource generator as monthly context.
    monthlyLO: cleanLO(row.monthly_lo ?? ''),
    // The legacy `resources` was a single string; join the structured labels so the
    // shape is unchanged. Structured resources stay available on the DB row itself.
    resources: row.resources.map((r) => r.label).filter(Boolean).join(', '),
    // Grammar & Vocabulary lives in its own `grammar_vocabulary` column (added by the
    // import migration). It used to be read off `focus_area`, which is always empty for
    // English, so the editor's Grammar & Vocabulary panel showed "—" for every lesson.
    vocabFocus: '',
    grammarFocus: cleanLO(row.grammar_vocabulary ?? ''),
    theme: row.theme ?? '',
    subject: row.subject_code,
  };
}

// ── Public API (preserved surface; async) ────────────────────────────────────────

/**
 * Resolve a stored `lesson_plans.curriculum_lesson_id` to its single lesson.
 *
 * Resolution is on the FULL identity: the exact `lesson_key` (the value new pickers
 * write; UNIQUE in the table → at most one active row) first. Only when that misses
 * do we fall back to a legacy `taxonomy_id` — and that id is NOT year-unique (its
 * first segment is the Focus Area, not the year; see `parseTaxonomyId`). It therefore
 * identifies a lesson ONLY when exactly one active row carries it: when it matches
 * multiple years we cannot recover which the plan meant from the id alone, so we
 * return null rather than silently loading an arbitrary year's context. This closes
 * the FA-as-year leak documented in curriculum/INGEST_NOTES.md (the old code returned
 * every matching year row and the caller blindly took the first).
 */
export async function getLessonById(
  id: string,
  versionId?: string | null,
): Promise<CurriculumLesson | null> {
  if (!id) return null;

  // A stamped plan resolves within ITS version (silent pin — historical plans render
  // their old curriculum). An unstamped/legacy plan (no versionId) resolves against
  // the subject's active version via the active-version view.
  const pin = versionId ?? undefined;

  const keyRows = await fetchRows({ lessonKey: id, versionId: pin });
  if (keyRows.length > 0) return rowToLesson(keyRows[0]);

  const taxonomyRows = await fetchRows({ taxonomyId: id, versionId: pin });
  return taxonomyRows.length === 1 ? rowToLesson(taxonomyRows[0]) : null;
}

/**
 * The curriculum lesson immediately preceding a given slot, within the same
 * (subject, year). Lessons are ordered by (week, period): weeks are numbered
 * globally across the school year (monotonically increasing across months — the
 * month is only a label), so this is a clean total order with no duplicate slots.
 * Returns null when the slot is the first lesson of its year, or unknown.
 */
export async function getPreviousLesson(
  subject: string,
  year: number | string,
  week: number,
  period: number,
  versionId?: string | null,
): Promise<CurriculumLesson | null> {
  const yn = resolveYearNum(year);
  if (yn === null) return null;
  // Pinned to the plan's version: the previous lesson must come from the SAME version
  // the plan was authored under, else a re-authored subject would splice a new-version
  // lesson into an old-version plan's recap.
  const lessons = (await fetchRows({ subjectCode: subject, year: yn, versionId: versionId ?? undefined }))
    .map(rowToLesson)
    .filter((l) => l.week !== null && l.periodNum !== null)
    .sort(byWeekThenPeriod);
  const idx = lessons.findIndex((l) => l.week === week && l.periodNum === period);
  if (idx <= 0) return null;
  return lessons[idx - 1];
}

// ── "+ Lesson" curriculum picker (scoped by subject_code + year [+ month + week]) ──
//
// The picker navigates curriculum content by (subject_code, year, month, week) and
// needs the raw `lesson_key` (the value written into a new plan's
// `curriculum_lesson_id`), which the legacy `CurriculumLesson` shape doesn't carry.

/** Calendar-month order for sorting the month dropdown. */
const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthSortIndex(month: string): number {
  const i = MONTH_ORDER.indexOf(month);
  return i === -1 ? MONTH_ORDER.length : i;
}

/**
 * Months (in calendar order) with their available week numbers, for a
 * (subject_code, year) — drives the step-2 month dropdown + week stepper. Empty
 * when the subject/year hasn't been synced.
 */
export async function getCurriculumNav(
  subjectCode: string,
  year: number,
): Promise<MonthNav[]> {
  const rows = await fetchRows({ subjectCode, year });
  const byMonth = new Map<string, Set<number>>();
  for (const r of rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, new Set());
    byMonth.get(r.month)!.add(r.week);
  }
  return [...byMonth.entries()]
    .map(([month, weeks]) => ({ month, weeks: [...weeks].sort((a, b) => a - b) }))
    .sort((a, b) => monthSortIndex(a.month) - monthSortIndex(b.month));
}

/**
 * The curriculum cells for one (subject_code, year, month, week), one per period,
 * sorted by period. Empty when that week has no rows (the picker shows its empty
 * state). Each cell carries the `lesson_key` the create action writes.
 */
export async function getCurriculumWeekCells(
  subjectCode: string,
  year: number,
  month: string,
  week: number,
): Promise<PickerCell[]> {
  const rows = await fetchRows({ subjectCode, year, month, week });
  return rows
    .sort((a, b) => a.period - b.period)
    .map((r) => ({
      period: r.period,
      lessonKey: r.lesson_key,
      dailyOutcome: cleanLO(r.daily_outcome ?? ''),
      focusArea: r.focus_area ?? r.linguistic_skill ?? '',
    }));
}

/**
 * The distinct subject codes that have at least one active curriculum row. Reads the
 * `curriculum_active_subjects` view (0045) — a DISTINCT of ~7 rows that is uncapped by
 * construction, so the picker's subject list can never be truncated by the PostgREST
 * 1000-row limit (the bug that hid Arabic/IT/Science/Yoga).
 */
export async function getCurriculumSubjectCodes(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('curriculum_active_subjects').select('subject_code');
  if (error) throw new Error(`Curriculum subjects read failed: ${error.message}`);
  const codes = (data ?? []) as Array<{ subject_code: string }>;
  return [...new Set(codes.map((r) => r.subject_code))].sort();
}

/**
 * The full active rows for one (subject_code, year, month, week), sorted by
 * period. Unlike `getCurriculumWeekCells` (the picker's lean cell shape), this
 * returns the complete `CurriculumLessonRow` so callers can read the weekly /
 * monthly outcome fields and structured resources.
 */
export async function getCurriculumWeekRows(
  subjectCode: string,
  year: number,
  month: string,
  week: number,
): Promise<CurriculumLessonRow[]> {
  const rows = await fetchRows({ subjectCode, year, month, week });
  return rows.sort((a, b) => (a.period ?? 0) - (b.period ?? 0));
}

/**
 * The full active rows for one (subject_code, year, month) — every week and
 * period in the month — sorted by (week, period). Backs the monthly calendar grid.
 */
export async function getCurriculumMonthRows(
  subjectCode: string,
  year: number,
  month: string,
): Promise<CurriculumLessonRow[]> {
  const rows = await fetchRows({ subjectCode, year, month });
  return rows.sort((a, b) => a.week - b.week || (a.period ?? 0) - (b.period ?? 0));
}

/** A curriculum row's natural coordinates, resolved from its `lesson_key`. */
export interface CurriculumKeyCoords {
  subjectCode: string;
  year: number;
  month: string;
  week: number;
  period: number;
}

/**
 * Resolve a `curriculum_lesson.lesson_key` to its natural coordinates (subject,
 * year, month, week, period). Used by the scope-aware create action to derive a
 * plan's subject/year server-side rather than trusting client input. `lesson_key` is
 * UNIQUE, so the scoped lookup returns the same single row the old in-memory `.find`
 * did. Returns null when the key matches no active row.
 */
export async function getCurriculumKeyCoords(
  lessonKey: string,
): Promise<CurriculumKeyCoords | null> {
  if (!lessonKey) return null;
  const rows = await fetchRows({ lessonKey });
  const row = rows[0];
  if (!row) return null;
  return {
    subjectCode: row.subject_code,
    year: row.year,
    month: row.month,
    week: row.week,
    period: row.period,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveYearNum(year: number | string): number | null {
  if (typeof year === 'number') return year;
  const m = year.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function byPeriod(a: CurriculumLesson, b: CurriculumLesson): number {
  return (a.periodNum ?? 0) - (b.periodNum ?? 0);
}

function byWeekThenPeriod(a: CurriculumLesson, b: CurriculumLesson): number {
  const wDiff = (a.week ?? 0) - (b.week ?? 0);
  return wDiff !== 0 ? wDiff : byPeriod(a, b);
}
