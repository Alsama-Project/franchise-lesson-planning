import type { AppRow } from './app-source';

// ── Pinned per-subject source mappings — the audit's trust anchor ─────────────────
//
// Each entry is a HUMAN-DECLARED extraction rule expressed in raw spreadsheet
// coordinates (sheet name, first data row, explicit column letters). It is deliberately
// simple enough for a person to verify on 3–5 rows against the live workbook, after
// which the machine applies it to every row. This file shares NO code with the ingest
// parser — no columnMatcher, no aliases, no fuzzy header scoring. The whole point of
// the audit is that "expected" is derived from these pins, not from the parser.
//
// COLUMN LETTERS are Excel A1 letters (A=1st, R=18th…); `extract.ts` converts them.
// The extractor keys off these columns with merged-cell forward-fill and does NOT
// auto-detect the header row: `firstDataRow` is pinned per subject (the workbooks vary —
// most start at row 9 under a 3-row header block; arabic starts at row 7).
//
// Verified pins carry `pinned: true` (coordinates checked against the real gold-master
// workbooks). Subjects with no source workbook are declared `pinned: false`; the harness
// REFUSES to audit them (surfaced loudly, never silently skipped).

/** Grain of a subject's source: one row per period (daily) or one row per week (weekly). */
export type Grain = 'daily' | 'weekly';

/**
 * How the per-lesson outcome (compared against the DB `daily_outcome`) is built from
 * raw source columns:
 *   - `single`: one column, verbatim (English `Daily LO`).
 *   - `join`:   several columns joined by a separator (weekly-shape: skill \n knowledge).
 */
export type OutcomeRule =
  | { kind: 'single'; col: string }
  | { kind: 'join'; cols: string[]; separator: string };

/** Key columns, by Excel letter. `period: null` ⇒ weekly subject (period always null). */
export interface KeyColumns {
  year: string;
  month: string;
  week: string;
  period: string | null;
}

/** A candidate source column the DB outcome set is cross-checked against (layer 3). */
export interface OutcomeCandidate {
  label: string;
  rule: OutcomeRule;
}

/** Optional extra DB fields the audit diffs independently, by their source column. */
export type ExtraField = 'weekly_skills_lo' | 'weekly_knowledge_lo';

export interface PinnedMapping {
  /** subjects.code — also the gold-master CSV basename / subject_code filter. */
  subject: string;
  /** Real source workbook filename (the gold master actually used for ingest). */
  file: string;
  /** Fallback filename tried under the fixtures dir (parity-harness naming). */
  fallbackFile: string;
  /** Exact sheet/tab name. A rename must THROW, not silently fall back. */
  sheet: string;
  /** 1-based row of the "Column header" row (metadata; extraction uses firstDataRow). */
  headerRow: number;
  /** 1-based first data row (defaults to headerRow + 2). Pinned per subject. */
  firstDataRow?: number;
  /** Rule producing the outcome compared against DB `daily_outcome`. */
  outcome: OutcomeRule;
  key: KeyColumns;
  grain: Grain;
  /** Force every row's period to a fixed value (yoga: source is 1 row/week, DB keys P1). */
  periodOverride?: number;
  /**
   * Columns merged in the source ("value once, then blank = same as above") that must
   * be forward-filled: the coarse key parts (year, month, week) plus the merged weekly
   * LO columns (which repeat once per week over the period rows).
   */
  fillColumns: string[];
  /** Extra DB fields diffed independently (INFORMATIONAL — merge-boundary-sensitive). */
  fields?: Partial<Record<ExtraField, string>>;
  /**
   * Candidate outcome columns for the set cross-check. The audit tests the DB
   * `daily_outcome` SET against each candidate's SET; the best match names the column
   * the ingest ACTUALLY pulled. Lists the pinned outcome plus its decoys.
   */
  candidates: OutcomeCandidate[];
  /**
   * Years absent from the source workbook (excluded from the coverage gate on BOTH
   * sides until the year's source is supplied). Documented, not silent — reported as
   * "excluded years" in the layered report.
   */
  excludeYears?: number[];
  /**
   * Structural-marker predicate: an app (DB) row that is NOT a real academic lesson
   * (holiday / orientation / mis-ingested label). Such app-only rows are EXCUSED from
   * the orphan assertion (reported separately), so the gate targets genuine
   * wrong-column / fabricated-lesson defects, not known markers.
   */
  isMarker?: (app: AppRow) => boolean;
  /** True once the coordinates are verified against the live workbook. */
  pinned: boolean;
  /** Human note (e.g. why unpinned, or a verification caveat). */
  note?: string;
}

// ── Shared marker predicates ──────────────────────────────────────────────────────
//
// Structural rows the DB carries that are not academic lessons. Kept explicit and
// documented so the orphan carve-out is auditable, not a silent blanket skip. Verified
// against the real gold master: english 11 "Period N" label rows; professionalism 8
// Orientation/Evaluation markers; science 17 holiday/baseline markers.

/** A DB row whose daily_outcome is a bare "Period N" label (english mis-ingest). */
const isPeriodLabel = (a: AppRow): boolean => /^period\s*\d+$/i.test((a.dailyOutcome ?? '').trim());

/** A DB row that is a non-instructional marker (period NULL + marker-ish/empty outcome). */
const isNonInstructionalMarker = (a: AppRow): boolean => {
  if (a.key.period != null) return false; // real lessons in these subjects have a period
  const o = (a.dailyOutcome ?? '').trim().toLowerCase();
  return (
    o === '' ||
    /orientation|evaluation|baseline|holiday|activity|revision|assessment|exam|break|عطلة|تقييم|مراجعة/.test(o)
  );
};

// ── Verified pins (audit brief §3 + follow-up + confirmed against the workbooks) ──

const ENGLISH: PinnedMapping = {
  subject: 'english',
  file: 'Alsama_English_Curriculum.xlsx',
  fallbackFile: 'english.xlsx',
  sheet: 'English Curriculum', // NOT "English 6 year Curriculum"
  headerRow: 7,
  firstDataRow: 9,
  outcome: { kind: 'single', col: 'R' }, // abbreviated Daily LO, amid decoy LO columns
  key: { year: 'E', month: 'G', week: 'O', period: 'Q' },
  grain: 'daily',
  fillColumns: ['E', 'G', 'O', 'K', 'N'], // year/month/week + merged weekly skill/knowledge
  fields: { weekly_skills_lo: 'K', weekly_knowledge_lo: 'N' },
  candidates: [
    { label: 'Daily LO (R)', rule: { kind: 'single', col: 'R' } },
    { label: 'Weekly Skill (K)', rule: { kind: 'single', col: 'K' } },
    { label: 'Weekly Knowledge (N)', rule: { kind: 'single', col: 'N' } },
  ],
  // Excuse the period-NULL structural rows: "Period N" mis-ingest labels + August
  // Orientation/Evaluation markers. A period-NULL row with real lesson text (e.g. the
  // stray Y5 March W27 "architectural vocabulary" row) is NOT excused — it surfaces as a
  // genuine orphan for sweeping.
  isMarker: (a) => isPeriodLabel(a) || isNonInstructionalMarker(a),
  pinned: true,
};

const ARABIC: PinnedMapping = {
  subject: 'arabic',
  file: 'Alsama__Arabic_Curriculum__1_.xlsx',
  fallbackFile: 'arabic.xlsx',
  sheet: 'Arabic Curriculum (2)', // NOT "Arabic Curriculum" (taxonomy-code junk daily col)
  headerRow: 6,
  firstDataRow: 7, // no English-style label row; data begins at row 7
  outcome: { kind: 'single', col: 'N' }, // نتائج التعلم اليومية (Daily LO)
  key: { year: 'E', month: 'F', week: 'L', period: 'M' },
  grain: 'daily',
  fillColumns: ['E', 'F', 'L', 'H', 'K'],
  fields: { weekly_skills_lo: 'H', weekly_knowledge_lo: 'K' },
  candidates: [
    { label: 'Daily LO (N)', rule: { kind: 'single', col: 'N' } },
    { label: 'Weekly Skill (H)', rule: { kind: 'single', col: 'H' } },
    { label: 'Weekly Knowledge (K)', rule: { kind: 'single', col: 'K' } },
  ],
  isMarker: isNonInstructionalMarker,
  pinned: true,
};

const MATHS: PinnedMapping = {
  subject: 'maths',
  file: 'Alsama_Maths_Curriculum__1_.xlsx',
  fallbackFile: 'maths.xlsx',
  sheet: 'Curriculum Math',
  headerRow: 7,
  firstDataRow: 9,
  outcome: { kind: 'single', col: 'P' }, // Daily LO
  key: { year: 'D', month: 'F', week: 'N', period: 'O' },
  grain: 'daily',
  fillColumns: ['D', 'F', 'N', 'J', 'M'],
  fields: { weekly_skills_lo: 'J', weekly_knowledge_lo: 'M' },
  candidates: [
    { label: 'Daily LO (P)', rule: { kind: 'single', col: 'P' } },
    { label: 'Weekly Skill (J)', rule: { kind: 'single', col: 'J' } },
    { label: 'Weekly Knowledge (M)', rule: { kind: 'single', col: 'M' } },
  ],
  isMarker: isNonInstructionalMarker,
  pinned: true,
};

const SCIENCE: PinnedMapping = {
  subject: 'science',
  file: 'Alsama_Science_Curriculum__1_.xlsx',
  fallbackFile: 'science.xlsx',
  sheet: 'Version 2 ', // sic — trailing space, match literally
  headerRow: 7,
  firstDataRow: 9,
  outcome: { kind: 'single', col: 'Q' }, // Daily LO
  key: { year: 'E', month: 'G', week: 'O', period: 'P' },
  grain: 'daily',
  fillColumns: ['E', 'G', 'O', 'K', 'N'],
  fields: { weekly_skills_lo: 'K', weekly_knowledge_lo: 'N' },
  candidates: [
    { label: 'Daily LO (Q)', rule: { kind: 'single', col: 'Q' } },
    { label: 'Weekly Skill (K)', rule: { kind: 'single', col: 'K' } },
    { label: 'Weekly Knowledge (N)', rule: { kind: 'single', col: 'N' } },
  ],
  isMarker: isNonInstructionalMarker, // 17 holiday/baseline markers
  pinned: true,
};

const PROFESSIONALISM: PinnedMapping = {
  subject: 'professionalism',
  file: 'Alsama_Professionalism_Curriculum__1_.xlsx',
  fallbackFile: 'professionalism.xlsx',
  // V4 is the ONLY VISIBLE sheet (the current logic-tree content); V1/V2/Detail*/Sheet1
  // are all hidden legacy versions. The DB was ingested from the hidden, STALE V1 (the
  // ingest reads the first sheet without consulting visibility — the bug fixed on
  // claude/ingest-sheet-and-weekly-fixes). Pinning to V4 makes the gate report the
  // stale daily_outcome (Y3–6) that the V1 pin was hiding — a CORRECT red until re-ingest.
  sheet: 'V4',
  headerRow: 7,
  firstDataRow: 8, // annual/baseline row above the first Period-1 lesson (row 9)
  outcome: { kind: 'single', col: 'M' }, // V4 Daily LO (different layout from V1's Q)
  key: { year: 'E', month: 'G', week: 'K', period: 'L' }, // V4: week K, period L
  grain: 'daily', // Years 3–6 only (~773 lessons)
  fillColumns: ['E', 'G', 'K', 'I', 'J'], // year/month/week + merged weekly skill/knowledge
  fields: { weekly_skills_lo: 'I', weekly_knowledge_lo: 'J' }, // V4 has WEEKLY S/K (I/J)
  candidates: [
    { label: 'Daily LO (M)', rule: { kind: 'single', col: 'M' } },
    { label: 'Weekly Skill (I)', rule: { kind: 'single', col: 'I' } },
    { label: 'Weekly Knowledge (J)', rule: { kind: 'single', col: 'J' } },
    { label: 'Monthly LO (H)', rule: { kind: 'single', col: 'H' } },
  ],
  isMarker: isNonInstructionalMarker,
  pinned: true,
};

const AWARENESS: PinnedMapping = {
  subject: 'awareness',
  file: 'Alsama_Awareness_Curriculum__1_.xlsx',
  fallbackFile: 'awareness.xlsx',
  sheet: 'Awareness Cirriculum V3', // sic — source spelling
  headerRow: 7,
  firstDataRow: 9,
  outcome: { kind: 'join', cols: ['I', 'J'], separator: '\n' }, // Weekly Skill \n Knowledge
  key: { year: 'E', month: 'G', week: 'K', period: null }, // weekly ⇒ period null
  grain: 'weekly',
  fillColumns: ['E', 'G'], // week is per-row; I/J are per-week (one row) — no fill
  fields: { weekly_skills_lo: 'I', weekly_knowledge_lo: 'J' },
  candidates: [
    { label: 'Weekly Skill (I)', rule: { kind: 'single', col: 'I' } },
    { label: 'Weekly Knowledge (J)', rule: { kind: 'single', col: 'J' } },
    { label: 'Skill \\n Knowledge (I \\n J)', rule: { kind: 'join', cols: ['I', 'J'], separator: '\n' } },
  ],
  isMarker: isNonInstructionalMarker,
  pinned: true,
};

const YOGA: PinnedMapping = {
  subject: 'yoga',
  file: 'Alsama_Yoga_Curriculum__1_.xlsx',
  fallbackFile: 'yoga.xlsx',
  sheet: 'Yoga Curriculum',
  headerRow: 7,
  firstDataRow: 9,
  outcome: { kind: 'join', cols: ['K', 'N'], separator: '\n' }, // Weekly Skill \n Knowledge
  key: { year: 'E', month: 'G', week: 'P', period: 'Q' },
  grain: 'daily',
  periodOverride: 1, // source is 1 row/week with blank period cells; DB keys every row P1
  fillColumns: ['E', 'G'],
  fields: { weekly_skills_lo: 'K', weekly_knowledge_lo: 'N' },
  candidates: [
    { label: 'Weekly Skill (K)', rule: { kind: 'single', col: 'K' } },
    { label: 'Weekly Knowledge (N)', rule: { kind: 'single', col: 'N' } },
    { label: 'Skill \\n Knowledge (K \\n N)', rule: { kind: 'join', cols: ['K', 'N'], separator: '\n' } },
  ],
  // Yoga's only valid period is 1 (uniform Period 1); any other period is a corrupt
  // artefact (the known yoga|Y5|Year 5|W5|P5 — month is the literal typo "Year 5").
  isMarker: (a) => a.key.period !== 1,
  pinned: true,
};

// ── Unpinned — no source workbook, so it cannot be audited honestly ────────────────
//
// IT ships no source workbook (confirmed). It stays declared but unpinned: the harness
// refuses to audit it and surfaces it as UNPINNED, so nobody mistakes a green suite for
// full curriculum coverage. Do NOT fabricate a mapping for it.
const IT: PinnedMapping = {
  subject: 'it',
  file: 'it.xlsx',
  fallbackFile: 'it.xlsx',
  sheet: '',
  headerRow: 7,
  outcome: { kind: 'single', col: 'A' },
  key: { year: 'A', month: 'A', week: 'A', period: 'A' },
  grain: 'daily',
  fillColumns: [],
  candidates: [],
  pinned: false,
  note: 'UNPINNED — no source workbook exists for IT. Not audited; do not fabricate a map.',
};

export const PINNED_MAPPINGS: PinnedMapping[] = [
  ENGLISH,
  ARABIC,
  MATHS,
  SCIENCE,
  PROFESSIONALISM,
  AWARENESS,
  YOGA,
  IT,
];

export function pinFor(subject: string): PinnedMapping | undefined {
  return PINNED_MAPPINGS.find((m) => m.subject === subject);
}

/** Subjects with a verified pin (the set the gate actually asserts on). */
export function pinnedSubjects(): PinnedMapping[] {
  return PINNED_MAPPINGS.filter((m) => m.pinned);
}

/** Subjects with no verified pin (surfaced, never silently skipped). */
export function unpinnedSubjects(): PinnedMapping[] {
  return PINNED_MAPPINGS.filter((m) => !m.pinned);
}
