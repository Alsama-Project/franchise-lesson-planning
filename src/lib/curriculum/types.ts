// Types for the Supabase-backed curriculum layer.
//
// The legacy presentational shape (`CurriculumLesson` in src/types/curriculum.ts)
// is preserved for consumers; these types describe the new persistence layer:
// the `curriculum_lesson` row, the parser's output, and a sync-run summary.

/** A resource reference. Page refs (e.g. "Jumpstart p6") are label-only. */
export interface CurriculumResource {
  label: string;
  url?: string;
}

/**
 * A row of `curriculum_lesson` as *read* by the app (curriculumUtils → the picker,
 * editor, weekly overview). Daily-grain subjects (English et al.) always have a
 * numeric `period`; weekly-grain subjects (Awareness) read back null — the current
 * picker only navigates the daily subjects, so `period` is typed numeric for them.
 * `grammar_vocabulary` / `monthly_lo` are the columns added by the import migration.
 */
export interface CurriculumLessonRow {
  subject_code: string;
  year: number;
  month: string;
  week: number;
  period: number;
  lesson_key: string;
  daily_outcome: string | null;
  focus_area: string | null;
  linguistic_skill: string | null;
  theme: string | null;
  resources: CurriculumResource[];
  taxonomy_id: string | null;
  monthly_knowledge_lo: string | null;
  monthly_skills_lo: string | null;
  weekly_knowledge_lo: string | null;
  weekly_skills_lo: string | null;
  grammar_vocabulary: string | null;
  monthly_lo: string | null;
}

/**
 * The parser's output for one workbook row — the shape *written* to
 * `curriculum_lesson`. Distinct from the read shape because the import migration
 * made `period` nullable (weekly-grain / non-instructional rows have no period) and
 * added `grammar_vocabulary` + `monthly_lo`. `id`/`is_active`/`source`/`synced_at`
 * are set by the write path, not the parser.
 */
export interface ParsedCurriculumRow {
  subject_code: string;
  year: number;
  month: string;
  week: number;
  period: number | null;
  lesson_key: string;
  daily_outcome: string | null;
  focus_area: string | null;
  linguistic_skill: string | null;
  theme: string | null;
  resources: CurriculumResource[];
  taxonomy_id: string | null;
  monthly_knowledge_lo: string | null;
  monthly_skills_lo: string | null;
  weekly_knowledge_lo: string | null;
  weekly_skills_lo: string | null;
  grammar_vocabulary: string | null;
  monthly_lo: string | null;
}

/** Where an import came from. */
export type CurriculumSyncSource = 'n8n' | 'upload';

/** Counts recorded for a single import run. */
export interface CurriculumSyncResult {
  runId: string | null;
  subjectCode: string;
  rowsUpserted: number;
  rowsDeactivated: number;
  unresolved: number;
  /**
   * `error` covers both a hard failure (parse/DB) and a circuit-breaker abort;
   * `aborted` distinguishes the latter (a safety stop with nothing written) from
   * the former (an unexpected failure). See `syncCurriculumWorkbook`.
   */
  status: 'success' | 'error';
  error?: string;
  /** True when the run was stopped by the magnitude circuit-breaker (Guard 2). */
  aborted?: boolean;
  /**
   * lesson_keys that were absent from this parse but left ACTIVE because a live
   * lesson plan still references them (Guard 1 — never orphan). Operator-review
   * signal; mirrored onto `curriculum_sync_run.warnings`.
   */
  skippedReferencedKeys?: string[];
}

/**
 * Build the stable lesson_key from a row's natural key.
 *
 * SAFETY: daily-grain rows (numeric `period`) produce `…|W{week}|P{period}` exactly
 * as the original English import did — this MUST stay byte-for-byte identical, since
 * live lesson plans link to curriculum rows by this key (see the import brief's
 * lesson_key gate). Rows with no numeric period — weekly-grain subjects (Awareness)
 * and non-instructional rows (Baseline/Orientation/Evaluation) — have no existing
 * rows to collide with, so the period segment is replaced by a sentinel: a slug of
 * the raw period label when present (so "Baseline" and "Orientation" in the same
 * week stay distinct), else the bare `wk` marker for pure weekly grain.
 */
export function buildLessonKey(
  subjectCode: string,
  year: number,
  month: string,
  week: number,
  period: number | null,
  periodLabel?: string | null,
): string {
  const periodPart =
    period != null ? `P${period}` : periodLabel ? `wk:${keySlug(periodLabel)}` : 'wk';
  return `${subjectCode}|Y${year}|${month}|W${week}|${periodPart}`;
}

/** Compact, deterministic slug for a non-instructional period label in a lesson_key. */
function keySlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

// ── Canonical curriculum model (schema-drift-resilient parser output) ─────────────
//
// These types are the *target* shape the new ingest engine produces, independent of
// the current `curriculum_lesson` columns. Several fields have no column yet (subject
// LO, annual/monthly single LO, topic, resource_url, grain, source_key) — they are
// captured here for the dry-run report and the forthcoming schema migration, and are
// adapted *down* to `ParsedCurriculumRow` on write. See the import brief.

export type Grain = 'daily' | 'weekly';

/** One canonical curriculum row at the finest available grain (a period, or a week). */
export interface CurriculumRecord {
  subject: string; // sheet-level constant, e.g. "English"
  subjectLearningOutcome: string | null;
  yearLabel: string; // raw, e.g. "Preparatory Year" | "Year 3" | "السنة 0"
  yearIndex: number | null; // normalised 0..6 (Preparatory / Year 0 / السنة 0 -> 0)
  annualLearningOutcome: string | null;
  month: string | null; // raw, e.g. "September"
  monthlyLearningOutcome: string | null; // single combined column
  monthlySkillLearningOutcome: string | null; // when split
  monthlyKnowledgeLearningOutcome: string | null;
  week: number | null;
  weeklySkillLearningOutcome: string | null;
  weeklyKnowledgeLearningOutcome: string | null;
  period: string | null; // raw, e.g. "Period 1" | "Baseline Evaluation"
  periodNumber: number | null; // 1..5; null for non-instructional rows
  dailyLearningOutcome: string | null;
  resourceText: string | null;
  resourceUrl: string | null; // hyperlink target — captured even when text is "Click for Resource"
  topic: string | null;
  focusArea: string | null;
  grammarVocabulary: string | null; // "Content covered within grammar" (English col Y)
  lessonIdentifier: string | null;
  grain: Grain;
  sourceKey: string; // deterministic id for upsert + soft-archive diff
  sourceRow: number; // 1-based sheet row, for debugging
}

/** One resolved (header → column) mapping, with the matcher's confidence. */
export interface ColumnMapping {
  canonicalField: string;
  header: string;
  column: string; // spreadsheet column letter, e.g. "R"
  confidence: number; // 0..1
}

/** Operator-facing summary of one parse — the dry-run safety check. */
export interface ImportReport {
  fileName: string;
  selectedSheet: string;
  candidateSheets: string[]; // other curriculum-shaped sheets that were NOT chosen
  needsReview: boolean; // ambiguous sheet choice OR low-confidence/missing critical fields
  headerRow: number; // 1-based sheet row
  grain: Grain;
  columnMap: ColumnMapping[];
  unmappedHeaders: { header: string; column: string }[]; // surfaces NEW / RENAMED columns
  missingFields: string[]; // expected canonical fields not found
  rowCount: number;
  warnings: string[];
  sampleRecords: CurriculumRecord[]; // first ~5
}

/**
 * The parser's full output.
 *
 * `records` + `report` are the canonical, spec-defined surface (used by dry-run and
 * the dev script). `lessonRows` + `skippedLessonRows` are an extension for the
 * *current* `curriculum_lesson` table: the rows that satisfy the legacy 5-tuple key,
 * built with the legacy field set so the English daily-grain import stays identical,
 * plus a count of records that cannot satisfy that key (weekly-grain /
 * non-instructional) and are skipped on write until the migration lands.
 */
export interface ParseResult {
  records: CurriculumRecord[];
  report: ImportReport;
  lessonRows: ParsedCurriculumRow[];
  skippedLessonRows: number;
}
