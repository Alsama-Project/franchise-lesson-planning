import 'server-only';

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CurriculumLesson } from '@/types/curriculum';
import type { CurriculumLessonRow } from '@/lib/curriculum/types';
import type { MonthNav, PickerCell } from '@/components/create-lesson/types';

// ── Supabase-backed curriculum (was: committed curriculum.json) ──────────────────
//
// Curriculum now lives in the `curriculum_lesson` Supabase table, populated from
// the curriculum Excel via /api/curriculum/import (n8n folder-watch + in-app
// upload). This module preserves the PUBLIC SURFACE of the old flat-file utils so
// consumers change minimally — but the old source was synchronous and the database
// is async, so every query function now returns a Promise. The three live consumers
// (editor load-plan, weekly-overview, pdf/load) and the orphaned curriculum-actions
// were updated to await.
//
// Reads are cached cross-request (`unstable_cache`) under CURRICULUM_CACHE_TAG; the
// import endpoint calls revalidateTag(CURRICULUM_CACHE_TAG) so edits appear without
// a redeploy. The fetch uses the service-role client because the cache scope cannot
// touch the cookie-bound auth'd client — and curriculum is global reference data,
// identical for every authenticated user (see @/lib/supabase/admin).

/** Cache tag the import endpoint invalidates after a successful sync. */
export const CURRICULUM_CACHE_TAG = 'curriculum';

/** Strip the leading ". " stem some LO fields carry (legacy curriculum.json artefact). */
export function cleanLO(raw: string): string {
  if (!raw) return '';
  return raw.replace(/^(\.\s*)+/, '').trim();
}

// ── DB fetch (cached) ───────────────────────────────────────────────────────────

const COLUMNS =
  'subject_code, year, month, week, period, lesson_key, daily_outcome, focus_area, ' +
  'linguistic_skill, theme, resources, taxonomy_id, monthly_knowledge_lo, ' +
  'monthly_skills_lo, weekly_knowledge_lo, weekly_skills_lo, grammar_vocabulary, monthly_lo';

// This read is load-bearing: it pulls the whole active curriculum (~6k full-text rows)
// once and is sliced in memory for four hot consumers (curriculum browse, teacher
// home / weekly-overview, the create-lesson picker, the editor load-plan) — so it stays
// cached. The `revalidate: 120` TTL is what makes an upload actually appear without a
// redeploy: on-demand `revalidateTag` of this LEGACY `unstable_cache` entry is
// unreliable in Next 16 (unstable_cache is superseded by `use cache`), so we self-heal
// via stale-while-revalidate — a normal request ≥120s after a sync re-reads the DB. The
// `revalidateTag('curriculum')` call on sync success is kept as a harmless best-effort
// fast path (free instant refresh if a future Next makes it reliable), but nothing
// depends on it. DO NOT remove the TTL — without it the entry caches indefinitely and
// only a redeploy refreshes it.
const fetchActiveRows = unstable_cache(
  async (): Promise<CurriculumLessonRow[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('curriculum_lesson')
      .select(COLUMNS)
      .eq('is_active', true);
    if (error) throw new Error(`Curriculum read failed: ${error.message}`);
    return (data ?? []) as unknown as CurriculumLessonRow[];
  },
  ['curriculum-active-rows'],
  { tags: [CURRICULUM_CACHE_TAG], revalidate: 120 },
);

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

/** Every active lesson, mapped to the legacy shape. Backed by the cached fetch. */
async function allLessons(): Promise<CurriculumLesson[]> {
  const rows = await fetchActiveRows();
  return rows.map(rowToLesson);
}

// ── Public API (preserved surface; now async) ────────────────────────────────────

/**
 * Resolve a stored `lesson_plans.curriculum_lesson_id` to its lesson(s).
 *
 * Resolution order: exact `lesson_key` (the value new pickers write) first, then a
 * best-effort match on legacy `taxonomy_id`. A taxonomy id can match multiple year
 * rows, so that path may return an array (matching the old exam-slot behaviour).
 * Returns null when nothing matches.
 */
export async function getLessonById(
  id: string,
): Promise<CurriculumLesson | CurriculumLesson[] | null> {
  if (!id) return null;
  const rows = await fetchActiveRows();

  const keyHit = rows.find((r) => r.lesson_key === id);
  if (keyHit) return rowToLesson(keyHit);

  const taxonomyHits = rows.filter((r) => r.taxonomy_id === id);
  if (taxonomyHits.length === 0) return null;
  if (taxonomyHits.length === 1) return rowToLesson(taxonomyHits[0]);
  return taxonomyHits.map(rowToLesson);
}

/**
 * The curriculum lesson immediately preceding a given slot, within the same
 * (subject, year). Lessons are ordered by (week, period): weeks are numbered
 * globally across the school year (monotonically increasing across months — the
 * month is only a label), so this is a clean total order with no duplicate slots.
 * Month/week boundaries fall out of the ordering automatically. Returns null when
 * the slot is the first lesson of its year (no in-year predecessor) or unknown.
 */
export async function getPreviousLesson(
  subject: string,
  year: number | string,
  week: number,
  period: number,
): Promise<CurriculumLesson | null> {
  const yn = resolveYearNum(year);
  if (yn === null) return null;
  const lessons = (await allLessons())
    .filter(
      (l) =>
        l.subject === subject &&
        l.yearNum === yn &&
        l.week !== null &&
        l.periodNum !== null,
    )
    .sort(byWeekThenPeriod);
  const idx = lessons.findIndex((l) => l.week === week && l.periodNum === period);
  if (idx <= 0) return null;
  return lessons[idx - 1];
}

/** Every lesson for a year+week, sorted by period. */
export async function getLessonsByWeek(
  year: number | string,
  week: number,
): Promise<CurriculumLesson[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = await allLessons();
  return lessons.filter((l) => l.yearNum === yn && l.week === week).sort(byPeriod);
}

/** Sorted week numbers that have at least one lesson in the year. */
export async function getAllWeeks(year: number | string): Promise<number[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = await allLessons();
  const weeks = new Set<number>();
  for (const l of lessons) {
    if (l.yearNum === yn && l.week !== null) weeks.add(l.week);
  }
  return [...weeks].sort((a, b) => a - b);
}

/** Every lesson for a year, sorted by week then period. */
export async function getLessonsByYear(year: number | string): Promise<CurriculumLesson[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = await allLessons();
  return lessons.filter((l) => l.yearNum === yn).sort(byWeekThenPeriod);
}

/** Alias for getAllWeeks. */
export function getWeeksForYear(year: number | string): Promise<number[]> {
  return getAllWeeks(year);
}

/** Alias for getLessonsByWeek. */
export function getLessonsForWeek(year: number | string, week: number): Promise<CurriculumLesson[]> {
  return getLessonsByWeek(year, week);
}

/** Months (in calendar order) with their week numbers for the year. */
export async function getMonthsWithWeeks(
  year: number | string,
): Promise<{ month: string; weeks: number[] }[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = (await allLessons()).filter((l) => l.yearNum === yn).sort(byWeekThenPeriod);

  const order: string[] = [];
  const monthWeeks = new Map<string, Set<number>>();
  for (const l of lessons) {
    if (!l.month || l.week === null) continue;
    if (!monthWeeks.has(l.month)) {
      monthWeeks.set(l.month, new Set());
      order.push(l.month);
    }
    monthWeeks.get(l.month)!.add(l.week);
  }
  return order.map((month) => ({
    month,
    weeks: [...monthWeeks.get(month)!].sort((a, b) => a - b),
  }));
}

/** Unique themes for a year with lesson counts, sorted by count desc. */
export async function getThemesForYear(
  year: number | string,
): Promise<{ theme: string; count: number }[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = (await allLessons()).filter((l) => l.yearNum === yn);
  const counts = new Map<string, number>();
  for (const l of lessons) {
    if (!l.theme) continue;
    counts.set(l.theme, (counts.get(l.theme) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);
}

/** All lessons for a year+theme. */
export async function getLessonsByTheme(
  year: number | string,
  theme: string,
): Promise<CurriculumLesson[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = await allLessons();
  return lessons.filter((l) => l.yearNum === yn && l.theme === theme).sort(byWeekThenPeriod);
}

/** Linguistic-skill breakdown for a year. */
export async function getSkillBreakdown(
  year: number | string,
): Promise<{ skill: string; skillKey: string; count: number; pct: number }[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = (await allLessons()).filter(
    (l) => l.yearNum === yn && l.linguisticSkill && l.linguisticSkill.length > 1,
  );
  const total = lessons.length || 1;
  const counts = new Map<string, number>();
  for (const l of lessons) {
    counts.set(l.linguisticSkill, (counts.get(l.linguisticSkill) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([skill, count]) => ({
      skill,
      skillKey: skillToKey(skill),
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Skill LOs (skillLORef → text) for a year, with lesson counts, sorted by ref. */
export async function getSkillLOs(
  year: number | string,
): Promise<{ ref: string; lo: string; skill: string; count: number }[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = (await allLessons()).filter((l) => l.yearNum === yn);
  const map = new Map<string, { lo: string; skill: string; count: number }>();
  for (const l of lessons) {
    if (!l.skillLORef) continue;
    if (!map.has(l.skillLORef)) {
      map.set(l.skillLORef, { lo: cleanLO(l.skillLO), skill: l.linguisticSkill, count: 0 });
    }
    map.get(l.skillLORef)!.count++;
  }
  return [...map.entries()]
    .map(([ref, v]) => ({ ref, ...v }))
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
}

/** Knowledge LOs under a skillLORef for a year, with counts and week lists. */
export async function getKnowledgeLOsForSkill(
  year: number | string,
  skillRef: string,
): Promise<{ ref: string; lo: string; count: number; weeks: number[] }[]> {
  const yn = resolveYearNum(year);
  if (yn === null) return [];
  const lessons = (await allLessons()).filter((l) => l.yearNum === yn && l.skillLORef === skillRef);
  const map = new Map<string, { lo: string; weeks: Set<number>; count: number }>();
  for (const l of lessons) {
    if (!l.knowledgeLORef) continue;
    if (!map.has(l.knowledgeLORef)) {
      map.set(l.knowledgeLORef, { lo: cleanLO(l.knowledgeLO), weeks: new Set(), count: 0 });
    }
    const entry = map.get(l.knowledgeLORef)!;
    entry.count++;
    if (l.week !== null) entry.weeks.add(l.week);
  }
  return [...map.entries()]
    .map(([ref, v]) => ({ ref, lo: v.lo, count: v.count, weeks: [...v.weeks].sort((a, b) => a - b) }))
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
}

// ── "+ Lesson" curriculum picker (filtered by subject_code) ─────────────────────
//
// The picker navigates curriculum content by (subject_code, year, month, week) and
// needs the raw `lesson_key` (the value written into a new plan's
// `curriculum_lesson_id`), which the legacy `CurriculumLesson` shape doesn't carry.
// These read straight off the cached raw rows.

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
  const rows = await fetchActiveRows();
  const byMonth = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.subject_code !== subjectCode || r.year !== year) continue;
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
  const rows = await fetchActiveRows();
  return rows
    .filter(
      (r) =>
        r.subject_code === subjectCode &&
        r.year === year &&
        r.month === month &&
        r.week === week,
    )
    .sort((a, b) => a.period - b.period)
    .map((r) => ({
      period: r.period,
      lessonKey: r.lesson_key,
      dailyOutcome: cleanLO(r.daily_outcome ?? ''),
      focusArea: r.focus_area ?? r.linguistic_skill ?? '',
    }));
}

/** The distinct subject codes that have at least one active curriculum row. */
export async function getCurriculumSubjectCodes(): Promise<string[]> {
  const rows = await fetchActiveRows();
  return [...new Set(rows.map((r) => r.subject_code))].sort();
}

/**
 * The full active rows for one (subject_code, year, month, week), sorted by
 * period. Unlike `getCurriculumWeekCells` (the picker's lean cell shape), this
 * returns the complete `CurriculumLessonRow` so callers can read the weekly /
 * monthly outcome fields and structured resources. Backed by the same cached read.
 */
export async function getCurriculumWeekRows(
  subjectCode: string,
  year: number,
  month: string,
  week: number,
): Promise<CurriculumLessonRow[]> {
  const rows = await fetchActiveRows();
  return rows
    .filter(
      (r) =>
        r.subject_code === subjectCode &&
        r.year === year &&
        r.month === month &&
        r.week === week,
    )
    .sort((a, b) => (a.period ?? 0) - (b.period ?? 0));
}

/**
 * The full active rows for one (subject_code, year, month) — every week and
 * period in the month — sorted by (week, period). Backs the monthly calendar
 * grid (Task 6). Same cached read as the week/nav helpers.
 */
export async function getCurriculumMonthRows(
  subjectCode: string,
  year: number,
  month: string,
): Promise<CurriculumLessonRow[]> {
  const rows = await fetchActiveRows();
  return rows
    .filter(
      (r) => r.subject_code === subjectCode && r.year === year && r.month === month,
    )
    .sort((a, b) => (a.week - b.week) || ((a.period ?? 0) - (b.period ?? 0)));
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
 * plan's subject/year server-side rather than trusting client input. Returns null
 * when the key matches no active row.
 */
export async function getCurriculumKeyCoords(
  lessonKey: string,
): Promise<CurriculumKeyCoords | null> {
  if (!lessonKey) return null;
  const rows = await fetchActiveRows();
  const row = rows.find((r) => r.lesson_key === lessonKey);
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

function skillToKey(skill: string): string {
  const s = skill.toLowerCase();
  if (s.includes('read')) return 'read';
  if (s.includes('writ')) return 'write';
  if (s.includes('listen')) return 'listen';
  if (s.includes('speak')) return 'speak';
  return 'basic';
}
