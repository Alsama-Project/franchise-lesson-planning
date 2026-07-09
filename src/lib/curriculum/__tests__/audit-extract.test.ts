import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { extractWorkbook } from '../audit/extract';
import { loadAppGoldText } from '../audit/app-source';
import { reconcileSubject, totalContentMismatches } from '../audit/reconcile';
import { normalizeMonth, normalizePeriod, normalizeYear, tier0, tier1 } from '../audit/normalize';
import type { PinnedMapping } from '../audit/pinned-map';

// ── Independent-audit harness unit tests ──────────────────────────────────────────
//
// Proves the extractor + reconciler on SYNTHETIC in-memory workbooks, so the whole
// mechanism is verified without the gitignored IP fixtures. Exercises: forward-fill of
// merged key cells, non-data-row skipping, single + join outcome rules, coverage
// (source-only / app-only), Tier-1 content drift, Tier-0 whitespace classification,
// and the layer-3 set cross-check.

/** Build an .xlsx buffer from a sheet name + array-of-arrays (row 0 = source row 1). */
function workbook(sheetName: string, aoa: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// A compact daily-grain pin: A=year B=month C=week D=period E=Daily LO F=weekly decoy.
const DAILY_PIN: PinnedMapping = {
  subject: 'english',
  file: 'x.xlsx',
  fallbackFile: 'x.xlsx',
  sheet: 'Sheet',
  headerRow: 1,
  firstDataRow: 2,
  outcome: { kind: 'single', col: 'E' },
  key: { year: 'A', month: 'B', week: 'C', period: 'D' },
  grain: 'daily',
  fillColumns: ['A', 'B', 'C'],
  candidates: [
    { label: 'Daily LO (E)', rule: { kind: 'single', col: 'E' } },
    { label: 'Weekly decoy (F)', rule: { kind: 'single', col: 'F' } },
  ],
  pinned: true,
};

const DAILY_AOA: (string | number)[][] = [
  ['Year', 'Month', 'Week', 'Period', 'Daily LO', 'Weekly'],
  ['Year 3', 'April', '1', 'Period 1', 'Read letter a', 'weekly skill x'],
  ['', '', '', 'Period 2', 'Read letter b', ''], // year/month/week merged → forward-fill
  ['', '', '2', 'Period 1', 'Read word cat', 'weekly skill y'], // new week, year/month filled
  ['', '', '', '', '', ''], // blank spacer → skipped (no full key)
  ['Year 4', 'May', '1', 'Period 1', 'Advanced', ''],
];

test('extractor forward-fills merged key cells and skips non-data rows', () => {
  const res = extractWorkbook(workbook('Sheet', DAILY_AOA), DAILY_PIN);
  assert.equal(res.rows.length, 4);
  assert.equal(res.skipped, 1);
  assert.deepEqual(
    res.rows.map((r) => r.keyStr),
    [
      'english|Y3|april|W1|P1',
      'english|Y3|april|W1|P2', // week 1 forward-filled from the row above
      'english|Y3|april|W2|P1', // year+month forward-filled
      'english|Y4|may|W1|P1',
    ],
  );
  assert.equal(res.rows[1].outcome, 'Read letter b');
});

test('coverage + Tier-1 content diff on matched rows (app-only fails the gate)', () => {
  const res = extractWorkbook(workbook('Sheet', DAILY_AOA), DAILY_PIN);
  const gold = [
    'subject_code,year,month,week,period,lesson_key,daily_outcome',
    'english,3,April,1,1,k1,Read letter a', // exact match
    'english,3,April,1,2,k2,Read letter WRONG', // Tier-1 content drift
    'english,3,April,2,1,k3,Read word cat', // exact match
    'english,5,May,9,3,k9,ghost row', // app-only (no source) — orphaned
  ].join('\n');
  const report = reconcileSubject(DAILY_PIN, res, loadAppGoldText('english', gold));

  assert.equal(report.coverage.matched, 3);
  assert.deepEqual(report.coverage.appOnly, ['english|Y5|may|W9|P3']);
  assert.deepEqual(report.coverage.sourceOnly, ['english|Y4|may|W1|P1']); // un-imported
  assert.equal(totalContentMismatches(report), 1);
  assert.equal(report.content[0].mismatches, 1);
  assert.equal(report.content[0].samples[0].keyStr, 'english|Y3|april|W1|P2');
  assert.equal(report.gatePass, false); // app-only orphan blocks the gate

  // Layer 3: the DB daily_outcome set matches the pinned Daily LO column, not the decoy.
  assert.equal(report.setCrossCheck.pinnedColumnIsBest, true);
  assert.equal(report.setCrossCheck.bestLabel, 'Daily LO (E)');
});

test('clean run passes the gate strictly (source == app both directions)', () => {
  const res = extractWorkbook(workbook('Sheet', DAILY_AOA), DAILY_PIN);
  const gold = [
    'subject_code,year,month,week,period,lesson_key,daily_outcome',
    'english,3,April,1,1,k1,Read letter a',
    'english,3,April,1,2,k2,Read letter b',
    'english,3,April,2,1,k3,Read word cat',
    'english,4,May,1,1,k4,Advanced',
  ].join('\n');
  const report = reconcileSubject(DAILY_PIN, res, loadAppGoldText('english', gold));
  assert.equal(report.gatePass, true);
  assert.equal(report.strictPass, true);
  assert.equal(totalContentMismatches(report), 0);
});

test('whitespace-only diffs classify as Tier-0 noise, not Tier-1 corruption', () => {
  const res = extractWorkbook(workbook('Sheet', DAILY_AOA), DAILY_PIN);
  // Same content, extra internal spaces + trailing whitespace → Tier-1 equal, Tier-0 differs.
  const gold = [
    'subject_code,year,month,week,period,lesson_key,daily_outcome',
    'english,3,April,1,1,k1,Read  letter a ',
    'english,3,April,1,2,k2,Read letter b',
    'english,3,April,2,1,k3,Read word cat',
    'english,4,May,1,1,k4,Advanced',
  ].join('\n');
  const report = reconcileSubject(DAILY_PIN, res, loadAppGoldText('english', gold));
  assert.equal(totalContentMismatches(report), 0); // Tier-1 clean
  assert.equal(report.whitespaceOnly.count, 1); // Tier-0 noise surfaced separately
  assert.equal(report.gatePass, true);
});

// A weekly-grain pin: period always null; outcome = skill(E) \n knowledge(F).
const WEEKLY_PIN: PinnedMapping = {
  subject: 'awareness',
  file: 'x.xlsx',
  fallbackFile: 'x.xlsx',
  sheet: 'Sheet',
  headerRow: 1,
  firstDataRow: 2,
  outcome: { kind: 'join', cols: ['E', 'F'], separator: '\n' },
  key: { year: 'A', month: 'B', week: 'C', period: null },
  grain: 'weekly',
  fillColumns: ['A', 'B'],
  candidates: [
    { label: 'Skill (E)', rule: { kind: 'single', col: 'E' } },
    { label: 'Skill\\nKnowledge', rule: { kind: 'join', cols: ['E', 'F'], separator: '\n' } },
  ],
  pinned: true,
};

test('weekly join outcome: both cols → skill\\nknowledge, one col → that col', () => {
  const aoa: (string | number)[][] = [
    ['Year', 'Month', 'Week', 'x', 'Skill', 'Knowledge'],
    ['Year 2', 'March', '1', '', 'be aware', 'know safety'], // both → join
    ['', '', '2', '', 'listen', ''], // skill only → skill verbatim, no trailing sep
  ];
  const res = extractWorkbook(workbook('Sheet', aoa), WEEKLY_PIN);
  assert.deepEqual(
    res.rows.map((r) => r.keyStr),
    ['awareness|Y2|march|W1|P-', 'awareness|Y2|march|W2|P-'], // period null → "P-"
  );
  assert.equal(res.rows[0].outcome, 'be aware\nknow safety');
  assert.equal(res.rows[1].outcome, 'listen');

  // Cross-check: DB stored the JOIN, so the join candidate matches, not skill-alone.
  const gold = [
    'subject_code,year,month,week,period,lesson_key,daily_outcome',
    'awareness,2,March,1,,k1,"be aware\nknow safety"', // multiline field is quoted (RFC-4180)
    'awareness,2,March,2,,k2,listen',
  ].join('\n');
  const report = reconcileSubject(WEEKLY_PIN, res, loadAppGoldText('awareness', gold));
  assert.equal(report.setCrossCheck.bestLabel, 'Skill\\nKnowledge');
  assert.equal(report.gatePass, true);
});

test('extractor refuses unpinned subjects and missing sheets', () => {
  const buf = workbook('Sheet', DAILY_AOA);
  assert.throws(() => extractWorkbook(buf, { ...DAILY_PIN, pinned: false }), /UNPINNED/);
  assert.throws(() => extractWorkbook(buf, { ...DAILY_PIN, sheet: 'Nope' }), /not found/);
});

test('normalization: key parts and tiers', () => {
  assert.equal(normalizeYear('Year 3'), 3);
  assert.equal(normalizeYear('Preparatory'), 0);
  assert.equal(normalizeYear('3'), 3);
  assert.equal(normalizeMonth('  April  '), 'april');
  assert.equal(normalizePeriod('Period 5'), 5);
  assert.equal(normalizePeriod('Baseline'), null);
  // Tier-1 collapses horizontal whitespace, keeps \n; Tier-0 is exact.
  assert.equal(tier1('a  b\r\nc '), 'a b\nc');
  assert.equal(tier1('#N/A'), '#N/A'); // tier1 does NOT scrub sentinels — the extractor does
  assert.equal(tier0('a b'), 'a b');
  assert.notEqual(tier0('a  b'), tier0('a b'));
});
