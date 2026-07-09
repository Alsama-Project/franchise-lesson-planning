import { keyString, normalizeMonth, normalizePeriod, normalizeWeek, normalizeYear, type NaturalKey } from './normalize';

// ── App-side loader: the DB gold master (exported `curriculum_lesson`) ────────────
//
// The audit diffs the independent Excel extraction against the ACTUAL app data — the
// exported `curriculum_lesson` rows (the "gold master"), never a re-parse of the
// workbook (that would only prove parser == extractor, not app == source). The natural
// key is rebuilt from the year/month/week/period COLUMNS, never from the stored
// `lesson_key`, so the audit owns both sides of the key.
//
// A self-contained RFC-4180 CSV reader lives here (the exports carry multi-line quoted
// LO text, doubled quotes, a UTF-8 BOM, and literal `null` tokens for SQL NULL) so the
// audit depends on no other module's parsing.

/** Parse CSV text into a matrix of raw string cells (BOM-stripped). */
function parseMatrix(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** CSV → records keyed by the header row. Empty cells and the literal `null` → null. */
export function parseCsvRecords(text: string): Record<string, string | null>[] {
  const rows = parseMatrix(text).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string | null>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const rec: Record<string, string | null> = {};
    for (let c = 0; c < header.length; c++) {
      const raw = rows[r][c] ?? '';
      rec[header[c]] = raw === '' || raw === 'null' ? null : raw;
    }
    out.push(rec);
  }
  return out;
}

/** One app-side (DB) lesson row, keyed by the column-derived natural key. */
export interface AppRow {
  key: NaturalKey;
  keyStr: string;
  lessonKey: string | null;
  dailyOutcome: string | null;
  fields: Record<string, string | null>;
}

/** DB gold-master columns the audit may diff (besides the primary daily_outcome). */
const FIELD_COLUMNS = [
  'weekly_skills_lo',
  'weekly_knowledge_lo',
  'monthly_lo',
  'monthly_skills_lo',
  'monthly_knowledge_lo',
  'grammar_vocabulary',
  'theme',
  'linguistic_skill',
] as const;

/** Parse gold-master CSV text into app rows for a subject (key rebuilt from columns).
 *  Filters by `subject_code`, so a single COMBINED export (all subjects in one CSV) is
 *  scoped correctly and never bleeds another subject's rows in. */
export function loadAppGoldText(subject: string, text: string): AppRow[] {
  return parseCsvRecords(text)
    .filter((r) => (r.subject_code ?? subject) === subject)
    .map((r) => {
    const year = normalizeYear(r.year) ?? 0;
    const month = normalizeMonth(r.month) ?? '';
    const week = normalizeWeek(r.week) ?? 0;
    const period = normalizePeriod(r.period);
    const key: NaturalKey = { subject, year, month, week, period };
    const fields: Record<string, string | null> = {};
    for (const col of FIELD_COLUMNS) fields[col] = r[col] ?? null;
    return {
      key,
      keyStr: keyString(key),
      lessonKey: r.lesson_key ?? null,
      dailyOutcome: r.daily_outcome ?? null,
      fields,
    };
  });
}
