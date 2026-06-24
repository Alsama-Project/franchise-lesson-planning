// ── The column-matching engine ───────────────────────────────────────────────────
//
// The single hardest requirement of the curriculum ingest: never break when columns
// are added, renamed, reordered, or translated. We find the columns we need by header
// *meaning* — an alias dictionary + fuzzy scoring — and surface anything we can't map
// (`unmappedHeaders`) instead of silently dropping it. Pure & dependency-free so it is
// trivially unit-testable; `parseWorkbook` feeds it the header row's cells.

import type { ColumnMapping } from './types';

/** Every canonical field the matcher can resolve. Legacy fields (`linguisticSkill`,
 *  `theme`) feed existing `curriculum_lesson` columns and have no slot on the
 *  canonical `CurriculumRecord`; the link fields are recognised so they don't pollute
 *  `unmappedHeaders`, but are not yet stored. */
export type CanonicalField =
  | 'subject'
  | 'subjectLearningOutcome'
  | 'year'
  | 'annualLearningOutcome'
  | 'month'
  | 'monthlyLearningOutcome'
  | 'monthlySkillLearningOutcome'
  | 'monthlyKnowledgeLearningOutcome'
  | 'week'
  | 'weeklySkillLearningOutcome'
  | 'weeklyKnowledgeLearningOutcome'
  | 'period'
  | 'dailyLearningOutcome'
  | 'resources'
  | 'topic'
  | 'focusArea'
  | 'lessonIdentifier'
  | 'linguisticSkill'
  | 'theme'
  | 'lessonPlan'
  | 'worksheet'
  | 'assignment'
  | 'project';

/**
 * Alias dictionary. ONE editable map — adding a synonym a real file uses is a
 * one-line change. English + Arabic seeded from the eight current subject workbooks.
 */
export const ALIASES: Record<CanonicalField, string[]> = {
  subject: ['subject', 'الموضوع'],
  subjectLearningOutcome: ['subject learning outcome', 'نتائج التعلم للموضوع'],
  year: ['year', 'السنة'],
  annualLearningOutcome: [
    'annual learning outcome',
    'annual learning outcomes',
    'yearly learning outcome',
    'attitude learning outcome',
    'نتائج التعلم السنوية',
    'نتائج التعلم للسلوك',
  ],
  month: ['month', 'الشهر'],
  monthlyLearningOutcome: [
    'monthly learning outcome',
    'monthly skills outcome',
    'نتائج التعلم الشهرية',
    'monthly learning outcome (skills - knowledge)',
    'monthly learning outcome (knowledge-skill)',
  ],
  monthlySkillLearningOutcome: [
    'monthly skill learning outcome',
    'نتائج التعلم الشهرية للمهارات',
  ],
  monthlyKnowledgeLearningOutcome: [
    'monthly knowledge learning outcome',
    'نتائج التعلم الشهرية للمعرفة',
  ],
  week: ['week', 'الأسبوع'],
  weeklySkillLearningOutcome: [
    'weekly skill learning outcome',
    'weekly learning outcomes',
    'نتائج التعلم الأسبوعية للمهارات',
    'نتائج التعليم الاسبوعية للمهارات',
  ],
  weeklyKnowledgeLearningOutcome: [
    'weekly knowledge learning outcome',
    'نتائج التعلم الأسبوعية للمعرفة',
    'نتائج التعليم الاسبوعية للمعرفة',
  ],
  period: ['period #', 'period', 'رقم الحصة'],
  dailyLearningOutcome: ['daily lo', 'daily learning outcome', 'daily', 'اليومي', 'نتائج التعلم اليومية'],
  resources: ['resources', 'resource', 'الموارد'],
  topic: ['topic', 'content', 'المحتوى', 'الموضوع الاسبوعي'],
  focusArea: ['focus area', 'مجال التركيز', 'التركيز الموضوعي', 'المحور'],
  lessonIdentifier: ['lesson identifier', 'lesson id', 'معرِّف الدرس'],
  // Legacy → existing columns.
  linguisticSkill: ['linguistic skill', 'linguistic'],
  theme: ['theme'],
  // Recognised link columns (not yet stored).
  lessonPlan: ['lesson plan', 'lesson plans', 'خطة الدرس'],
  worksheet: ['worksheet', 'work sheet', 'worksheets', 'ورقة عمل'],
  assignment: ['assignment', 'assignments', 'واجب'],
  project: ['project', 'projects', 'مشروع'],
};

/** Headers that must never map to a content field (hidden helpers / code counters). */
const EXCLUDE_SUBSTRINGS = [
  'helper',
  'to be hidden',
  'to be deleted',
  'hour #',
  'skill lo #',
  'knowledge lo #',
  'lo #',
  'focus area #',
  'linguistic skill #',
  'slo and linguistic',
  'klo and linguistic',
  'رقم نتيجة التعلم المجمعة',
  'رقم المهارة اللغوية',
];

/**
 * Normalise a header cell for matching:
 *  - drop `[bracketed admin]` segments entirely
 *  - strip Arabic tatweel + diacritics
 *  - lowercase, parens → space, isolate `#` as its own token
 *  - collapse everything non-letter/digit/`#` to single spaces
 */
export function normalizeHeader(raw: unknown): string {
  let s = String(raw ?? '');
  s = s.replace(/\[[^\]]*\]/g, ' '); // [to be hidden]
  s = s.replace(/ـ/g, ''); // tatweel
  s = s.replace(/[ً-ْٰ]/g, ''); // harakat / diacritics
  s = s.toLowerCase();
  s = s.replace(/[()]/g, ' ');
  s = s.replace(/#/g, ' # '); // isolate the counter marker
  s = s.replace(/[^\p{L}\p{N}#]+/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function tokens(norm: string): string[] {
  return norm.length ? norm.split(' ') : [];
}

/** Like `normalizeHeader` but KEEPS bracket/paren contents, so exclusion can still see
 *  admin markers such as "[to be hidden]" that `normalizeHeader` would strip whole. */
function normalizeForExclude(raw: unknown): string {
  let s = String(raw ?? '');
  s = s.replace(/ـ/g, '');
  s = s.replace(/[ً-ْٰ]/g, '');
  s = s.toLowerCase();
  s = s.replace(/[()[\]]/g, ' ');
  s = s.replace(/#/g, ' # ');
  s = s.replace(/[^\p{L}\p{N}#]+/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** All aliases, normalised — used to whitelist a `#`-suffixed header that is genuine
 *  content (only `period #` today). */
const CONTENT_ALIAS_SET = new Set<string>(
  Object.values(ALIASES).flat().map(normalizeHeader),
);

/** A header is excluded if it matches a known junk substring, or is a bare code
 *  counter ending in `#` that is not itself a content alias. */
export function isExcludedHeader(raw: unknown): boolean {
  const ex = normalizeForExclude(raw);
  if (!ex) return false;
  if (EXCLUDE_SUBSTRINGS.some((x) => ex.includes(x))) return true;
  const norm = normalizeHeader(raw);
  if (norm.endsWith('#') && !CONTENT_ALIAS_SET.has(norm)) return true;
  return false;
}

/** Is `needle` a contiguous run inside `hay`? */
function isContiguous(needle: string[], hay: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Best score in [0,1] for a header against a single canonical field. */
function scoreField(headerNorm: string, headerTokens: string[], field: CanonicalField): number {
  let best = 0;
  for (const alias of ALIASES[field]) {
    const aNorm = normalizeHeader(alias);
    if (!aNorm) continue;
    if (headerNorm === aNorm) return 1; // exact
    const aTokens = tokens(aNorm);
    if (isContiguous(aTokens, headerTokens) || isContiguous(headerTokens, aTokens)) {
      best = Math.max(best, 0.85); // containment
      continue;
    }
    const maxLen = Math.max(headerNorm.length, aNorm.length);
    const lev = maxLen === 0 ? 0 : 1 - levenshtein(headerNorm, aNorm) / maxLen;
    best = Math.max(best, jaccard(headerTokens, aTokens), lev); // fuzzy fallback
  }
  return best;
}

const ACCEPT_THRESHOLD = 0.8;

const ALL_FIELDS = Object.keys(ALIASES) as CanonicalField[];

/** 0-based column index → spreadsheet letter (0 → "A", 26 → "AA"). */
export function columnLetter(index: number): string {
  let s = '';
  let x = index;
  do {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
}

export interface HeaderCell {
  /** 0-based column index. */
  col: number;
  text: string;
}

export interface MatchResult {
  /** field → resolved column (0-based index), header text, and confidence. */
  byField: Map<CanonicalField, { col: number; header: string; confidence: number }>;
  columnMap: ColumnMapping[];
  unmappedHeaders: { header: string; column: string }[];
}

/**
 * Resolve a header row's cells to canonical fields.
 *
 * Greedy assignment by descending score: each header maps to at most one field and
 * each field takes its single best header. Ties break toward the leftmost column
 * (preserving "first column wins" for duplicated/helper headers). Excluded headers
 * never map and are not reported as unmapped; everything else that fails to map lands
 * in `unmappedHeaders` so new/renamed columns are visible.
 */
export function matchColumns(cells: HeaderCell[]): MatchResult {
  type Candidate = { col: number; header: string; field: CanonicalField; score: number };
  const candidates: Candidate[] = [];
  const considered: HeaderCell[] = [];

  for (const cell of cells) {
    const text = (cell.text ?? '').trim();
    if (!text) continue;
    if (isExcludedHeader(text)) continue;
    considered.push({ col: cell.col, text });
    const norm = normalizeHeader(text);
    const toks = tokens(norm);
    for (const field of ALL_FIELDS) {
      const score = scoreField(norm, toks, field);
      if (score >= ACCEPT_THRESHOLD) candidates.push({ col: cell.col, header: text, field, score });
    }
  }

  candidates.sort(
    (a, b) => b.score - a.score || a.col - b.col || a.field.localeCompare(b.field),
  );

  const byField = new Map<CanonicalField, { col: number; header: string; confidence: number }>();
  const takenCols = new Set<number>();
  for (const c of candidates) {
    if (takenCols.has(c.col) || byField.has(c.field)) continue;
    byField.set(c.field, { col: c.col, header: c.header, confidence: round(c.score) });
    takenCols.add(c.col);
  }

  const columnMap: ColumnMapping[] = [...byField.entries()]
    .map(([field, m]) => ({
      canonicalField: field,
      header: m.header,
      column: columnLetter(m.col),
      confidence: m.confidence,
    }))
    .sort((a, b) => a.canonicalField.localeCompare(b.canonicalField));

  const unmappedHeaders = considered
    .filter((cell) => !takenCols.has(cell.col))
    .map((cell) => ({ header: cell.text, column: columnLetter(cell.col) }));

  return { byField, columnMap, unmappedHeaders };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
