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
// from the spiral (in the SQL, migration 0050).
//
// SCOPING & THE 1000-ROW CAP.
//   * `getCompositionTree(subject, year)` is scoped to ONE (subject, year) — at most a
//     few hundred rows (English peaks ~200/year) — so a plain scoped select is safe
//     (identical to curriculumUtils' scoped reads).
//   * `getInsightsAggregates(subject)` spans a WHOLE subject (English ~1190 rows > the
//     PostgREST 1000 cap), so it NEVER slices a bulk read: it calls the aggregate RPCs
//     from 0050, which GROUP BY in the DB and return small result sets.
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
  /** The calendar-keyed lesson_key — the tree is taxonomy-organised but plans are
   *  calendar-keyed, so "Plan this lesson" hands this to the existing create flow. */
  lessonKey: string;
  /** The curriculum row's linguistic_skill / focus_area text for the hour's pill. */
  strandLabel: string | null;
}

/** One (Skill-LO . Knowledge-LO) monthly-outcome group — the tree's mid tier. */
export interface CompositionGroup {
  skillLo: string | null; // 'S1'
  knowledgeLo: string | null; // 'K1'
  key: string; // 'S1.K1'
  focusArea: number | null; // representative Focus Area (segment 1)
  // Strand cards read the WEEKLY skill/knowledge text where present (english, it);
  // both null (professionalism) → the node renders with no strand cards.
  skillOutcome: string | null; // representative weekly_skills_lo
  knowledgeOutcome: string | null; // representative weekly_knowledge_lo
  hours: CompositionHour[]; // ordered by (week, period, hour)
  weeks: number[]; // distinct calendar weeks this group touches (the scatter)
}

/** One year of a subject — the Yearly node. */
export interface CompositionYear {
  year: number;
  yearlyOutcome: string | null; // annual_learning_outcome (0049)
  groups: CompositionGroup[];
}

/** The full tree for a subject (one year when `year` is passed). */
export interface CompositionTree {
  subject: string;
  subjectOutcome: string | null; // subject_learning_outcome (0049)
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
  'year, month, week, period, lesson_key, daily_outcome, resources, taxonomy_id, ' +
  'linguistic_skill, focus_area, weekly_skills_lo, weekly_knowledge_lo, ' +
  'monthly_skills_lo, monthly_knowledge_lo, subject_learning_outcome, annual_learning_outcome';

interface TreeRow {
  year: number;
  month: string;
  week: number;
  period: number | null;
  lesson_key: string;
  daily_outcome: string | null;
  resources: CurriculumResource[] | null;
  taxonomy_id: string | null;
  linguistic_skill: string | null;
  focus_area: string | null;
  weekly_skills_lo: string | null;
  weekly_knowledge_lo: string | null;
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
    // Hours are ordered by H# (taxonomy segment 4) — the COMPOSITION order — never
    // re-sorted into calendar order, because the composing slots are deliberately
    // non-contiguous. A null H# sinks to the end; equal H# breaks by calendar slot.
    const orderedRows = [...bucket.rows].sort((a, b) => {
      const ha = parseTaxonomyId(a.taxonomy_id).hour;
      const hb = parseTaxonomyId(b.taxonomy_id).hour;
      if (ha !== hb) return (ha ?? Number.MAX_SAFE_INTEGER) - (hb ?? Number.MAX_SAFE_INTEGER);
      return slotRank(a) - slotRank(b);
    });
    const hours: CompositionHour[] = orderedRows.map((r) => {
      const p = parseTaxonomyId(r.taxonomy_id);
      return {
        hour: p.hour,
        dailyOutcome: cleanLO(r.daily_outcome ?? '') || null,
        calendarSlot: { year: r.year, month: r.month, week: r.week, period: r.period },
        resources: cleanResources(r.resources),
        taxonomyId: r.taxonomy_id,
        lessonKey: r.lesson_key,
        strandLabel: (r.linguistic_skill ?? r.focus_area ?? '').trim() || null,
      };
    });
    return {
      skillLo: bucket.parsed.skillLo,
      knowledgeLo: bucket.parsed.knowledgeLo,
      key,
      focusArea: firstNonNull(orderedRows.map((r) => parseTaxonomyId(r.taxonomy_id).focusArea)),
      skillOutcome: firstClean(orderedRows.map((r) => r.weekly_skills_lo)) ?? null,
      knowledgeOutcome: firstClean(orderedRows.map((r) => r.weekly_knowledge_lo)) ?? null,
      hours,
      weeks: [...new Set(orderedRows.map((r) => r.week))].sort((a, b) => a - b),
    };
  });

  // Order the GROUPS by their earliest calendar appearance (scheme-of-work reading
  // order) — this orders the list of groups, not the hours inside a group.
  groups.sort((a, b) => firstGroupRank(a) - firstGroupRank(b));

  const years: CompositionYear[] =
    groups.length > 0 ? [{ year, yearlyOutcome, groups }] : [];

  return { subject, subjectOutcome, years };
}

/** Earliest calendar slot across a group's hours — orders the group list only. */
function firstGroupRank(g: CompositionGroup): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const h of g.hours) {
    const r = slotRank({ month: h.calendarSlot.month, week: h.calendarSlot.week, period: h.calendarSlot.period });
    if (r < best) best = r;
  }
  return best;
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
 * artefacts are already discounted (0050). v1 has NO depth proxy: no source column
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
 * one year). All computation is DB-side (0050 RPCs) so nothing is truncated by the
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

// ── Per-subject data capabilities (gate the tabs) ───────────────────────────────────
//
// The three curriculum surfaces each depend on DIFFERENT data that is present for a
// DIFFERENT subset of subjects (verified against live rows), so each capability is
// probed independently — never assume one implies another:
//   * taxonomy COVERAGE → the Logic-tree spine. Gated on a threshold, not mere
//     presence: a subject with only a thin sliver of taxonomy (IT ~22%) would build a
//     misleadingly sparse tree, so it stays disabled. `total`/`wellFormed` also drive
//     the disclosure banner (rows not mapped to the taxonomy are shown, not dropped).
//   * hasFocusAreaText  → the Topics focus-area tier (everyone EXCEPT english).
//   * hasWeeklyText     → the Logic-tree strand cards (english, it).
// Probed with head-only COUNT queries / a two-number RPC (no bulk rows), so the
// PostgREST 1000-row cap never applies.

/**
 * The minimum fraction of a subject's rows that must carry a well-formed taxonomy id
 * for the Logic tree to render. Below this the tree would be more gap than spine, so
 * the tab is disabled-with-reason instead. (IT ~0.22 is caught; english ~0.73 and
 * professionalism ~0.97 pass.)
 */
export const TAXONOMY_COVERAGE_MIN = 0.5;

export interface SubjectCapabilities {
  subject: string;
  /** Active rows for the subject. */
  totalRows: number;
  /** Rows whose taxonomy_id matches ^[0-9]+\.S[0-9]+\.K[0-9]+\.H[0-9]+$. */
  wellFormedRows: number;
  /** wellFormedRows / totalRows, or 0 when the subject has no rows. */
  taxonomyCoverage: number;
  /** True when coverage ≥ TAXONOMY_COVERAGE_MIN — the Logic-tree gate. */
  logicTreeEnabled: boolean;
  hasFocusAreaText: boolean;
  hasWeeklyText: boolean;
}

export async function getCurriculumSubjectCapabilities(
  subject: string,
): Promise<SubjectCapabilities> {
  const supabase = createAdminClient();

  // Each probe FAILS SAFE to "unavailable": a capability query gates an optional
  // surface, and some read objects (the coverage RPC, the `curriculum_taxonomy` view)
  // that an operator applies by hand. If one isn't present yet — or any probe errors —
  // we degrade to zero (the tab shows disabled) rather than 500 the whole Explorer,
  // including the existing Calendar tab.
  const countOf = async (build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count, error } = await build();
      return error ? 0 : (count ?? 0);
    } catch {
      return 0;
    }
  };

  const coverageOf = async (): Promise<{ total: number; wellFormed: number }> => {
    try {
      const { data, error } = await supabase.rpc('curriculum_taxonomy_coverage', {
        p_subject: subject,
      });
      if (error) return { total: 0, wellFormed: 0 };
      const row = (data ?? [])[0] as { total: number; well_formed: number } | undefined;
      return { total: Number(row?.total ?? 0), wellFormed: Number(row?.well_formed ?? 0) };
    } catch {
      return { total: 0, wellFormed: 0 };
    }
  };

  const [coverage, fa, wk] = await Promise.all([
    coverageOf(),
    countOf(() =>
      supabase
        .from('curriculum_lesson')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('subject_code', subject)
        .not('focus_area', 'is', null),
    ),
    countOf(() =>
      supabase
        .from('curriculum_lesson')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('subject_code', subject)
        .or('weekly_skills_lo.not.is.null,weekly_knowledge_lo.not.is.null'),
    ),
  ]);

  const taxonomyCoverage = coverage.total > 0 ? coverage.wellFormed / coverage.total : 0;
  return {
    subject,
    totalRows: coverage.total,
    wellFormedRows: coverage.wellFormed,
    taxonomyCoverage,
    logicTreeEnabled: taxonomyCoverage >= TAXONOMY_COVERAGE_MIN,
    hasFocusAreaText: fa > 0,
    hasWeeklyText: wk > 0,
  };
}

// ── Topics data (Focus area → Topic → spiral across years) ──────────────────────────
//
// Sourced from `focus_area` TEXT where present (all subjects EXCEPT english); for
// ENGLISH `focus_area` is null and no Focus-Area number→name map exists, so we GROUP BY
// theme instead and flag it (`groupedBy: 'theme'`). The heavy grouping runs DB-side
// (curriculum_topic_threads, migration 0051) so a whole-subject read never trips the
// 1000-row cap. The spiral is presence/recurrence ONLY — there is no depth signal in
// the source, so no deepening gradient is derived.

export interface TopicThreadYear {
  year: number;
  hours: number;
  lessonKey: string;
  dailyOutcome: string | null;
  strandLabel: string | null;
  resources: CurriculumResource[];
}

export interface Topic {
  topic: string; // theme label
  years: TopicThreadYear[]; // ascending; the years this topic is TAUGHT
}

export interface FocusAreaGroup {
  focusArea: string | null; // null only in theme-grouped (english) mode
  topics: Topic[];
}

export interface TopicsData {
  subject: string;
  groupedBy: 'focusArea' | 'theme';
  years: number[]; // every year present for the subject (spiral columns)
  focusAreas: FocusAreaGroup[];
}

interface TopicThreadRow {
  focus_area: string | null;
  theme: string | null;
  year: number;
  hours: number;
  lesson_key: string;
  daily_outcome: string | null;
  strand_label: string | null;
  resources: CurriculumResource[] | null;
}

export async function getTopicsData(subject: string): Promise<TopicsData> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('curriculum_topic_threads', { p_subject: subject });
  if (error) throw new Error(`Topics read failed: ${error.message}`);
  const rows = (data ?? []) as TopicThreadRow[];

  const hasFocusArea = rows.some((r) => (r.focus_area ?? '').trim() !== '');
  const groupedBy: 'focusArea' | 'theme' = hasFocusArea ? 'focusArea' : 'theme';

  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);

  // Bucket: Focus Area → Topic(theme) → per-year thread. In theme mode every row's
  // focus area is null, so all topics fall under a single null-keyed group.
  const faMap = new Map<string, Map<string, TopicThreadYear[]>>();
  for (const r of rows) {
    const faKey = hasFocusArea ? (r.focus_area ?? '').trim() : '';
    const topicKeyLabel = (r.theme ?? r.focus_area ?? '').trim();
    if (!topicKeyLabel) continue;
    if (!faMap.has(faKey)) faMap.set(faKey, new Map());
    const topics = faMap.get(faKey)!;
    if (!topics.has(topicKeyLabel)) topics.set(topicKeyLabel, []);
    topics.get(topicKeyLabel)!.push({
      year: r.year,
      hours: Number(r.hours),
      lessonKey: r.lesson_key,
      dailyOutcome: cleanLO(r.daily_outcome ?? '') || null,
      strandLabel: (r.strand_label ?? '').trim() || null,
      resources: cleanResources(r.resources),
    });
  }

  const focusAreas: FocusAreaGroup[] = [...faMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([faKey, topics]) => ({
      focusArea: faKey === '' ? null : faKey,
      topics: [...topics.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([topic, threadYears]) => ({
          topic,
          years: threadYears.sort((a, b) => a.year - b.year),
        })),
    }));

  return { subject, groupedBy, years, focusAreas };
}
