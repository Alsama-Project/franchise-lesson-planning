import 'server-only';

// ── Shared curriculum data-access layer ─────────────────────────────────────────────
//
// The single module both new read-only curriculum surfaces import: the Logic-tree
// Explorer (`getCompositionTree`) and the coordinator Insights page
// (`getInsightsAggregates`). It is the ONLY place that turns `curriculum_lesson` +
// `taxonomy_id` into the composition/insight shapes, so the corrected taxonomy mapping
// (segment 1 = Focus Area, NOT the year — see ./taxonomy) is applied in exactly one
// place.
//
// SUBJECT-AGNOSTIC & NULL-TOLERANT by design. Nothing here is English-specific: a
// subject with no `taxonomy_id`, no monthly S/K text, or no outcome columns yields an
// empty-but-valid tree / empty aggregates rather than throwing, so per-subject
// verification VALIDATES this layer rather than reshapes it. Placeholder rows
// ("E.*"/"L.*") are excluded from the tree; the flat `*.S0.K0.*` artefact is discounted
// from the spiral (in the SQL, migration 0049).
//
// SCOPING & THE 1000-ROW CAP.
//   * `getCompositionTree(subject, year)` is scoped to ONE (subject, year) — at most a
//     few hundred rows (English peaks ~200/year) — so a plain scoped select is safe
//     (identical to curriculumUtils' scoped reads).
//   * `getInsightsAggregates(subject)` spans a WHOLE subject (English ~1190 rows > the
//     PostgREST 1000 cap), so it NEVER slices a bulk read: it calls the aggregate RPCs
//     from 0049, which GROUP BY in the DB and return small result sets.
//
// Reads use the service-role client because curriculum is global reference data,
// identical for every authenticated user (see @/lib/supabase/admin), matching
// curriculumUtils.

import { createAdminClient } from '@/lib/supabase/admin';
import { cleanLO } from '@/lib/curriculumUtils';
import { parseTaxonomyId, isTaxonomyLeaf, skillKnowledgeKey } from '@/lib/curriculum/taxonomy';
import type { CurriculumResource } from '@/lib/curriculum/types';

// ── Tree shapes (Subject → Yearly → S.K group → ordered hours) ──────────────────────

/** Where a single curriculum hour sits on the calendar. `period` is null for weekly-grain rows. */
export interface CalendarSlot {
  year: number;
  month: string;
  week: number;
  period: number | null;
}

/** One taught hour within an S.K composition group. */
export interface CompositionHour {
  hour: number | null; // taxonomy segment 4
  dailyOutcome: string | null;
  calendarSlot: CalendarSlot;
  resources: CurriculumResource[];
  taxonomyId: string | null;
}

/** One (Skill-LO . Knowledge-LO) monthly-outcome group — the tree's mid tier. */
export interface CompositionGroup {
  skillLo: string | null; // 'S1'
  knowledgeLo: string | null; // 'K1'
  key: string; // 'S1.K1'
  focusArea: number | null; // representative Focus Area (segment 1)
  monthlySkillOutcome: string | null; // monthly_skills_lo where present
  monthlyKnowledgeOutcome: string | null; // monthly_knowledge_lo where present
  hours: CompositionHour[]; // ordered by (week, period, hour)
  weeks: number[]; // distinct calendar weeks this group touches (the scatter)
}

/** One year of a subject — the Yearly node. */
export interface CompositionYear {
  year: number;
  yearlyOutcome: string | null; // annual_learning_outcome (0048)
  groups: CompositionGroup[];
}

/** The full tree for a subject (one year when `year` is passed). */
export interface CompositionTree {
  subject: string;
  subjectOutcome: string | null; // subject_learning_outcome (0048)
  years: CompositionYear[];
}

/** Calendar-month order so a group's hours read in scheme-of-work sequence. */
const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function monthIndex(month: string): number {
  const i = MONTH_ORDER.indexOf(month);
  return i === -1 ? MONTH_ORDER.length : i;
}

/** A resource label carrying no real resource (blank / em-dash / "n/a"). */
function isNoResource(label: string): boolean {
  const s = label.trim().toLowerCase();
  return s === '' || s === '—' || s === 'n/a';
}

function cleanResources(resources: CurriculumResource[] | null): CurriculumResource[] {
  return (resources ?? [])
    .filter((r) => r.label && !isNoResource(r.label))
    .map((r) => ({ label: r.label.trim(), url: r.url }));
}

/** The columns the tree needs from a scoped (subject, year) read. */
const TREE_COLUMNS =
  'year, month, week, period, daily_outcome, resources, taxonomy_id, ' +
  'monthly_skills_lo, monthly_knowledge_lo, subject_learning_outcome, annual_learning_outcome';

interface TreeRow {
  year: number;
  month: string;
  week: number;
  period: number | null;
  daily_outcome: string | null;
  resources: CurriculumResource[] | null;
  taxonomy_id: string | null;
  monthly_skills_lo: string | null;
  monthly_knowledge_lo: string | null;
  subject_learning_outcome: string | null;
  annual_learning_outcome: string | null;
}

/** Sort key over the calendar so hours/groups read in scheme-of-work order. */
function slotRank(r: { month: string; week: number; period: number | null }): number {
  // week is globally monotonic across the year; month only disambiguates equal weeks.
  return r.week * 1000 + monthIndex(r.month) * 10 + (r.period ?? 0);
}

/**
 * The composition tree for one (subject, year): Subject → Yearly → per (S.K) group →
 * ordered hours. Placeholder rows and rows with no numeric Focus Area are excluded.
 * Returns a valid tree with `years: []` when the subject/year has no taxonomy'd rows.
 */
export async function getCompositionTree(
  subject: string,
  year: number,
): Promise<CompositionTree> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('curriculum_lesson')
    .select(TREE_COLUMNS)
    .eq('is_active', true)
    .eq('subject_code', subject)
    .eq('year', year);
  if (error) throw new Error(`Composition tree read failed: ${error.message}`);
  const rows = (data ?? []) as unknown as TreeRow[];

  const subjectOutcome =
    firstClean(rows.map((r) => r.subject_learning_outcome)) ?? null;
  const yearlyOutcome =
    firstClean(rows.map((r) => r.annual_learning_outcome)) ?? null;

  // Bucket the year's leaf rows by their S.K group.
  const buckets = new Map<string, { rows: TreeRow[]; parsed: ReturnType<typeof parseTaxonomyId> }>();
  for (const row of rows) {
    const parsed = parseTaxonomyId(row.taxonomy_id);
    if (!isTaxonomyLeaf(parsed)) continue; // exclude placeholders / no-Focus-Area rows
    const key = skillKnowledgeKey(parsed);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { rows: [], parsed };
      buckets.set(key, bucket);
    }
    bucket.rows.push(row);
  }

  const groups: CompositionGroup[] = [...buckets.entries()].map(([key, bucket]) => {
    const orderedRows = [...bucket.rows].sort((a, b) => slotRank(a) - slotRank(b));
    const hours: CompositionHour[] = orderedRows.map((r) => {
      const p = parseTaxonomyId(r.taxonomy_id);
      return {
        hour: p.hour,
        dailyOutcome: cleanLO(r.daily_outcome ?? '') || null,
        calendarSlot: { year: r.year, month: r.month, week: r.week, period: r.period },
        resources: cleanResources(r.resources),
        taxonomyId: r.taxonomy_id,
      };
    });
    return {
      skillLo: bucket.parsed.skillLo,
      knowledgeLo: bucket.parsed.knowledgeLo,
      key,
      focusArea: firstNonNull(orderedRows.map((r) => parseTaxonomyId(r.taxonomy_id).focusArea)),
      monthlySkillOutcome: firstClean(orderedRows.map((r) => r.monthly_skills_lo)) ?? null,
      monthlyKnowledgeOutcome: firstClean(orderedRows.map((r) => r.monthly_knowledge_lo)) ?? null,
      hours,
      weeks: [...new Set(orderedRows.map((r) => r.week))].sort((a, b) => a - b),
    };
  });

  // Order groups by their earliest calendar slot (scheme-of-work order).
  groups.sort((a, b) => firstHourRank(a) - firstHourRank(b));

  const years: CompositionYear[] =
    groups.length > 0 ? [{ year, yearlyOutcome, groups }] : [];

  return { subject, subjectOutcome, years };
}

function firstHourRank(g: CompositionGroup): number {
  const first = g.hours[0];
  return first
    ? slotRank({ month: first.calendarSlot.month, week: first.calendarSlot.week, period: first.calendarSlot.period })
    : Number.MAX_SAFE_INTEGER;
}

function firstClean(values: (string | null)[]): string | null {
  for (const v of values) {
    const c = cleanLO(v ?? '');
    if (c) return c;
  }
  return null;
}

function firstNonNull<T>(values: (T | null)[]): T | null {
  for (const v of values) if (v !== null && v !== undefined) return v;
  return null;
}

// ── Insights aggregates (per subject; DB-side GROUP BY — never a sliced bulk read) ──

/** Hours taught in a (year, month). */
export interface HoursPerMonth {
  year: number;
  month: string;
  hours: number;
}

/** Hours per (Focus Area, S.K topic), within a year. */
export interface HoursByFocusTopic {
  year: number;
  focusArea: number | null;
  skillLo: string | null;
  knowledgeLo: string | null;
  topic: string; // 'S1.K1'
  hours: number;
}

/** One cell of the coverage matrix — hour count for a (Focus Area, topic, year). */
export interface CoverageCell {
  focusArea: number | null;
  skillLo: string | null;
  knowledgeLo: string | null;
  topic: string;
  year: number;
  hours: number;
}

/**
 * One spiral cell — an S.K topic's presence (hour count) in a year. Flat `S0.K0`
 * artefacts are already discounted (0049). v1 has NO depth proxy: no source column
 * expresses increasing complexity across years, so this is presence/recurrence only.
 */
export interface SpiralCell {
  skillLo: string | null;
  knowledgeLo: string | null;
  topic: string;
  year: number;
  hours: number;
  /** Reserved: a depth/complexity proxy if one is ever found. Always null in v1. */
  depthProxy: null;
}

export interface InsightsAggregates {
  subject: string;
  year: number | null; // the year filter applied to `hoursByFocusTopic`, if any
  hoursPerMonth: HoursPerMonth[]; // per year
  hoursByFocusTopic: HoursByFocusTopic[];
  coverageMatrix: CoverageCell[];
  spiral: SpiralCell[];
}

function topicKey(skillLo: string | null, knowledgeLo: string | null): string {
  return `${skillLo ?? 'S?'}.${knowledgeLo ?? 'K?'}`;
}

/**
 * The Insights aggregates for a subject (optionally narrowing `hoursByFocusTopic` to
 * one year). All computation is DB-side (0049 RPCs) so nothing is truncated by the
 * PostgREST 1000-row cap. Returns empty arrays for a subject with no taxonomy'd rows.
 */
export async function getInsightsAggregates(
  subject: string,
  opts: { year?: number } = {},
): Promise<InsightsAggregates> {
  const supabase = createAdminClient();
  const year = opts.year ?? null;

  const [hpm, hft, cov, spi] = await Promise.all([
    supabase.rpc('curriculum_hours_per_month', { p_subject: subject }),
    supabase.rpc('curriculum_hours_by_focus_topic', { p_subject: subject, p_year: year }),
    supabase.rpc('curriculum_coverage_matrix', { p_subject: subject }),
    supabase.rpc('curriculum_spiral', { p_subject: subject }),
  ]);
  for (const r of [hpm, hft, cov, spi]) {
    if (r.error) throw new Error(`Insights aggregate failed: ${r.error.message}`);
  }

  const hoursPerMonth = ((hpm.data ?? []) as Array<{ year: number; month: string; hours: number }>)
    .map((r) => ({ year: r.year, month: r.month, hours: Number(r.hours) }))
    .sort((a, b) => a.year - b.year || monthIndex(a.month) - monthIndex(b.month));

  const hoursByFocusTopic = (
    (hft.data ?? []) as Array<{
      year: number; focus_area: number | null; skill_lo: string | null; knowledge_lo: string | null; hours: number;
    }>
  )
    .map((r) => ({
      year: r.year,
      focusArea: r.focus_area,
      skillLo: r.skill_lo,
      knowledgeLo: r.knowledge_lo,
      topic: topicKey(r.skill_lo, r.knowledge_lo),
      hours: Number(r.hours),
    }))
    .sort((a, b) => a.year - b.year || (a.focusArea ?? 0) - (b.focusArea ?? 0) || a.topic.localeCompare(b.topic));

  const coverageMatrix = (
    (cov.data ?? []) as Array<{
      focus_area: number | null; skill_lo: string | null; knowledge_lo: string | null; year: number; hours: number;
    }>
  )
    .map((r) => ({
      focusArea: r.focus_area,
      skillLo: r.skill_lo,
      knowledgeLo: r.knowledge_lo,
      topic: topicKey(r.skill_lo, r.knowledge_lo),
      year: r.year,
      hours: Number(r.hours),
    }))
    .sort((a, b) => (a.focusArea ?? 0) - (b.focusArea ?? 0) || a.topic.localeCompare(b.topic) || a.year - b.year);

  const spiral = (
    (spi.data ?? []) as Array<{
      skill_lo: string | null; knowledge_lo: string | null; year: number; hours: number;
    }>
  )
    .map((r) => ({
      skillLo: r.skill_lo,
      knowledgeLo: r.knowledge_lo,
      topic: topicKey(r.skill_lo, r.knowledge_lo),
      year: r.year,
      hours: Number(r.hours),
      depthProxy: null as null,
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic) || a.year - b.year);

  return { subject, year, hoursPerMonth, hoursByFocusTopic, coverageMatrix, spiral };
}
