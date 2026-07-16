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

/**
 * Canonical sheet per subject — a pin for workbooks that ship MULTIPLE VISIBLE
 * curriculum-shaped sheets that the shape heuristic can't disambiguate. Arabic ships two
 * full curricula (`Arabic Curriculum (2)` is the live one; the other holds taxonomy-code
 * junk) so it is pinned. When set, this sheet is used and MUST exist — a rename throws
 * rather than silently falling back to a wrong draft and orphaning live plans. An
 * explicit `opts.sheet` still overrides.
 *
 * NOT for disambiguating draft VERSIONS by visibility — hidden/very-hidden tabs are
 * archived legacy versions and are excluded from selection outright (see selectSheet), so
 * they never need a pin. Professionalism was previously pinned here to `V1`, which turned
 * out to be a HIDDEN, stale sheet: the visible current sheet is `V4`. Removing the pin
 * lets selectSheet choose the single visible sheet (V4), and the hidden-sheet guard makes
 * ingesting a stale hidden tab impossible.
 */
const CANONICAL_SHEET: Record<string, string> = {
  arabic: 'Arabic Curriculum (2)',
};

// ── English weekly-field cleanups (live-DB provenance, NOT migration 0024) ─────────
//
// The live English rows carry two manual cleanups applied by out-of-band SQL that was
// never committed as a migration (0024 backfilled only monthly_lo + grammar_vocabulary;
// it never touched the weekly fields). They are encoded HERE, in the parser, so the real
// ingest path (UI upload / the import endpoint) reproduces them — a raw re-parse emits
// already-cleaned values, and a re-import never reverts them.

/**
 * Strip a trailing `|<skill>` tag from an English weekly_knowledge_lo
 * (e.g. "…present simple tense.|Reading"), absorbing any trailing whitespace/newlines
 * before the pipe. Empties collapse to null.
 */
export function cleanEnglishWeeklyKnowledgeLo(value: string | null): string | null {
  if (value == null) return null;
  const stripped = value.replace(/\s*\|\s*[A-Za-z]+\s*$/u, '').replace(/\s+$/u, '');
  return stripped === '' ? null : stripped;
}

/** Null out a numeric-only English weekly_skills_lo (e.g. "23") — a stray source artefact. */
export function cleanEnglishWeeklySkillsLo(value: string | null): string | null {
  if (value == null) return null;
  return /^\s*\d+(\.\d+)?\s*$/.test(value) ? null : value;
}

// ── Weekly-shape per-lesson outcome ───────────────────────────────────────────────
//
// Weekly-shape subjects (Awareness, Yoga) have NO Daily-LO column, so the app's
// per-lesson outcome field — `daily_outcome`, which every reader resolves the lesson's
// outcome from (curriculumUtils, curriculum-browse, the gaps `missing` classifier) —
// would be null for every row and each row classifies `missing`. Their real per-lesson
// outcome lives in the weekly columns instead. Resolve it here: Weekly Skill LO primary,
// Weekly Knowledge LO appended on a newline when present. Both stay verbatim in
// weekly_skills_lo / weekly_knowledge_lo, so this is a lossless display convenience.
// Returns null only when BOTH are empty (that row stays `missing` — flagged, not a
// whole-import drop). This runs ONLY when the sheet has no Daily-LO column, so daily
// subjects (English et al.) are byte-for-byte unchanged, even where a daily cell is blank.
export function composeWeeklyOutcome(skill: string | null, knowledge: string | null): string | null {
  if (skill) return knowledge ? `${skill}\n${knowledge}` : skill;
  return knowledge ?? null;
}

// ── Non-lesson marker rows (collision classification only) ─────────────────────────
//
// A curriculum sheet carries a few non-instructional rows — a bare "Period N" label, a
// blank period-null spacer, or a named marker (Orientation / Evaluation / Baseline /
// Holiday). When two rows collapse onto one lesson_key, we must distinguish a benign
// marker collision (leave the legacy last-wins behaviour — junk-heavy imports must not
// break) from a GENUINE collision between two real lessons (which we refuse to resolve
// silently). This predicate is used ONLY for that decision — never to drop a real
// lesson, and the named patterns are START-anchored whole-word so a real outcome that
// merely mentions "evaluate…" is never misread as a marker.
const PERIOD_LABEL_RE = /^period\s*\d+$/i;
const MARKER_OUTCOME_RE =
  /^\s*(orientation|evaluation|baseline|holiday|revision|assessment|mid-?term|end[- ]of[- ]term)\b/i;

export function isNonLessonMarker(dailyOutcome: string | null, period: number | null): boolean {
  const d = (dailyOutcome ?? '').trim();
  if (PERIOD_LABEL_RE.test(d)) return true;
  if (period == null && (d === '' || MARKER_OUTCOME_RE.test(d))) return true;
  return false;
}

// ── Inline monthly Knowledge/Skills split (maths, science, it, arabic) ────────────
//
// English populates a combined "Monthly Learning Outcome" cell and the browse UI splits
// it by bare `Skills`/`Knowledge` heading lines. Maths/Science/IT/Arabic instead bake
// the split INTO the combined cell with inline labels — "Monthly Knowledge: … Monthly
// Skills: …", "Knowledge Learning Outcome: … Skills Learning Outcome: …", or Arabic
// "المعرفة : … المهارات : …" — which that UI splitter doesn't recognise, so it renders
// one undifferentiated blob. We split the cell into monthly_knowledge_lo /
// monthly_skills_lo (the fields the UI prefers when populated), producing the same two
// columns as Professionalism (which already ships separate columns).
//
// Deliberately TOLERANT and GUARDED: labels are matched case-insensitively, line-
// anchored, order-independent (Arabic is Skills→Knowledge), with optional "Monthly" /
// "Learning Outcome(s)" and optional colon, and content may sit on the label line
// (space-run separator) or the lines below. We only split when BOTH a Knowledge and a
// Skills section are found WITH content; otherwise we return null and the row keeps its
// combined monthly_lo unchanged (identical to today — no regression). Typos, single-
// section, and freeform rows therefore fall through to the one-column view rather than
// getting mis-attributed text. monthly_lo is always preserved regardless.

/** Subjects whose combined monthly cell carries inline Knowledge/Skills labels.
 *  Professionalism (V4) ships the same inline-labelled shape — labels alone on their
 *  own line, prose on the following line — so it is split here too; English is absent
 *  because its combined cell uses bare `Skills`/`Knowledge` heading lines that the
 *  browse renderer splits at read time instead. */
const MONTHLY_SPLIT_SUBJECTS = new Set(['maths', 'science', 'it', 'arabic', 'professionalism']);

const KNOWLEDGE_LABEL = /^\s*(?:monthly\s+)?knowledge(?:\s+learning\s+outcomes?)?\s*(?::|$)/i;
const SKILLS_LABEL = /^\s*(?:monthly\s+)?skills?(?:\s+learning\s+outcomes?)?\s*(?::|$)/i;
const AR_KNOWLEDGE_LABEL = /^\s*(?:ال)?معرفة\s*(?::|$)/;
const AR_SKILLS_LABEL = /^\s*(?:ال)?مهارات\s*(?::|$)/;

/** Match a monthly section label at the START of a line; return its section + the
 *  content that follows the label on the same line (space-run / "label: text" case). */
function matchMonthlyLabel(line: string): { section: 'knowledge' | 'skills'; rest: string } | null {
  const k = KNOWLEDGE_LABEL.exec(line) ?? AR_KNOWLEDGE_LABEL.exec(line);
  if (k) return { section: 'knowledge', rest: line.slice(k[0].length).trim() };
  const s = SKILLS_LABEL.exec(line) ?? AR_SKILLS_LABEL.exec(line);
  if (s) return { section: 'skills', rest: line.slice(s[0].length).trim() };
  return null;
}

/**
 * Split an inline-labelled combined monthly cell into { knowledge, skills }. Returns
 * null (→ leave monthly_lo combined) unless BOTH sections are present with content.
 */
export function splitInlineMonthly(
  subjectCode: string,
  text: string | null,
): { knowledge: string; skills: string } | null {
  if (!MONTHLY_SPLIT_SUBJECTS.has(subjectCode) || !text) return null;
  const buf: Record<'knowledge' | 'skills', string[]> = { knowledge: [], skills: [] };
  let current: 'knowledge' | 'skills' | null = null;
  let sawKnowledge = false;
  let sawSkills = false;
  for (const raw of text.split(/\r?\n/)) {
    const label = matchMonthlyLabel(raw);
    if (label) {
      current = label.section;
      if (label.section === 'knowledge') sawKnowledge = true;
      else sawSkills = true;
      if (label.rest) buf[current].push(label.rest);
      continue;
    }
    if (current) {
      const line = raw.replace(/\r$/, '').trimEnd();
      if (line.trim()) buf[current].push(line);
    }
  }
  if (!sawKnowledge || !sawSkills) return null; // both-labels-required guard
  const knowledge = buf.knowledge.join('\n').trim();
  const skills = buf.skills.join('\n').trim();
  if (!knowledge || !skills) return null;
  return { knowledge, skills };
}

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

interface SheetSelection {
  chosen: SheetEval;
  candidateSheets: string[];
  ambiguous: boolean;
}

/**
 * Per-sheet visibility, by name. SheetJS records it on `workbook.Workbook.Sheets`
 * (index-aligned with `SheetNames`): Hidden 0 = visible, 1 = hidden, 2 = veryHidden.
 * Absent metadata is treated as visible.
 */
function sheetVisibility(workbook: XLSX.WorkBook): Map<string, number> {
  const vis = new Map<string, number>();
  const meta = workbook.Workbook?.Sheets ?? [];
  workbook.SheetNames.forEach((name, i) => vis.set(name, meta[i]?.Hidden ?? 0));
  return vis;
}

/**
 * Choose the curriculum sheet — from the VISIBLE sheets only. Hidden / very-hidden tabs
 * are archived legacy versions by convention here (e.g. professionalism ships `V4`
 * visible with `V1`/`V2`/`Detail*` hidden), so they are never eligible: the heuristic
 * ignores them, and an explicit request (`CANONICAL_SHEET` / `opts.sheet`) that resolves
 * to a hidden sheet THROWS rather than silently ingesting stale content — the guard that
 * makes ingesting a hidden, stale sheet structurally impossible. If zero or more than one
 * visible curriculum-shaped sheet remains, we STOP rather than guess (pin the right one).
 */
function selectSheet(workbook: XLSX.WorkBook, requested?: string): SheetSelection {
  const vis = sheetVisibility(workbook);
  const isHidden = (name: string): boolean => (vis.get(name) ?? 0) !== 0;
  const hiddenLabel = (name: string): string => (vis.get(name) === 2 ? 'very hidden' : 'hidden');

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
    // A hidden sheet is an archived legacy version — never ingest it, even when pinned.
    if (isHidden(ev.name)) {
      throw new Error(
        `Requested sheet "${ev.name}" is ${hiddenLabel(ev.name)}; hidden sheets are archived ` +
          `legacy versions and must not be ingested. Point at the visible curriculum sheet.`,
      );
    }
    const others = evals
      .filter((e) => e.shaped && !isHidden(e.name) && e.name !== ev.name)
      .map((e) => e.name);
    return { chosen: ev, candidateSheets: others, ambiguous: false };
  }

  // Heuristic: only VISIBLE curriculum-shaped sheets are eligible, so a stale hidden draft
  // can never be chosen. We do NOT rank multiple candidates — if more than one visible
  // curriculum sheet survives, that is genuinely ambiguous and must be pinned, not guessed.
  const shaped = evals.filter((e) => e.shaped && !isHidden(e.name));
  if (shaped.length === 0) {
    const hiddenShaped = evals.filter((e) => e.shaped).map((e) => e.name);
    throw new Error(
      'Could not find a VISIBLE curriculum sheet mapping Subject/Year/Month and a ' +
        `learning-outcome column.${
          hiddenShaped.length ? ` Only hidden curriculum sheets exist: ${hiddenShaped.join(', ')}.` : ''
        }`,
    );
  }
  if (shaped.length > 1) {
    throw new Error(
      `Ambiguous: ${shaped.length} visible curriculum-shaped sheets (${shaped
        .map((e) => e.name)
        .join(', ')}). Pin the correct one in CANONICAL_SHEET or pass opts.sheet.`,
    );
  }
  return { chosen: shaped[0], candidateSheets: [], ambiguous: false };
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

  // Explicit sheet wins; else the subject's pinned canonical sheet (throws if renamed);
  // else the shape heuristic. See CANONICAL_SHEET.
  const requestedSheet = opts.sheet ?? CANONICAL_SHEET[subjectCode];
  const { chosen, candidateSheets, ambiguous } = selectSheet(workbook, requestedSheet);
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
  // A sheet with no Daily-LO column is a weekly-shape subject (Awareness, Yoga): its
  // per-lesson outcome (`daily_outcome`) is resolved from the weekly columns below.
  // Gated at sheet level (not per-row) so a daily sheet's occasional blank daily cell
  // is never backfilled from week-level LOs.
  const hasDailyOutcomeCol = byField.has('dailyLearningOutcome');

  // English weekly-field cleanups run on the ingest path itself (see the functions'
  // provenance note) — no-ops for every other subject.
  const isEnglish = subjectCode === 'english';
  const cleanWeeklyKnowledge = (v: string | null): string | null =>
    isEnglish ? cleanEnglishWeeklyKnowledgeLo(v) : v;
  const cleanWeeklySkills = (v: string | null): string | null =>
    isEnglish ? cleanEnglishWeeklySkillsLo(v) : v;

  // Forward-fill the weekly Skill/Knowledge columns ONLY for daily-grain subjects, where
  // they are merged across a week's period rows (value on Period 1, blank on 2–5). A
  // weekly-shape subject (no Daily-LO column — Yoga, Awareness) has one row per week, so a
  // blank weekly cell is genuinely empty and must NOT inherit the previous week's value
  // (that invented Yoga's assessment-week knowledge). Read those per-row instead.
  const fillWeeklyLo = hasDailyOutcomeCol;

  // Week-reset (Part b) tracks the previous row's period so a period restart with a blank
  // Week cell can refuse to inherit the prior block's week (see the loop body).
  let prevPeriodNumber: number | null = null;
  // Rows dropped because a period cycle had a blank Week cell (reported for re-labelling).
  const droppedBlankWeekRows: number[] = [];
  // GENUINE lesson_key collisions (real distinct lessons → one key): the key is dropped
  // (never silently overwritten) and every colliding source row is reported.
  const droppedCollisionKeys = new Set<string>();
  const collisionKeyRows = new Map<string, number[]>();
  let benignMarkerCollisions = 0;
  // Exact-duplicate source rows (same key AND same content) — a harmless copy-paste, kept
  // once (no data lost, so NOT dropped), counted for a hygiene note.
  let duplicateRows = 0;

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

    // ── Week-reset (Part b) ──────────────────────────────────────────────────────
    // At a period restart (a fresh Period 1, or a period ≤ the previous one) whose Week
    // cell is BLANK, do NOT inherit the previous block's week. A sheet that labels the
    // week on every row (Science) has genuinely-empty Year/Week blocks; letting them
    // inherit the prior week silently overwrote real lessons. Clearing the fill drops such
    // a block to a null week (reported below) instead. Scoped to `week` ONLY — Year/Month
    // legitimately span multiple weeks (English labels the year once), so they keep
    // forward-filling. No-op for the merged daily subjects: their week is always labelled
    // on the Period-1 row (verified — zero blank-week Period-1 rows across all five).
    const restartPeriod = grain === 'daily' ? parsePeriodNumber(rawPeriod) : null;
    const isPeriodRestart =
      restartPeriod != null &&
      (restartPeriod === 1 || (prevPeriodNumber != null && restartPeriod <= prevPeriodNumber));
    if (isPeriodRestart && rawWeek == null) filled.delete('week');
    if (restartPeriod != null) prevPeriodNumber = restartPeriod;

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
      weeklySkillLearningOutcome: fillWeeklyLo ? value('weeklySkillLearningOutcome') : rawWeeklySkill,
      weeklyKnowledgeLearningOutcome: fillWeeklyLo
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
      const monthlySplit = splitInlineMonthly(subjectCode, value('monthlyLearningOutcome'));
      // Resolve the weekly outcome columns once — reused verbatim for the weekly_* fields
      // and (for weekly-shape sheets with no Daily-LO column) as the per-lesson daily_outcome.
      const weeklySkillsResolved = cleanWeeklySkills(
        fillWeeklyLo ? value('weeklySkillLearningOutcome') : rawWeeklySkill,
      );
      const weeklyKnowledgeResolved = cleanWeeklyKnowledge(
        fillWeeklyLo ? value('weeklyKnowledgeLearningOutcome') : rawWeeklyKnowledge,
      );
      const newRow: ParsedCurriculumRow = {
        subject_code: subjectCode,
        year: yearIndex,
        month,
        week,
        period: periodForKey,
        lesson_key: lessonKey,
        // Daily sheets read the Daily-LO column verbatim (unchanged). Weekly-shape sheets
        // (no Daily-LO column — Awareness, Yoga) resolve the outcome from the weekly columns.
        daily_outcome: hasDailyOutcomeCol
          ? rawDaily
          : composeWeeklyOutcome(weeklySkillsResolved, weeklyKnowledgeResolved),
        focus_area: rawAt(r, 'focusArea'),
        linguistic_skill: rawAt(r, 'linguisticSkill'),
        theme: rawAt(r, 'theme') ?? rawAt(r, 'topic'),
        resources: parseResources(resourceText, resourceUrl),
        taxonomy_id: rawAt(r, 'lessonIdentifier'),
        // Maths/Science/IT/Arabic bake Knowledge/Skills into the combined monthly cell
        // with inline labels; split them into the separate columns the browse UI prefers
        // (monthly_lo is preserved below). Falls back to the mapped split columns
        // (Professionalism) or null when no inline split applies.
        monthly_knowledge_lo: monthlySplit
          ? monthlySplit.knowledge
          : value('monthlyKnowledgeLearningOutcome'),
        monthly_skills_lo: monthlySplit
          ? monthlySplit.skills
          : value('monthlySkillLearningOutcome'),
        weekly_knowledge_lo: weeklyKnowledgeResolved,
        weekly_skills_lo: weeklySkillsResolved,
        grammar_vocabulary: rawAt(r, 'grammarVocabulary'),
        monthly_lo: value('monthlyLearningOutcome'),
        // Subject-level LO is a sheet constant; annual LO is a forward-filled per-year
        // column. Both denormalise onto every row of their scope (see migration 0049).
        subject_learning_outcome: subjectLOConst,
        annual_learning_outcome: value('annualLearningOutcome'),
        // 1-based source sheet row (same value carried on the canonical record above),
        // persisted for the Curriculum Gaps reconcile page (migration 0054).
        source_row: r + 1,
      };

      // ── Collision handling (Part c) ──────────────────────────────────────────────
      // Never silently overwrite a lesson. A benign marker collision keeps the legacy
      // last-wins behaviour (a "Period N"/Orientation/blank spacer row must not break a
      // junk-heavy import); a GENUINE collision between two real lessons drops the key
      // entirely and reports every colliding source row — nothing is silently lost, and we
      // never invent a synthetic distinct key. The dropped lessons return the moment the
      // source adds the missing period labels.
      if (droppedCollisionKeys.has(lessonKey)) {
        collisionKeyRows.get(lessonKey)!.push(r + 1);
      } else {
        const existing = lessonRows.get(lessonKey);
        if (!existing) {
          lessonRows.set(lessonKey, newRow);
        } else if (
          isNonLessonMarker(newRow.daily_outcome, periodForKey) ||
          isNonLessonMarker(existing.daily_outcome, existing.period)
        ) {
          benignMarkerCollisions++;
          lessonRows.set(lessonKey, newRow); // legacy last-wins for structural markers
        } else if (
          existing.daily_outcome === newRow.daily_outcome &&
          existing.weekly_skills_lo === newRow.weekly_skills_lo &&
          existing.weekly_knowledge_lo === newRow.weekly_knowledge_lo
        ) {
          // Exact duplicate (same key, same content — a source copy-paste). Keep the one
          // already held: identical, so nothing is lost and the choice isn't "arbitrary".
          duplicateRows++;
        } else {
          // GENUINE collision — two DISTINCT lessons share a key. Drop the key entirely and
          // report every colliding row; never keep an arbitrary one, never invent a key.
          droppedCollisionKeys.add(lessonKey);
          collisionKeyRows.set(lessonKey, [
            ...(existing.source_row != null ? [existing.source_row] : []),
            r + 1,
          ]);
          lessonRows.delete(lessonKey);
        }
      }
    } else {
      skippedLessonRows++;
      // A daily row with year+month+period resolved but a null week is a blank-Week block
      // cleared by the week-reset above — surface it for re-labelling (Part b).
      if (
        yearIndex != null &&
        yearIndex >= 0 &&
        yearIndex <= 6 &&
        month != null &&
        week == null &&
        periodNumber != null
      ) {
        droppedBlankWeekRows.push(r + 1);
      }
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
    droppedBlankWeekRows,
    droppedCollisions: [...collisionKeyRows.entries()].map(([key, rows]) => ({ key, rows })),
    benignMarkerCollisions,
    duplicateRows,
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
  droppedBlankWeekRows: number[];
  droppedCollisions: { key: string; rows: number[] }[];
  benignMarkerCollisions: number;
  duplicateRows: number;
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
  if (a.droppedCollisions.length > 0) {
    const rowTotal = a.droppedCollisions.reduce((n, c) => n + c.rows.length, 0);
    warnings.push(
      `${a.droppedCollisions.length} lesson_key(s) had a GENUINE collision (${rowTotal} real lessons ` +
        `share a key — usually missing period labels, so a week's periods all key to "…|wk"). Those ` +
        `keys were DROPPED, not written: nothing silently overwritten, nothing invented. Add the ` +
        `period labels and re-import to restore them. e.g. ` +
        a.droppedCollisions
          .slice(0, 3)
          .map((c) => `${c.key} (source rows ${c.rows.join(', ')})`)
          .join('; '),
    );
  }
  if (a.droppedBlankWeekRows.length > 0) {
    const sample = a.droppedBlankWeekRows.slice(0, 20).join(', ');
    warnings.push(
      `${a.droppedBlankWeekRows.length} lesson(s) DROPPED for a blank Week cell at a period restart ` +
        `(the source did not label the week, so it was not inherited from the previous block — which ` +
        `would have clobbered that week). Add the week label to these source rows and re-import: ` +
        `${sample}${a.droppedBlankWeekRows.length > 20 ? ` …(+${a.droppedBlankWeekRows.length - 20} more)` : ''}`,
    );
  }
  if (a.duplicateRows > 0) {
    warnings.push(
      `${a.duplicateRows} exact-duplicate source row(s) (same lesson_key AND identical content — ` +
        `a copy-paste in the source) kept once; no data lost. Consider removing the duplicates.`,
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
    droppedBlankWeekRows: a.droppedBlankWeekRows,
    droppedCollisions: a.droppedCollisions,
  };
}
