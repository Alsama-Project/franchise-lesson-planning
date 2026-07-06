import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import {
  classifyCurriculumRow,
  tallyGapCounts,
  taxonomySegments,
  type CurriculumGapsReport,
  type GapRow,
  type GapYearFacet,
} from './gaps';
import type { CurriculumResource } from './types';

// ── Curriculum Gaps report loader (per subject, admin-only) ───────────────────────
//
// Wires the reconcile page to REAL sources (Phase 0):
//   • placed / placeholder / unmapped / missing / duplicate — classified LIVE from the
//     subject's active `curriculum_lesson` rows via the shared `classifyCurriculumRow`
//     (which reuses `parseTaxonomyId` + the gate's S0/K0 rule — no forked classifier).
//   • guard — sourced from the LAST SUCCESSFUL sync run's
//     `curriculum_sync_run.warnings.skippedReferencedKeys` (the only place the importer
//     records "left active because a live plan references it"). Not fabricated.
//   • srow / filename — from the provenance columns migration 0054 added
//     (`curriculum_lesson.source_row`, `curriculum_sync_run.source_filename`); null on
//     rows/runs predating it (the page degrades gracefully until re-import).
//
// A lesson_key COLLISION (the other half of "duplicate") cannot occur in live rows —
// `lesson_key` is UNIQUE and the importer records no collision report — so the live
// duplicate bucket only ever holds malformed codes. Documented on the page, never faked.

interface CurriculumLessonSelect {
  id: string;
  source_row: number | null;
  lesson_key: string;
  year: number;
  month: string;
  week: number;
  period: number | null;
  taxonomy_id: string | null;
  daily_outcome: string | null;
  linguistic_skill: string | null;
  grammar_vocabulary: string | null;
  theme: string | null;
  resources: CurriculumResource[] | null;
}

interface SyncRunSelect {
  status: string;
  source: string | null;
  source_filename: string | null;
  started_at: string | null;
  finished_at: string | null;
  warnings: unknown;
}

/** Pull `skippedReferencedKeys` out of a run's `warnings` jsonb, tolerating any shape. */
function guardKeysFromWarnings(warnings: unknown): string[] {
  if (!warnings || typeof warnings !== 'object') return [];
  const keys = (warnings as { skippedReferencedKeys?: unknown }).skippedReferencedKeys;
  return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
}

/**
 * Load the reconcile report for one subject (by subject code). Admin-only: returns
 * `null` when the caller is not a signed-in admin (the page then redirects) or the
 * subject code is unknown.
 */
export async function getCurriculumGapsReport(
  subjectCode: string,
): Promise<CurriculumGapsReport | null> {
  const code = subjectCode.trim();
  if (!code) return null;

  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') return null;

  const supabase = await createClient();

  const [{ data: subject }, { data: lessonData }, { data: runData }] = await Promise.all([
    supabase.from('subjects').select('id, name, code').eq('code', code).maybeSingle(),
    supabase
      .from('curriculum_lesson_active')
      .select(
        'id, source_row, lesson_key, year, month, week, period, taxonomy_id, daily_outcome, linguistic_skill, grammar_vocabulary, theme, resources',
      )
      .eq('subject_code', code)
      .eq('is_active', true)
      .order('year', { ascending: true })
      .order('week', { ascending: true })
      .order('period', { ascending: true, nullsFirst: true }),
    supabase
      .from('curriculum_sync_run')
      .select('status, source, source_filename, started_at, finished_at, warnings')
      .eq('subject_code', code)
      .order('started_at', { ascending: false })
      .limit(30),
  ]);

  const subjectRow = subject as { id: string; name: string; code: string } | null;
  if (!subjectRow) return null;

  const runs = (runData ?? []) as SyncRunSelect[];
  const latestRun = runs[0] ?? null;
  // Guard truth = the MOST RECENT SUCCESSFUL run's warnings (the last actual reconcile).
  const latestSuccess = runs.find((r) => r.status === 'success') ?? null;
  const guardKeys = new Set(guardKeysFromWarnings(latestSuccess?.warnings));

  const lessons = (lessonData ?? []) as CurriculumLessonSelect[];

  // Reference counts for guard rows only (cheap — usually a handful of keys).
  const referencedCounts = new Map<string, number>();
  if (guardKeys.size > 0) {
    const { data: refRows } = await supabase
      .from('lesson_plans')
      .select('curriculum_lesson_id')
      .in('curriculum_lesson_id', [...guardKeys]);
    for (const r of (refRows ?? []) as Array<{ curriculum_lesson_id: string | null }>) {
      const key = r.curriculum_lesson_id;
      if (key) referencedCounts.set(key, (referencedCounts.get(key) ?? 0) + 1);
    }
  }

  const rows: GapRow[] = lessons.map((l) => {
    const status = classifyCurriculumRow(
      { taxonomyId: l.taxonomy_id, dailyOutcome: l.daily_outcome, lessonKey: l.lesson_key },
      guardKeys,
    );
    const seg = taxonomySegments(l.taxonomy_id);
    return {
      id: l.id,
      sourceRow: l.source_row,
      lessonKey: l.lesson_key,
      year: l.year,
      month: l.month,
      week: l.week,
      period: l.period,
      taxonomyId: l.taxonomy_id,
      dailyOutcome: l.daily_outcome,
      skill: l.linguistic_skill,
      grammarVocabulary: l.grammar_vocabulary,
      theme: l.theme,
      resources: Array.isArray(l.resources) ? l.resources : [],
      status,
      focusArea: seg.focusArea,
      skillLo: seg.skillLo,
      knowledgeLo: seg.knowledgeLo,
      hour: seg.hour,
      referencedByPlans: status === 'guard' ? referencedCounts.get(l.lesson_key) ?? 0 : 0,
    };
  });

  const counts = tallyGapCounts(rows);

  const yearMap = new Map<number, number>();
  for (const r of rows) yearMap.set(r.year, (yearMap.get(r.year) ?? 0) + 1);
  const years: GapYearFacet[] = [...yearMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }));

  return {
    subjectId: subjectRow.id,
    subjectCode: subjectRow.code,
    subjectName: subjectRow.name,
    sourceFilename: latestRun?.source_filename ?? null,
    source: latestRun?.source ?? null,
    lastSyncedAt: latestRun?.finished_at ?? latestRun?.started_at ?? null,
    hasSourceRows: rows.some((r) => r.sourceRow != null),
    rows,
    counts,
    years,
  };
}
