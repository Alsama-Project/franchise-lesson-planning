// ── Independent normalization for the curriculum fidelity audit ───────────────────
//
// This module shares NO code with the ingest parser (parse.ts / columnMatcher /
// aliases). It defines, from scratch, the two things the audit needs before it can
// diff anything:
//
//   1. The NATURAL KEY — rebuilt from source/DB *columns* (year, month, week, period),
//      never from the stored `lesson_key` string. If the audit trusted `lesson_key`
//      it would inherit whatever the ingest chose to bake into it; instead it derives
//      the key itself so a key-generation change surfaces as a coverage diff.
//
//   2. Two NORMALIZATION TIERS for outcome text (see the audit brief §1):
//        • Tier-1 (content): trim, collapse horizontal whitespace, newlines → \n,
//          Unicode NFC, strip zero-width. A Tier-1 mismatch = real corruption.
//        • Tier-0 (bytes): exact equality. A Tier-0-only mismatch = whitespace/
//          encoding noise, reported separately and never silently normalised away.

/** Zero-width and BOM-class characters stripped in Tier-1. */
const ZERO_WIDTH_RE = /[​‌‍⁠﻿]/g;

/**
 * Tier-1 (content) normalization. Preserves `\n` boundaries (they are meaningful —
 * weekly-shape outcomes are `skill \n knowledge`) while erasing horizontal-whitespace
 * and encoding noise:
 *   - Unicode NFC
 *   - strip zero-width / BOM characters
 *   - CRLF / lone CR → LF
 *   - collapse runs of horizontal whitespace (spaces, tabs, NBSP…) to a single space
 *   - trim horizontal whitespace around every newline
 *   - collapse runs of blank lines to a single newline
 *   - trim the ends
 */
export function tier1(value: string | null | undefined): string | null {
  if (value == null) return null;
  const out = value
    .normalize('NFC')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/\r\n?/g, '\n')
    // horizontal whitespace only (NOT \n): ASCII space/tab + Unicode spaces
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return out === '' ? null : out;
}

/**
 * Tier-0 (bytes) normalization: the raw string with only a null/empty collapse, so
 * exact equality is a byte comparison. A blank cell and a whitespace-only cell both
 * read as null here too, matching how the DB stores an empty outcome (SQL NULL).
 */
export function tier0(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value === '' ? null : value;
}

// ── Natural-key part parsers (column-derived, not lesson_key-derived) ─────────────

/**
 * Year label → 0..6 index. `"Year 3"` / `3` → 3; preparatory / reception / السنة 0
 * variants → 0. Returns null when no year is resolvable (a non-data row).
 */
export function normalizeYear(label: string | null | undefined): number | null {
  if (label == null) return null;
  const s = String(label).trim().toLowerCase();
  if (s === '') return null;
  if (/(preparatory|reception|prep|kg|kindergarten|تمهيد)/.test(s)) return 0;
  const m = s.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 0 && n <= 12 ? n : null;
}

/** Month → lower-cased, trimmed, internal whitespace collapsed. Null when blank. */
export function normalizeMonth(label: string | null | undefined): string | null {
  if (label == null) return null;
  const s = String(label).trim().toLowerCase().replace(/\s+/g, ' ');
  return s === '' ? null : s;
}

/** Week → integer (first integer in the cell). Null when none. */
export function normalizeWeek(label: string | null | undefined): number | null {
  if (label == null) return null;
  const m = String(label).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Period → 1..6 or null. `"Period 3"` / `3` → 3; blank / non-instructional labels
 * with no digit (Baseline, Orientation) → null. Weekly-shape subjects have no period
 * column at all and always resolve to null (the extractor passes `null` directly).
 */
export function normalizePeriod(label: string | null | undefined): number | null {
  if (label == null) return null;
  const m = String(label).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1 && n <= 6 ? n : null;
}

/** The five-part natural key, each part already normalised. */
export interface NaturalKey {
  subject: string;
  year: number;
  month: string;
  week: number;
  period: number | null;
}

/**
 * Canonical audit key string. Deliberately NOT the app's `lesson_key` format — the
 * audit builds both sides from columns and compares its own key, so a change to the
 * app's `lesson_key` scheme can never hide a coverage diff.
 */
export function keyString(k: NaturalKey): string {
  return `${k.subject}|Y${k.year}|${k.month}|W${k.week}|P${k.period ?? '-'}`;
}
