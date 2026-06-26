import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  buildLessonKey,
  type CurriculumRecord,
  type CurriculumResource,
  type Grain,
  type ImportReport,
  type ParsedCurriculumRow,
  type ParseResult,
} from './types';
import {
  matchColumns,
  normalizeHeader,
  type CanonicalField,
  type HeaderCell,
  type MatchResult,
} from './columnMatcher';

// ── Parsing the curriculum workbook ─────────────────────────────────────────────
//
// The source spreadsheets are hostile and they DRIFT: columns get added, renamed,
// reordered, and translated (English ↔ Arabic). So we never trust column position —
// we locate columns by header *meaning* (see columnMatcher) — and we report what we
// could not place instead of dropping it silently.
//
// Each sheet has a 3-row header block: a "band" row, the real "Column header" row,
// then a "Description" row, then data. The header row is usually 7 but is 5 in one
// Arabic file, so we DETECT it. Hierarchical columns (Year, Month, Week, the LO
// columns, Topic, Focus Area) are merged — a value appears once then blanks below
// meaning "same as above" — so we forward-fill. The finest grain is one row per
// period; Awareness has no period column at all, so its finest grain is the week.
//
// `parseCurriculumWorkbook` returns the canonical `records` + an operator `report`,
// plus `lessonRows`: the subset adapted down to the current `curriculum_lesson`
// 5-tuple key (so the existing English import is unchanged), and a count of records
// that cannot satisfy that key yet.

/** Spreadsheet error sentinels (and the literal "#N/A") collapse to null. */
const ERROR_RE = /^#(REF|VALUE|N\/?A|NAME|DIV\/?0|NULL|NUM)[!?]?$/i;

/** First non-empty cell of these rows marks a header-block meta row, not data. */
const HEADER_MARKERS = ['column header', 'عنوان العمود'];
const META_MARKERS = ['description', 'الوصف', 'period', 'الفترة الزمنية'];

/** Canonical fields that are merged/grouped and must be forward-filled down a group. */
const FILL_FIELDS: CanonicalField[] = [
  'year',
  'annualLearningOutcome',
  'month',
  'monthlyLearningOutcome',
  'monthlySkillLearningOutcome',
  'monthlyKnowledgeLearningOutcome',
  'week',
  'weeklySkillLearningOutcome',
  'weeklyKnowledgeLearningOutcome',
  'topic',
  'focusArea',
];

/** One resolved cell: formatted text + an optional hyperlink target. */
interface Cell {
  text: string | null;
  url: string | null;
}

const EMPTY_CELL: Cell = { text: null, url: null };

/** Trim a cell, collapsing spreadsheet error sentinels and blanks to null. */
function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (ERROR_RE.test(s)) return null;
  return s;
}

/** True if a raw cell text is a spreadsheet error sentinel. */
function isErrorText(value: string | null): boolean {
  return value != null && ERROR_RE.test(value.trim());
}

/** Extract the first integer from a value (handles "Week 3", "3"). */
function toInt(value: string | null): number | null {
  if (value == null) return null;
  const m = value.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Normalise a year label to its 0..6 index. Preparatory / reception / السنة 0 → 0. */
function parseYearIndex(label: string | null): number | null {
  if (!label) return null;
  const n = normalizeHeader(label);
  if (n.includes('preparatory') || n.includes('reception') || n.includes('تمهيد')) return 0;
  const m = n.match(/\d+/);
  if (m) {
    const v = parseInt(m[0], 10);
    if (v >= 0 && v <= 12) return v;
  }
  return null;
}

/** Period number from "Period 3"; null for non-instructional labels (no digit). */
function parsePeriodNumber(label: string | null): number | null {
  if (!label) return null;
  const m = label.match(/\d+/);
  if (!m) return null;
  const v = parseInt(m[0], 10);
  return v >= 1 && v <= 6 ? v : null;
}

function slug(s: string): string {
  return normalizeHeader(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function extractUrl(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0].replace(/[)\].,]+$/, '') : null;
}

/** Split a resources cell into [{label, url}], attaching a hyperlink target if present. */
export function parseResources(raw: string | null, url: string | null = null): CurriculumResource[] {
  const s = clean(raw);
  const out: CurriculumResource[] = [];
  if (s != null) {
    for (const piece of s.split(/[\n;]+/).map((p) => p.trim()).filter(Boolean)) {
      const inline = piece.match(/https?:\/\/\S+/);
      if (inline) {
        const u = inline[0].replace(/[)\].,]+$/, '');
        const label = piece.replace(inline[0], '').replace(/[-–—:|]\s*$/, '').trim() || u;
        out.push({ label, url: u });
      } else {
        out.push({ label: piece });
      }
    }
  }
  // Attach the cell's hyperlink target (the display text is usually "Click for Resource").
  if (url) {
    if (out.length === 0) out.push({ label: s ?? 'Resource', url });
    else if (!out[0].url) out[0] = { ...out[0], url };
  }
  return out;
}

// ── Reading a sheet into an addressable grid (text + hyperlinks) ──────────────────

/**
 * Build a grid of cells indexed by absolute sheet row/col, preserving BOTH formatted
 * text and hyperlink targets. `sheet_to_json` drops hyperlinks, so we read cells
 * directly. Row index `r` maps to the 1-based sheet row `r + 1`.
 */
function buildGrid(sheet: XLSX.WorkSheet): { grid: Cell[][]; nRows: number; nCols: number } {
  const ref = sheet['!ref'];
  if (!ref) return { grid: [], nRows: 0, nCols: 0 };
  const range = XLSX.utils.decode_range(ref);
  const grid: Cell[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: Cell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell) {
        row[c] = EMPTY_CELL;
        continue;
      }
      const text = cell.w != null ? String(cell.w) : cell.v != null ? String(cell.v) : null;
      const url = cell.l?.Target ?? null;
      row[c] = { text, url };
    }
    grid[r] = row;
  }
  return { grid, nRows: range.e.r + 1, nCols: range.e.c + 1 };
}

function cellAt(grid: Cell[][], r: number, c: number): Cell {
  return grid[r]?.[c] ?? EMPTY_CELL;
}

function firstNonEmpty(row: Cell[] | undefined): string {
  if (!row) return '';
  for (const cell of row) {
    const t = clean(cell?.text ?? null);
    if (t != null) return t;
  }
  return '';
}

/** Build the matcher's header-cell list for a row, dropping structural marker cells. */
function headerCells(row: Cell[] | undefined, nCols: number): HeaderCell[] {
  const cells: HeaderCell[] = [];
  if (!row) return cells;
  for (let c = 0; c < nCols; c++) {
    const text = (row[c]?.text ?? '').trim();
    if (!text) continue;
    if (HEADER_MARKERS.includes(normalizeHeader(text))) continue; // "Column header"
    cells.push({ col: c, text });
  }
  return cells;
}

/** How many band rows above the "Column header" row to merge a blank column from. */
const BAND_LOOKBACK = 2;

/**
 * Like `headerCells`, but for the FINAL harvest of the resolved header row: some
 * columns label only in a "band" row ABOVE the column-header row (the curriculum
 * workbooks use a 3-row header block, and a few merged columns — English col J
 * "Monthly Learning Outcome", col F "Annual Learning Outcomes" — carry their label
 * in the band row, leaving the column-header row blank). For any column blank in the
 * header row, fall back to the nearest non-blank cell in the (up to `BAND_LOOKBACK`)
 * rows above, so the matcher can place it by meaning. Columns that DO have a header
 * cell are untouched, so existing mappings are byte-for-byte unchanged — this only
 * *adds* otherwise-dropped band-labelled columns. Detection (`detectHeaderRow`) keeps
 * the plain single-row read, so which row is chosen as the header never changes.
 */
function headerCellsWithBand(grid: Cell[][], headerRow: number, nCols: number): HeaderCell[] {
  const row = grid[headerRow];
  if (!row) return [];
  const cells: HeaderCell[] = [];
  for (let c = 0; c < nCols; c++) {
    let text = (row[c]?.text ?? '').trim();
    if (!text) {
      for (let up = 1; up <= BAND_LOOKBACK && headerRow - up >= 0; up++) {
        const above = (grid[headerRow - up]?.[c]?.text ?? '').trim();
        if (above) {
          text = above;
          break;
        }
      }
    }
    if (!text) continue;
    if (HEADER_MARKERS.includes(normalizeHeader(text))) continue; // "Column header"
    cells.push({ col: c, text });
  }
  return cells;
}

interface SheetEval {
  name: string;
  headerRow: number; // 0-based grid index
  match: MatchResult;
  grain: Grain;
  shaped: boolean;
  fieldCount: number;
  grid: Cell[][];
  nRows: number;
  nCols: number;
}

/** Locate the header row of a grid, or null if it has none. */
function detectHeaderRow(grid: Cell[][], nRows: number, nCols: number): number | null {
  const limit = Math.min(nRows, 15);
  // 1) The explicit "Column header" / "عنوان العمود" marker row.
  for (let r = 0; r < limit; r++) {
    if (HEADER_MARKERS.includes(normalizeHeader(firstNonEmpty(grid[r])))) return r;
  }
  // 2) Fallback: the row that maps the most canonical fields (and at least Year+Month).
  let best: { r: number; count: number } | null = null;
  for (let r = 0; r < limit; r++) {
    if (META_MARKERS.includes(normalizeHeader(firstNonEmpty(grid[r])))) continue;
    const m = matchColumns(headerCells(grid[r], nCols));
    const count = m.byField.size;
    if (m.byField.has('year') && m.byField.has('month') && count >= 3) {
      if (!best || count > best.count) best = { r, count };
    }
  }
  return best ? best.r : null;
}

/** Daily if a Daily-LO/Period column maps AND has data in the body; else weekly. */
function detectGrain(grid: Cell[][], headerRow: number, nRows: number, match: MatchResult): Grain {
  const daily = match.byField.get('dailyLearningOutcome');
  const period = match.byField.get('period');
  for (const col of [daily?.col, period?.col]) {
    if (col == null) continue;
    for (let r = headerRow + 1; r < nRows; r++) {
      if (META_MARKERS.includes(normalizeHeader(firstNonEmpty(grid[r])))) continue;
      if (clean(cellAt(grid, r, col).text) != null) return 'daily';
    }
  }
  return 'weekly';
}

function evaluateSheet(name: string, sheet: XLSX.WorkSheet): SheetEval | null {
  const { grid, nRows, nCols } = buildGrid(sheet);
  if (nRows === 0) return null;
  const headerRow = detectHeaderRow(grid, nRows, nCols);
  if (headerRow == null) return null;
  const match = matchColumns(headerCellsWithBand(grid, headerRow, nCols));
  const grain = detectGrain(grid, headerRow, nRows, match);
  const f = match.byField;
  const hasOutcome =
    f.has('dailyLearningOutcome') ||
    f.has('period') ||
    f.has('weeklySkillLearningOutcome') ||
    f.has('weeklyKnowledgeLearningOutcome');
  const shaped = f.has('year') && f.has('month') && hasOutcome;
  return { name, headerRow, match, grain, shaped, fieldCount: f.size, grid, nRows, nCols };
}

/** Highest `V<n>` in a sheet name (for tie-breaking Professionalism V1/V2/V4). */
function versionRank(name: string): number {
  const m = name.match(/v\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

interface SheetSelection {
  chosen: SheetEval;
  candidateSheets: string[];
  ambiguous: boolean;
}

/** Choose the curriculum sheet. Never just `sheetnames[0]`. */
function selectSheet(workbook: XLSX.WorkBook, requested?: string): SheetSelection {
  const evals: SheetEval[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const ev = evaluateSheet(name, sheet);
    if (ev) evals.push(ev);
  }

  if (requested) {
    const ev = evals.find((e) => e.name === requested);
    if (!ev) {
      throw new Error(`Requested sheet "${requested}" has no recognisable curriculum header.`);
    }
    const others = evals.filter((e) => e.shaped && e.name !== ev.name).map((e) => e.name);
    return { chosen: ev, candidateSheets: others, ambiguous: false };
  }

  const shaped = evals.filter((e) => e.shaped);
  if (shaped.length === 0) {
    throw new Error(
      'Could not find a curriculum sheet: no header row mapping Subject/Year/Month and a learning-outcome column.',
    );
  }
  if (shaped.length === 1) {
    return { chosen: shaped[0], candidateSheets: [], ambiguous: false };
  }

  // (a) most mapped fields, (b) highest V<n>, (c) last sheet.
  const order = new Map(workbook.SheetNames.map((n, i) => [n, i] as const));
  const ranked = [...shaped].sort(
    (a, b) =>
      b.fieldCount - a.fieldCount ||
      versionRank(b.name) - versionRank(a.name) ||
      (order.get(b.name) ?? 0) - (order.get(a.name) ?? 0),
  );
  const chosen = ranked[0];
  return {
    chosen,
    candidateSheets: shaped.filter((e) => e.name !== chosen.name).map((e) => e.name),
    ambiguous: true,
  };
}

// ── The parse ─────────────────────────────────────────────────────────────────────

export interface ParseOptions {
  sheet?: string;
  fileName?: string;
}

/**
 * Parse a curriculum workbook for one subject into canonical records + an operator
 * report, plus rows adapted down to the current `curriculum_lesson` table.
 *
 * @throws if no sheet has a recognisable curriculum header.
 */
export function parseCurriculumWorkbook(
  buffer: Buffer | ArrayBuffer,
  subjectCode: string,
  opts: ParseOptions = {},
): ParseResult {
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  const workbook = XLSX.read(data, { type: 'buffer' });

  const { chosen, candidateSheets, ambiguous } = selectSheet(workbook, opts.sheet);
  const { grid, nRows, headerRow, match, grain } = chosen;
  const { byField } = match;

  const colOf = (f: CanonicalField): number | null => byField.get(f)?.col ?? null;
  const rawAt = (r: number, f: CanonicalField): string | null => {
    const c = colOf(f);
    return c == null ? null : clean(cellAt(grid, r, c).text);
  };
  const urlAt = (r: number, f: CanonicalField): string | null => {
    const c = colOf(f);
    return c == null ? null : cellAt(grid, r, c).url;
  };

  // Subject + Subject LO are sheet-level constants (first non-empty in their column).
  const firstInColumn = (f: CanonicalField): string | null => {
    const c = colOf(f);
    if (c == null) return null;
    for (let r = headerRow + 1; r < nRows; r++) {
      if (META_MARKERS.includes(normalizeHeader(firstNonEmpty(grid[r])))) continue;
      const v = clean(cellAt(grid, r, c).text);
      if (v != null) return v;
    }
    return null;
  };
  const subjectConst = firstInColumn('subject') ?? subjectCode;
  const subjectLOConst = firstInColumn('subjectLearningOutcome');

  const filled = new Map<CanonicalField, string | null>();
  const records = new Map<string, CurriculumRecord>(); // dedupe by sourceKey
  const lessonRows = new Map<string, ParsedCurriculumRow>(); // dedupe by lesson_key
  let skippedLessonRows = 0;
  let nonInstructional = 0;
  let refSeen = false;

  const hasWeekCol = byField.has('week');
  const hasPeriodCol = byField.has('period');

  for (let r = headerRow + 1; r < nRows; r++) {
    // Skip header-block meta rows (the "Description"/"الوصف" row sits just below the
    // header; band rows sit above it) so they never emit a bogus record.
    if (META_MARKERS.includes(normalizeHeader(firstNonEmpty(grid[r])))) continue;

    // Refresh forward-fill state: any non-blank cell starts a new group.
    for (const f of FILL_FIELDS) {
      const v = rawAt(r, f);
      if (v != null) filled.set(f, v);
    }

    const value = (f: CanonicalField): string | null =>
      FILL_FIELDS.includes(f) ? (filled.get(f) ?? rawAt(r, f)) : rawAt(r, f);

    // Detect #REF! in any mapped value column (for the report).
    for (const [, m] of byField) {
      if (isErrorText(cellAt(grid, r, m.col).text)) refSeen = true;
    }

    const rawPeriod = rawAt(r, 'period');
    const rawDaily = rawAt(r, 'dailyLearningOutcome');
    const rawWeek = rawAt(r, 'week');
    const rawWeeklySkill = rawAt(r, 'weeklySkillLearningOutcome');
    const rawWeeklyKnowledge = rawAt(r, 'weeklyKnowledgeLearningOutcome');

    const emit =
      grain === 'daily'
        ? rawPeriod != null || rawDaily != null
        : hasWeekCol
          ? rawWeek != null
          : rawWeeklySkill != null || rawWeeklyKnowledge != null || rawAt(r, 'topic') != null;
    if (!emit) continue;

    const yearLabel = value('year');
    const yearIndex = parseYearIndex(yearLabel);
    const month = value('month');
    const week = toInt(value('week'));
    const periodLabel = grain === 'daily' ? rawPeriod : null;
    const periodNumber = grain === 'daily' ? parsePeriodNumber(rawPeriod) : null;
    if (grain === 'daily' && periodLabel != null && periodNumber == null) nonInstructional++;

    const resourceText = rawAt(r, 'resources');
    const resourceUrl = urlAt(r, 'resources') ?? extractUrl(resourceText);

    const periodPart =
      periodNumber != null ? `p${periodNumber}` : periodLabel ? `p:${slug(periodLabel)}` : 'wk';
    const yearKey = yearIndex != null ? `y${yearIndex}` : `l:${normalizeHeader(yearLabel ?? '')}`;
    const sourceKey = createHash('sha1')
      .update(
        [subjectCode, yearKey, (month ?? '').toLowerCase(), week != null ? `w${week}` : 'w-', periodPart].join('|'),
      )
      .digest('hex')
      .slice(0, 16);

    const record: CurriculumRecord = {
      subject: subjectConst,
      subjectLearningOutcome: subjectLOConst,
      yearLabel: yearLabel ?? '',
      yearIndex,
      annualLearningOutcome: value('annualLearningOutcome'),
      month,
      monthlyLearningOutcome: value('monthlyLearningOutcome'),
      monthlySkillLearningOutcome: value('monthlySkillLearningOutcome'),
      monthlyKnowledgeLearningOutcome: value('monthlyKnowledgeLearningOutcome'),
      week,
      weeklySkillLearningOutcome: hasWeekCol ? value('weeklySkillLearningOutcome') : rawWeeklySkill,
      weeklyKnowledgeLearningOutcome: hasWeekCol
        ? value('weeklyKnowledgeLearningOutcome')
        : rawWeeklyKnowledge,
      period: periodLabel,
      periodNumber,
      dailyLearningOutcome: rawDaily,
      resourceText,
      resourceUrl,
      topic: value('topic'),
      focusArea: value('focusArea'),
      grammarVocabulary: rawAt(r, 'grammarVocabulary'),
      lessonIdentifier: rawAt(r, 'lessonIdentifier'),
      grain,
      sourceKey,
      sourceRow: r + 1,
    };
    records.set(sourceKey, record);

    // Write to curriculum_lesson. The table keeps year/month/week NOT NULL (only
    // `period` was made nullable), so a row needs full nav to be written: a valid
    // year index (0..6), a month, and a week. Daily-grain instructional rows carry a
    // numeric period; weekly-grain (Awareness) and non-instructional (Baseline/
    // Orientation/Evaluation) rows are written with period = NULL and a sentinel
    // lesson_key. Rows that can't satisfy the nav are surfaced and skipped.
    if (yearIndex != null && yearIndex >= 0 && yearIndex <= 6 && month != null && week != null) {
      const periodForKey = grain === 'daily' ? periodNumber : null;
      const lessonKey = buildLessonKey(
        subjectCode,
        yearIndex,
        month,
        week,
        periodForKey,
        periodLabel,
      );
      lessonRows.set(lessonKey, {
        subject_code: subjectCode,
        year: yearIndex,
        month,
        week,
        period: periodForKey,
        lesson_key: lessonKey,
        daily_outcome: rawDaily,
        focus_area: rawAt(r, 'focusArea'),
        linguistic_skill: rawAt(r, 'linguisticSkill'),
        theme: rawAt(r, 'theme') ?? rawAt(r, 'topic'),
        resources: parseResources(resourceText, resourceUrl),
        taxonomy_id: rawAt(r, 'lessonIdentifier'),
        monthly_knowledge_lo: value('monthlyKnowledgeLearningOutcome'),
        monthly_skills_lo: value('monthlySkillLearningOutcome'),
        weekly_knowledge_lo: hasWeekCol
          ? value('weeklyKnowledgeLearningOutcome')
          : rawWeeklyKnowledge,
        weekly_skills_lo: hasWeekCol ? value('weeklySkillLearningOutcome') : rawWeeklySkill,
        grammar_vocabulary: rawAt(r, 'grammarVocabulary'),
        monthly_lo: value('monthlyLearningOutcome'),
      });
    } else {
      skippedLessonRows++;
    }
  }

  const recordList = [...records.values()];
  const report = buildReport({
    fileName: opts.fileName ?? '',
    selectedSheet: chosen.name,
    candidateSheets,
    ambiguous,
    headerRow: headerRow + 1,
    grain,
    match,
    hasPeriodCol,
    records: recordList,
    nonInstructional,
    refSeen,
    skippedLessonRows,
  });

  return { records: recordList, report, lessonRows: [...lessonRows.values()], skippedLessonRows };
}

// ── Report ──────────────────────────────────────────────────────────────────────

interface ReportArgs {
  fileName: string;
  selectedSheet: string;
  candidateSheets: string[];
  ambiguous: boolean;
  headerRow: number;
  grain: Grain;
  match: MatchResult;
  hasPeriodCol: boolean;
  records: CurriculumRecord[];
  nonInstructional: number;
  refSeen: boolean;
  skippedLessonRows: number;
}

/** Canonical fields we generally expect to find; absence is reported. */
const EXPECTED_FIELDS: CanonicalField[] = [
  'subject',
  'year',
  'month',
  'week',
  'resources',
];

function buildReport(a: ReportArgs): ImportReport {
  const f = a.match.byField;
  const warnings: string[] = [];

  // Critical fields drive needsReview.
  const grainOutcomePresent =
    a.grain === 'daily'
      ? f.has('dailyLearningOutcome') || f.has('period')
      : f.has('weeklySkillLearningOutcome') || f.has('weeklyKnowledgeLearningOutcome');
  const missingCritical = !f.has('year') || !f.has('month') || !grainOutcomePresent;

  const criticalFields: CanonicalField[] = [
    'year',
    'month',
    ...(a.grain === 'daily'
      ? (['dailyLearningOutcome'] as CanonicalField[])
      : (['weeklySkillLearningOutcome', 'weeklyKnowledgeLearningOutcome'] as CanonicalField[])),
  ];
  const lowConfidence = criticalFields.some((cf) => {
    const m = f.get(cf);
    return m != null && m.confidence < 0.9;
  });

  const expected = [
    ...EXPECTED_FIELDS,
    a.grain === 'daily' ? 'dailyLearningOutcome' : 'weeklySkillLearningOutcome',
  ] as CanonicalField[];
  const missingFields = expected.filter((cf) => !f.has(cf));

  if (a.ambiguous) {
    warnings.push(
      `Multiple curriculum-shaped sheets; selected "${a.selectedSheet}". Candidates: ${a.candidateSheets.join(', ')}.`,
    );
  }
  if (a.grain === 'weekly') {
    warnings.push('No period/daily column found — parsed at weekly grain (one record per week).');
  }
  if (a.nonInstructional > 0) {
    warnings.push(
      `${a.nonInstructional} non-instructional rows kept with null daily outcome/period.`,
    );
  }
  if (a.refSeen) {
    warnings.push('Spreadsheet error (#REF!/#N/A) seen in mapped value cells; collapsed to null.');
  }
  if (a.skippedLessonRows > 0) {
    warnings.push(
      `${a.skippedLessonRows} records lack the year/month/week needed by curriculum_lesson (NOT NULL) and are not written.`,
    );
  }
  for (const cf of criticalFields) {
    const m = f.get(cf);
    if (m != null && m.confidence < 0.9) {
      warnings.push(`Critical field "${cf}" mapped at ${m.confidence} confidence ("${m.header}").`);
    }
  }

  return {
    fileName: a.fileName,
    selectedSheet: a.selectedSheet,
    candidateSheets: a.candidateSheets,
    needsReview: a.ambiguous || missingCritical || lowConfidence,
    headerRow: a.headerRow,
    grain: a.grain,
    columnMap: a.match.columnMap,
    unmappedHeaders: a.match.unmappedHeaders,
    missingFields,
    rowCount: a.records.length,
    warnings,
    sampleRecords: a.records.slice(0, 5),
  };
}
