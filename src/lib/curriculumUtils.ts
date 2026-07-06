import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
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
  'monthly_skills_lo, weekly_knowledge_lo, weekly_skills_lo, grammar_vocabulary, monthly_lo';

interface RowFilters {
  subjectCode?: string;
  year?: number;
  month?: string;
  week?: number;
  lessonKey?: string;
  taxonomyId?: string;
}

/**
 * Fetch active `curriculum_lesson` rows narrowed by the given natural-key filters.
 * Every caller passes enough of (subject, year, month, week) — or an exact key — that
 * the result is at most a few hundred rows, so the PostgREST 1000-row cap is never
 * reached. Always scoped to `is_active = true`, matching the old resolve-over-active
 * semantics exactly.
 */
async function fetchRows(filters: RowFilters): Promise<CurriculumLessonRow[]> {
  const supabase = createAdminClient();
  let query = supabase.from('curriculum_lesson').select(COLUMNS).eq('is_active', true);
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

// ── Row → legacy CurriculumLesson mapping ───────────────────────────────────────
//
// The legacy presentational shape is preserved so consumers (and their hand-narrow
// types) don't change. The S/K refs are best-effort parsed from the taxonomy id
// (format `n.Sx.Kx.Hx`); the new natural key is (subject, year, month, week, period).

function parseTaxonomy(id: string | null): { skillRef: string; knowledgeRef: string } {
  const parts = (id ?? '').split('.');
  return {
    skillRef: parts.find((p) => /^S\d+$/i.test(p)) ?? '',
    knowledgeRef: parts.find((p) => /^K\d+$/i.test(p)) ?? '',
  };
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
 * Resolve a stored `lesson_plans.curriculum_lesson_id` to its lesson(s).
 *
 * Resolution order — IDENTICAL to the prior in-memory version: exact `lesson_key`
 * (the value new pickers write; UNIQUE in the table, so at most one active row) first,
 * then a best-effort match on legacy `taxonomy_id` (may match multiple year rows →
 * array). Returns null when nothing matches. The only behavioural change is that rows
 * beyond the old 1000-row cap now resolve instead of silently returning null.
 */
export async function getLessonById(
  id: string,
): Promise<CurriculumLesson | CurriculumLesson[] | null> {
  if (!id) return null;

  const keyRows = await fetchRows({ lessonKey: id });
  if (keyRows.length > 0) return rowToLesson(keyRows[0]);

  const taxonomyRows = await fetchRows({ taxonomyId: id });
  if (taxonomyRows.length === 0) return null;
  if (taxonomyRows.length === 1) return rowToLesson(taxonomyRows[0]);
  return taxonomyRows.map(rowToLesson);
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
): Promise<CurriculumLesson | null> {
  const yn = resolveYearNum(year);
  if (yn === null) return null;
  const lessons = (await fetchRows({ subjectCode: subject, year: yn }))
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
