// ── Pinned per-subject source mappings — the audit's trust anchor ─────────────────
//
// Each entry is a HUMAN-DECLARED extraction rule expressed in raw spreadsheet
// coordinates (sheet name, header row, explicit column letters). It is deliberately
// simple enough for a person to verify on 3–5 rows against the live workbook, after
// which the machine applies it to every row. This file shares NO code with the ingest
// parser — no columnMatcher, no aliases, no fuzzy header scoring. The whole point of
// the audit is that "expected" is derived from these pins, not from the parser.
//
// COLUMN LETTERS are Excel A1 letters (A=1st, R=18th…); `extract.ts` converts them.
// HEADER ROW is the 1-based row of the "Column header" row; the source workbooks use a
// 3-row header block (band / column-header / description), so data begins two rows
// below it (`firstDataRow = headerRow + 2`) unless a pin overrides `firstDataRow`.
//
// Verified pins carry `pinned: true`. Subjects whose real workbook has not been
// eyeballed are declared `pinned: false` with placeholder coordinates; the harness
// REFUSES to audit them (surfaced loudly, never silently skipped) until a human
// verifies their coordinates against the gold-master workbook actually used for ingest.

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
export type ExtraField =
  | 'weekly_skills_lo'
  | 'weekly_knowledge_lo'
  | 'monthly_lo'
  | 'theme'
  | 'linguistic_skill';

export interface PinnedMapping {
  /** subjects.code — also the gold-master CSV basename. */
  subject: string;
  /** Real source workbook filename (the gold master actually used for ingest). */
  file: string;
  /** Fallback filename tried under the fixtures dir (parity-harness naming). */
  fallbackFile: string;
  /** Exact sheet/tab name. A rename must THROW, not silently fall back. */
  sheet: string;
  /** 1-based row of the "Column header" row. */
  headerRow: number;
  /** 1-based first data row (defaults to headerRow + 2 — skips the description row). */
  firstDataRow?: number;
  /** Rule producing the outcome compared against DB `daily_outcome`. */
  outcome: OutcomeRule;
  key: KeyColumns;
  grain: Grain;
  /**
   * Columns merged in the source ("value once, then blank = same as above") that must
   * be forward-filled down a group. Always includes the coarse key parts (year, month,
   * and — for daily grain — week) plus any merged LO columns declared in `fields`.
   */
  fillColumns: string[];
  /** Extra DB fields diffed independently, keyed by their source column letter. */
  fields?: Partial<Record<ExtraField, string>>;
  /**
   * Candidate outcome columns for the set cross-check. The audit tests the DB
   * `daily_outcome` SET against each candidate's SET; the best match names the column
   * the ingest ACTUALLY pulled. Should list the pinned outcome plus its decoys.
   */
  candidates: OutcomeCandidate[];
  /** True once the coordinates are verified against the live workbook. */
  pinned: boolean;
  /** Human note (e.g. why unpinned, or a verification caveat). */
  note?: string;
}

// ── Verified pins (from the audit brief §3) ───────────────────────────────────────

const ENGLISH: PinnedMapping = {
  subject: 'english',
  file: 'Alsama_English_Curriculum__JUNE_2025.xlsx',
  fallbackFile: 'english.xlsx',
  sheet: 'English Curriculum', // NOT "English 6 year Curriculum" — 6-sheet workbook
  headerRow: 7, // band row 6 above
  // English's real outcome is the abbreviated `Daily LO` (col R), surrounded by 6+
  // decoy "…Learning Outcome" columns. This is the prime mis-bind trigger — pin it.
  outcome: { kind: 'single', col: 'R' },
  key: { year: 'E', month: 'G', week: 'O', period: 'Q' },
  grain: 'daily', // 5 periods/week
  fillColumns: ['E', 'G', 'O'], // year, month, week merged; Daily LO + Period are per-row
  candidates: [
    { label: 'Daily LO (col R)', rule: { kind: 'single', col: 'R' } },
  ],
  pinned: true,
  note:
    'Weekly/Monthly/Annual/Subject LO column letters are NOT in the brief; add them as ' +
    'decoy candidates when verifying against the live English workbook to sharpen the ' +
    'layer-3 cross-check.',
};

const AWARENESS: PinnedMapping = {
  subject: 'awareness',
  file: 'Alsama_Awareness_Curriculum__1_.xlsx',
  fallbackFile: 'awareness.xlsx',
  sheet: 'Awareness Cirriculum V3', // sic — source spelling
  headerRow: 7,
  // Weekly Skill (I) + '\n' + Weekly Knowledge (J) — matches composeWeeklyOutcome.
  outcome: { kind: 'join', cols: ['I', 'J'], separator: '\n' },
  key: { year: 'E', month: 'G', week: 'K', period: null }, // weekly ⇒ period null
  grain: 'weekly',
  fillColumns: ['E', 'G'], // year, month merged; week is per-row
  fields: { weekly_skills_lo: 'I', weekly_knowledge_lo: 'J' },
  candidates: [
    { label: 'Weekly Skill (col I)', rule: { kind: 'single', col: 'I' } },
    { label: 'Weekly Knowledge (col J)', rule: { kind: 'single', col: 'J' } },
    { label: 'Skill \\n Knowledge (I \\n J)', rule: { kind: 'join', cols: ['I', 'J'], separator: '\n' } },
  ],
  pinned: true,
  note:
    'Out of scope for the committed gate: Awareness has no gold master (never imported), ' +
    'so its content diff self-skips — but the pin is recorded for when it is imported.',
};

const YOGA: PinnedMapping = {
  subject: 'yoga',
  file: 'Alsama_Yoga_Curriculum__1_.xlsx',
  fallbackFile: 'yoga.xlsx',
  sheet: 'Yoga Curriculum',
  headerRow: 7,
  // Weekly Skill (K) + '\n' + Weekly Knowledge (N) — matches composeWeeklyOutcome.
  outcome: { kind: 'join', cols: ['K', 'N'], separator: '\n' },
  key: { year: 'E', month: 'G', week: 'P', period: 'Q' }, // Period 1 only
  grain: 'daily', // period-1-only daily grain
  fillColumns: ['E', 'G', 'P'], // year, month, week merged
  fields: { weekly_skills_lo: 'K', weekly_knowledge_lo: 'N' },
  candidates: [
    { label: 'Weekly Skill (col K)', rule: { kind: 'single', col: 'K' } },
    { label: 'Weekly Knowledge (col N)', rule: { kind: 'single', col: 'N' } },
    { label: 'Skill \\n Knowledge (K \\n N)', rule: { kind: 'join', cols: ['K', 'N'], separator: '\n' } },
  ],
  pinned: true,
};

// ── Unpinned declarations — a human MUST verify coordinates before these audit ─────
//
// The brief pins only English, Awareness and Yoga. The remaining subjects' outcome
// columns cannot be declared honestly without their real gold-master workbooks in
// hand (a fabricated pin would either bless wrong data or invent false diffs). Each is
// declared `pinned: false` with placeholder coordinates so the file enumerates the
// whole subject set; the harness refuses to audit them and reports them as UNPINNED.
function unpinned(subject: string): PinnedMapping {
  return {
    subject,
    file: `${subject}.xlsx`,
    fallbackFile: `${subject}.xlsx`,
    sheet: '',
    headerRow: 7,
    outcome: { kind: 'single', col: 'A' },
    key: { year: 'A', month: 'A', week: 'A', period: 'A' },
    grain: 'daily',
    fillColumns: [],
    candidates: [],
    pinned: false,
    note:
      'UNPINNED — declare sheet, header row, key columns and the outcome column against ' +
      `the real ${subject} gold-master workbook (eyeball 3–5 rows vs the live app), then ` +
      'set pinned: true. Until then the audit refuses to bless this subject.',
  };
}

export const PINNED_MAPPINGS: PinnedMapping[] = [
  ENGLISH,
  AWARENESS,
  YOGA,
  unpinned('arabic'),
  unpinned('maths'),
  unpinned('professionalism'),
  unpinned('science'),
  unpinned('it'),
];

export function pinFor(subject: string): PinnedMapping | undefined {
  return PINNED_MAPPINGS.find((m) => m.subject === subject);
}

/** Subjects with a verified pin (the set the gate actually asserts on). */
export function pinnedSubjects(): PinnedMapping[] {
  return PINNED_MAPPINGS.filter((m) => m.pinned);
}

/** Subjects still awaiting a human-declared pin (surfaced, never silently skipped). */
export function unpinnedSubjects(): PinnedMapping[] {
  return PINNED_MAPPINGS.filter((m) => !m.pinned);
}
