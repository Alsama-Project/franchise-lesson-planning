import * as XLSX from 'xlsx';
import {
  keyString,
  normalizeMonth,
  normalizePeriod,
  normalizeWeek,
  normalizeYear,
  type NaturalKey,
} from './normalize';
import type { OutcomeRule, PinnedMapping } from './pinned-map';

// ── Independent raw-cell extractor ────────────────────────────────────────────────
//
// Reads a curriculum workbook using ONLY explicit A1 coordinates from a PinnedMapping.
// It imports nothing from the ingest parser (no columnMatcher, no header detection, no
// alias scoring, no parse.ts forward-fill) — it re-implements the small amount of
// source-shape handling it needs (merged-cell forward-fill, error-sentinel blanking)
// from scratch, so a diff it produces can never be an echo of a parser bug.
//
// SheetJS is used purely as a raw cell reader here (address → cell → text); the audit's
// independence is guaranteed by using only human-pinned addresses and zero parser code,
// not by the choice of xlsx library.

/** Spreadsheet error sentinels (and literal "#N/A"): an error cell is an empty cell. */
const ERROR_SENTINEL_RE = /^#(REF|VALUE|N\/?A|NAME|DIV\/?0|NULL|NUM)[!?]?$/i;

/** 0-based column index for an Excel column letter (`'R'` → 17). */
function colIndex(letter: string): number {
  return XLSX.utils.decode_col(letter);
}

/**
 * Raw display text of a cell, or null. Preserves internal formatting/whitespace (so
 * Tier-0 can catch whitespace noise) but blanks empties and error sentinels — both of
 * which the DB stores as SQL NULL, so keeping them would manufacture false diffs.
 */
function cellText(sheet: XLSX.WorkSheet, r0: number, c0: number): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ r: r0, c: c0 })] as XLSX.CellObject | undefined;
  if (!cell) return null;
  const t = cell.w != null ? String(cell.w) : cell.v != null ? String(cell.v) : null;
  if (t == null) return null;
  const trimmed = t.trim();
  if (trimmed === '' || ERROR_SENTINEL_RE.test(trimmed)) return null;
  return t;
}

/** Apply an outcome rule to a per-column value getter (used for outcome + candidates). */
export function applyOutcomeRule(
  rule: OutcomeRule,
  valueOf: (col: string) => string | null,
): string | null {
  if (rule.kind === 'single') return valueOf(rule.col);
  const parts = rule.cols.map(valueOf).filter((v): v is string => v != null && v !== '');
  return parts.length ? parts.join(rule.separator) : null;
}

/** One extracted source lesson: its column-derived key plus the raw values it needs. */
export interface ExtractedRow {
  key: NaturalKey;
  keyStr: string;
  /** Outcome per the pinned rule, RAW (un-normalised — tiers are applied at diff time). */
  outcome: string | null;
  /** 1-based source row number, for reporting. */
  sourceRow: number;
  /** Resolved (forward-filled where applicable) raw value per column of interest. */
  values: Record<string, string | null>;
}

export interface ExtractResult {
  subject: string;
  sheet: string;
  headerRow: number;
  firstDataRow: number;
  rows: ExtractedRow[];
  /** Source rows below firstDataRow that did not resolve a full natural key (skipped). */
  skipped: number;
  /** Natural keys that appear on >1 source row (source anomaly — DB key is unique). */
  duplicateKeys: { keyStr: string; sourceRows: number[] }[];
}

/** Every column letter the pin references (key + outcome + fields + candidates). */
function columnsOfInterest(pin: PinnedMapping): string[] {
  const cols = new Set<string>();
  cols.add(pin.key.year);
  cols.add(pin.key.month);
  cols.add(pin.key.week);
  if (pin.key.period) cols.add(pin.key.period);
  const addRule = (rule: OutcomeRule) => {
    if (rule.kind === 'single') cols.add(rule.col);
    else rule.cols.forEach((c) => cols.add(c));
  };
  addRule(pin.outcome);
  for (const c of Object.values(pin.fields ?? {})) if (c) cols.add(c);
  for (const cand of pin.candidates) addRule(cand.rule);
  return [...cols];
}

/**
 * Extract every source lesson row for a subject using its pinned mapping. Throws if the
 * pin is not verified, or if the declared sheet is missing (a rename must fail loudly,
 * never silently fall back to a wrong tab).
 */
export function extractWorkbook(buffer: Buffer | ArrayBuffer, pin: PinnedMapping): ExtractResult {
  if (!pin.pinned) {
    throw new Error(
      `Refusing to extract "${pin.subject}": coordinates are UNPINNED. A human must ` +
        `verify sheet/header/columns against the real workbook before it can be audited.`,
    );
  }
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  const workbook = XLSX.read(data, { type: 'buffer' });
  const sheet = workbook.Sheets[pin.sheet];
  if (!sheet) {
    throw new Error(
      `Sheet "${pin.sheet}" not found in ${pin.subject} workbook (tabs: ` +
        `${workbook.SheetNames.join(', ')}). A rename must be pinned, not guessed.`,
    );
  }
  const ref = sheet['!ref'];
  const lastRow = ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0; // 1-based inclusive

  const firstDataRow = pin.firstDataRow ?? pin.headerRow + 2;
  const interest = columnsOfInterest(pin);
  const fill = new Set(pin.fillColumns);
  const lastSeen: Record<string, string | null> = {};

  const rows: ExtractedRow[] = [];
  const seen = new Map<string, number[]>();
  let skipped = 0;

  for (let sourceRow = firstDataRow; sourceRow <= lastRow; sourceRow++) {
    const r0 = sourceRow - 1;

    // Resolve every column of interest for this row, forward-filling merged columns.
    const values: Record<string, string | null> = {};
    for (const col of interest) {
      const raw = cellText(sheet, r0, colIndex(col));
      if (fill.has(col)) {
        if (raw != null) lastSeen[col] = raw;
        values[col] = lastSeen[col] ?? null;
      } else {
        values[col] = raw;
      }
    }
    const valueOf = (col: string) => values[col] ?? null;

    const year = normalizeYear(valueOf(pin.key.year));
    const month = normalizeMonth(valueOf(pin.key.month));
    const week = normalizeWeek(valueOf(pin.key.week));
    // A pinned periodOverride forces every lesson to a fixed period (yoga: the source is
    // one row per week with blank period cells, but the DB keys every row Period 1).
    const period =
      pin.periodOverride != null
        ? pin.periodOverride
        : pin.key.period
          ? normalizePeriod(valueOf(pin.key.period))
          : null;

    // A valid lesson row resolves the whole natural key. Daily grain also needs a
    // period (non-instructional rows without a period digit are not standard lessons).
    const valid =
      year != null && month != null && week != null && (pin.grain === 'weekly' || period != null);
    if (!valid) {
      skipped++;
      continue;
    }

    const key: NaturalKey = { subject: pin.subject, year, month, week, period };
    const keyStr = keyString(key);
    const collisions = seen.get(keyStr);
    if (collisions) {
      collisions.push(sourceRow);
      continue; // keep the first row for this key; record the collision
    }
    seen.set(keyStr, [sourceRow]);

    rows.push({
      key,
      keyStr,
      outcome: applyOutcomeRule(pin.outcome, valueOf),
      sourceRow,
      values,
    });
  }

  const duplicateKeys = [...seen.entries()]
    .filter(([, srcRows]) => srcRows.length > 1)
    .map(([keyStr, sourceRows]) => ({ keyStr, sourceRows }));

  return {
    subject: pin.subject,
    sheet: pin.sheet,
    headerRow: pin.headerRow,
    firstDataRow,
    rows,
    skipped,
    duplicateKeys,
  };
}
