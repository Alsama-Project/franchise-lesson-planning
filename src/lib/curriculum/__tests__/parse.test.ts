import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCurriculumWorkbook, splitInlineMonthly } from '../parse';
import { makeWorkbook, headerBlock, type CellSpec } from './fixtures';

// ── English daily-grain workbook — the no-regression anchor ───────────────────────
//
// Header is at sheet row 7 (5 filler rows + the 3-row header block). Hierarchical
// columns are merged (blank = "same as above"). Includes a non-instructional row and
// a hidden helper column full of #REF!.

const EN_HEADERS: CellSpec[] = [
  '', // A — structural marker column
  'Subject', // B
  'Subject Learning Outcome', // C
  'Year', // D
  'Annual Learning Outcome', // E
  'Month', // F
  'Monthly Learning Outcome', // G
  'Week', // H
  'Weekly Skill Learning Outcome', // I
  'Weekly Knowledge Learning Outcome', // J
  'Period #', // K
  'Daily Learning Outcome', // L
  'Resources', // M
  'Linguistic Skill', // N
  'Theme', // O
  'Lesson Identifier', // P
  'Skill LO # [to be hidden]', // Q — hidden helper
  'Content covered within linguistic skill', // R — intentionally DROPPED (→ unmapped)
  'Content covered within grammar', // S — → grammar_vocabulary
];

function englishWorkbook(): Buffer {
  const blanks: CellSpec[][] = Array.from({ length: 5 }, () => []);
  const p1: CellSpec[] = [
    '', 'English', 'Read & write', 'Year 0', 'Annual: literacy', 'February',
    'Monthly: letters', 1, 'Skill: write letters', 'Know: alphabet', 'Period 1',
    'Write letter a', 'Alfadeca - Vowels workbook', 'Basic Literacy', 'Alphabet',
    '1.S1.K1.H1', '#REF!', 'Decoding CVC', 'Letter a; vowel sounds',
  ];
  const p2: CellSpec[] = [
    '', '', '', '', '', '', '', '', '', '', 'Period 2', 'Write letter b', 'Page p6',
    'Basic Literacy', '', '1.S1.K1.H2', '#REF!', '', '',
  ];
  const baseline: CellSpec[] = [
    '', '', '', '', '#REF!', '', '', '', '', '', 'Baseline Evaluation',
  ];
  return makeWorkbook({
    'English Curriculum': [...blanks, ...headerBlock(EN_HEADERS), p1, p2, baseline],
  });
}

test('English: sheet/header/grain detected; helper excluded; English mapping intact', () => {
  const { records, report, lessonRows, skippedLessonRows } = parseCurriculumWorkbook(
    englishWorkbook(),
    'english',
  );

  assert.equal(report.selectedSheet, 'English Curriculum');
  assert.equal(report.headerRow, 7);
  assert.equal(report.grain, 'daily');
  assert.equal(report.needsReview, false);
  // The helper is excluded; col X ("Content covered within linguistic skill") is
  // intentionally dropped → it surfaces as unmapped (visible, never silently lost).
  assert.deepEqual(
    report.unmappedHeaders.map((u) => u.header),
    ['Content covered within linguistic skill'],
  );
  assert.equal(report.rowCount, 3); // P1, P2, Baseline

  const daily = report.columnMap.find((m) => m.canonicalField === 'dailyLearningOutcome');
  assert.equal(daily?.column, 'L');
  assert.equal(daily?.confidence, 1);

  // "Content covered within grammar" (col S) maps to grammarVocabulary, NOT topic.
  const grammar = report.columnMap.find((m) => m.canonicalField === 'grammarVocabulary');
  assert.equal(grammar?.column, 'S');
  assert.equal(grammar?.confidence, 1);

  // Rows written to curriculum_lesson — P1, P2, and now the non-instructional Baseline
  // (period NULL), since the table only needs year/month/week (period is nullable).
  assert.equal(lessonRows.length, 3);
  assert.equal(skippedLessonRows, 0);
  assert.deepEqual(lessonRows[0], {
    subject_code: 'english',
    year: 0,
    month: 'February',
    week: 1,
    period: 1,
    lesson_key: 'english|Y0|February|W1|P1', // daily key UNCHANGED — the safety gate
    daily_outcome: 'Write letter a',
    focus_area: null,
    linguistic_skill: 'Basic Literacy',
    theme: 'Alphabet',
    resources: [{ label: 'Alfadeca - Vowels workbook' }],
    taxonomy_id: '1.S1.K1.H1',
    monthly_knowledge_lo: null,
    monthly_skills_lo: null,
    weekly_knowledge_lo: 'Know: alphabet',
    weekly_skills_lo: 'Skill: write letters',
    grammar_vocabulary: 'Letter a; vowel sounds',
    monthly_lo: 'Monthly: letters',
    subject_learning_outcome: 'Read & write',
    annual_learning_outcome: 'Annual: literacy',
    source_row: 9, // 5 blank rows + 3-row header block (header at row 7) → P1 at sheet row 9
  });

  // P2: hierarchical cells forward-filled from P1; per-row theme/grammar blank → null.
  assert.equal(lessonRows[1].week, 1);
  assert.equal(lessonRows[1].month, 'February');
  assert.equal(lessonRows[1].weekly_skills_lo, 'Skill: write letters');
  assert.equal(lessonRows[1].theme, null);
  assert.equal(lessonRows[1].grammar_vocabulary, null);

  // Baseline: period NULL, daily NULL, a sentinel lesson_key that can't collide with
  // the numeric-period keys teacher lessons link to. Its weekly cells forward-fill to
  // non-null from P1, yet daily_outcome stays NULL — proving the weekly-outcome fallback
  // is gated at SHEET level (English has a Daily-LO column) and never backfills a daily
  // sheet's blank daily cell from week-level LOs.
  const baselineRow = lessonRows[2];
  assert.equal(baselineRow.period, null);
  assert.equal(baselineRow.daily_outcome, null);
  assert.equal(baselineRow.weekly_skills_lo, 'Skill: write letters');
  assert.equal(baselineRow.lesson_key, 'english|Y0|February|W1|wk:baseline-evaluation');

  // Canonical record captures the richer model (incl. single monthly LO + grammar).
  const r1 = records[0];
  assert.equal(r1.subject, 'English');
  assert.equal(r1.subjectLearningOutcome, 'Read & write');
  assert.equal(r1.yearIndex, 0);
  assert.equal(r1.annualLearningOutcome, 'Annual: literacy');
  assert.equal(r1.monthlyLearningOutcome, 'Monthly: letters');
  assert.equal(r1.grammarVocabulary, 'Letter a; vowel sounds');
  assert.equal(r1.periodNumber, 1);
  assert.equal(r1.sourceRow, 9);

  // Non-instructional row kept with null period/daily.
  const baseline = records[2];
  assert.equal(baseline.period, 'Baseline Evaluation');
  assert.equal(baseline.periodNumber, null);
  assert.equal(baseline.dailyLearningOutcome, null);

  assert.ok(report.warnings.some((w) => w.includes('non-instructional')));
  assert.ok(report.warnings.some((w) => w.includes('#REF!')));
});

// ── Combined "Monthly Learning Outcome" → monthly_lo, forward-filled ─────────────
//
// English (and most subjects) carry ONE combined "Monthly Learning Outcome" merged
// down the month (value on the first row, blank beneath). It must map to the
// monthlyLearningOutcome field, land in the monthly_lo column, and forward-fill onto
// EVERY row of the month — not just week-1/period-1 — while the split skill/knowledge
// columns stay null for the combined shape.

test('combined Monthly Learning Outcome maps to monthly_lo and fills every row of the month', () => {
  const headers: CellSpec[] = [
    '', 'Subject', 'Year', 'Month', 'Monthly Learning Outcome', 'Week', 'Period #', 'Daily Learning Outcome',
  ];
  const rows: CellSpec[][] = [
    ['', 'English', 'Year 1', 'March', 'Master greetings', 1, 'Period 1', 'Say hello'],
    ['', '', '', '', '', 1, 'Period 2', 'Say goodbye'],
    ['', '', '', '', '', 2, 'Period 1', 'Introduce self'],
    ['', '', '', 'April', 'Master numbers', 3, 'Period 1', 'Count to ten'],
    ['', '', '', '', '', 3, 'Period 2', 'Count to twenty'],
  ];
  const wb = makeWorkbook({ 'English Curriculum': [...headerBlock(headers), ...rows] });

  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'english');

  // The combined column maps to monthlyLearningOutcome (NOT a split field, NOT unmapped).
  const monthly = report.columnMap.find((m) => m.canonicalField === 'monthlyLearningOutcome');
  assert.equal(monthly?.column, 'E');
  assert.equal(monthly?.confidence, 1);
  assert.equal(
    report.unmappedHeaders.some((u) => u.header === 'Monthly Learning Outcome'),
    false,
  );

  // monthly_lo is forward-filled onto EVERY row of each month; the split columns are
  // null (English does not split), and the value resets on the next month's value.
  assert.equal(lessonRows.length, 5);
  assert.deepEqual(
    lessonRows.map((r) => r.monthly_lo),
    ['Master greetings', 'Master greetings', 'Master greetings', 'Master numbers', 'Master numbers'],
  );
  for (const r of lessonRows) {
    assert.equal(r.monthly_skills_lo, null);
    assert.equal(r.monthly_knowledge_lo, null);
  }
});

// ── Split monthly LO (Prof V1 shape) stays split; combined never steals it ────────

test('split Monthly Skill/Knowledge LO map to their own columns, not the combined one', () => {
  const headers: CellSpec[] = [
    '', 'Year', 'Month',
    'Monthly Skill Learning Outcome', 'Monthly Knowledge Learning Outcome',
    'Week', 'Period #', 'Daily Learning Outcome',
  ];
  const data: CellSpec[] = ['', 'Year 2', 'May', 'Skill: present well', 'Know: etiquette', 1, 'Period 1', 'Practice'];
  const wb = makeWorkbook({ 'Science Curriculum': [...headerBlock(headers), data] });

  // Use a non-pinned subject (science) so this exercises the generic column matcher,
  // not the professionalism/arabic canonical-sheet pin.
  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'science');
  const fields = report.columnMap.map((m) => m.canonicalField);
  assert.ok(fields.includes('monthlySkillLearningOutcome'));
  assert.ok(fields.includes('monthlyKnowledgeLearningOutcome'));
  // The combined field must NOT bind either split column.
  assert.equal(fields.includes('monthlyLearningOutcome'), false);
  assert.equal(lessonRows[0].monthly_skills_lo, 'Skill: present well');
  assert.equal(lessonRows[0].monthly_knowledge_lo, 'Know: etiquette');
  assert.equal(lessonRows[0].monthly_lo, null);
});

// ── Shifted columns — position must not matter ───────────────────────────────────

test('shifted column letters: Daily LO in a different column still maps', () => {
  const headers: CellSpec[] = ['', 'Period #', 'Daily Learning Outcome', 'Week', 'Month', 'Year'];
  const data: CellSpec[] = ['', 'Period 1', 'Do a thing', 3, 'March', 'Year 2'];
  const wb = makeWorkbook({ Sheet1: [...headerBlock(headers), data] });
  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'maths');
  assert.equal(report.grain, 'daily');
  assert.equal(report.columnMap.find((m) => m.canonicalField === 'dailyLearningOutcome')?.column, 'C');
  assert.equal(report.columnMap.find((m) => m.canonicalField === 'year')?.column, 'F');
  assert.equal(lessonRows.length, 1);
  assert.equal(lessonRows[0].daily_outcome, 'Do a thing');
  assert.equal(lessonRows[0].year, 2);
});

// ── Arabic headers + header row at 5 (not 7) ─────────────────────────────────────

test('Arabic headers with header row at sheet row 5', () => {
  const band: CellSpec[] = ['الفترة الزمنية', '', '', '', '', '', ''];
  const head: CellSpec[] = [
    'عنوان العمود', 'الموضوع', 'السنة', 'الشهر', 'الأسبوع', 'رقم الحصة', 'نتائج التعلم اليومية',
  ];
  const desc: CellSpec[] = ['الوصف', '', '', '', '', '', ''];
  const data: CellSpec[] = ['', 'Yoga', 'السنة 0', 'سبتمبر', 2, '1', 'تمرين التنفس'];
  const filler: CellSpec[][] = [[], [], []]; // push the block down to row 5
  const wb = makeWorkbook({ 'Yoga Curriculum': [...filler, band, head, desc, data] });

  const { records, report, lessonRows } = parseCurriculumWorkbook(wb, 'yoga');
  assert.equal(report.headerRow, 5);
  assert.equal(report.grain, 'daily');
  assert.equal(report.columnMap.find((m) => m.canonicalField === 'year')?.column, 'C');
  assert.equal(records[0].yearIndex, 0); // "السنة 0" → 0
  assert.equal(records[0].month, 'سبتمبر');
  assert.equal(lessonRows[0].period, 1);
  assert.equal(lessonRows[0].daily_outcome, 'تمرين التنفس');
});

// ── Weekly-only grain (Awareness): no period/daily column ────────────────────────

test('weekly grain: one row per week, written with NULL period + sentinel key', () => {
  const headers: CellSpec[] = [
    '', 'Year', 'Month', 'Week', 'Weekly Skill Learning Outcome', 'Weekly Knowledge Learning Outcome', 'Resources',
  ];
  const w1: CellSpec[] = ['', 'Year 1', 'October', 1, 'Skill one', 'Know one', 'Book A'];
  const w2: CellSpec[] = ['', '', '', 2, 'Skill two', 'Know two', 'Book B'];
  const wb = makeWorkbook({ 'Awareness Cirriculum V3': [...headerBlock(headers), w1, w2] });

  const { records, report, lessonRows, skippedLessonRows } = parseCurriculumWorkbook(wb, 'awareness');
  assert.equal(report.grain, 'weekly');
  assert.equal(records.length, 2);
  assert.equal(records[0].week, 1);
  assert.equal(records[1].week, 2);
  assert.equal(records[0].periodNumber, null);

  // Weekly subjects are now imported: one row per week, period NULL, `wk` key segment.
  assert.equal(lessonRows.length, 2);
  assert.equal(skippedLessonRows, 0);
  assert.equal(lessonRows[0].period, null);
  assert.equal(lessonRows[0].lesson_key, 'awareness|Y1|October|W1|wk');
  assert.equal(lessonRows[0].weekly_skills_lo, 'Skill one');
  assert.equal(lessonRows[1].lesson_key, 'awareness|Y1|October|W2|wk');
  // No Daily-LO column → the per-lesson daily_outcome is resolved from the weekly
  // columns (skill primary, knowledge appended on a newline) so rows are no longer
  // `missing`. Both LOs also remain verbatim in weekly_skills_lo/weekly_knowledge_lo.
  assert.equal(lessonRows[0].daily_outcome, 'Skill one\nKnow one');
  assert.equal(lessonRows[1].daily_outcome, 'Skill two\nKnow two');
  assert.ok(report.warnings.some((w) => w.includes('weekly grain')));
});

// ── Hyperlink resources (Science / Professionalism style) ────────────────────────

test('hyperlink resources: URL captured though display text says "Click for Resource"', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome', 'Resources'];
  const data: CellSpec[] = [
    '', 'Year 3', 'May', 1, 'Period 1', 'Investigate',
    { text: 'Click for Resource', url: 'https://drive.example/abc.pdf' },
  ];
  const wb = makeWorkbook({ 'Version 2 ': [...headerBlock(headers), data] });

  const { records, lessonRows } = parseCurriculumWorkbook(wb, 'science');
  assert.equal(records[0].resourceText, 'Click for Resource');
  assert.equal(records[0].resourceUrl, 'https://drive.example/abc.pdf');
  assert.deepEqual(lessonRows[0].resources, [
    { label: 'Click for Resource', url: 'https://drive.example/abc.pdf' },
  ]);
});

// ── Sheet visibility drives selection: hidden tabs are archived legacy versions ───
//
// Hidden / very-hidden sheets are excluded outright (never ingested), so a stale hidden
// draft can never be chosen — the exact bug behind professionalism (DB was ingested from
// the hidden, stale V1 while V4 is the visible current sheet).

test('hidden sheets are excluded — the single VISIBLE curriculum sheet is chosen', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const v4: CellSpec[] = ['', 'Year 4', 'June', 1, 'Period 1', 'Current V4 content'];
  const v1: CellSpec[] = ['', 'Year 4', 'June', 1, 'Period 1', 'Stale V1 content'];
  // Real professionalism: V4 visible, V1/V2 hidden legacy. V1 first — order must not matter.
  const wb = makeWorkbook(
    {
      V1: [...headerBlock(headers), v1],
      V2: [...headerBlock(headers), v1],
      V4: [...headerBlock(headers), v4],
    },
    { hidden: ['V1', 'V2'] },
  );

  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'professionalism');
  assert.equal(report.selectedSheet, 'V4');
  assert.equal(lessonRows[0].daily_outcome, 'Current V4 content');
});

test('a hidden sheet is never ingested, even when explicitly requested', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const block = [...headerBlock(headers), ['', 'Year 4', 'June', 1, 'Period 1', 'x']];
  const wb = makeWorkbook(
    { 'English Curriculum': block, Current: block },
    { hidden: ['English Curriculum'] },
  );
  assert.throws(
    () => parseCurriculumWorkbook(wb, 'english', { sheet: 'English Curriculum' }),
    /hidden/,
  );
});

test('multiple VISIBLE curriculum sheets (no pin): STOP rather than guess', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const block = [...headerBlock(headers), ['', 'Year 4', 'June', 1, 'Period 1', 'Practice']];
  const wb = makeWorkbook({
    Cover: [['Welcome'], ['not a curriculum sheet']],
    'Curriculum A': block,
    'Curriculum B': block,
  });
  assert.throws(
    () => parseCurriculumWorkbook(wb, 'maths'), // maths is not pinned
    /Ambiguous: 2 visible curriculum-shaped sheets/,
  );
});

// ── Canonical sheet pin (arabic) disambiguates multiple VISIBLE candidates ─────────

test('canonical pin selects the pinned sheet among multiple visible candidates', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const block = [...headerBlock(headers), ['', 'Year 4', 'June', 1, 'Period 1', 'Practice']];
  // Arabic ships two curriculum-shaped sheets; the pin disambiguates without guessing.
  const wb = makeWorkbook({ 'Arabic Curriculum': block, 'Arabic Curriculum (2)': block });

  const { report } = parseCurriculumWorkbook(wb, 'arabic');
  assert.equal(report.selectedSheet, 'Arabic Curriculum (2)');
});

test('canonical pin throws (never silently falls back) when the pinned sheet is absent', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const wb = makeWorkbook({
    'Arabic Curriculum': [...headerBlock(headers), ['', 'Year 4', 'June', 1, 'Period 1', 'x']],
  });
  assert.throws(() => parseCurriculumWorkbook(wb, 'arabic'), /Arabic Curriculum \(2\)/);
});

// ── Blank-cell fill / collision handling — never silently lose or invent a lesson ──

test('GENUINE collision (two DISTINCT lessons → one key): key dropped, not written, reported', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  // A week whose Period labels are MISSING: two rows, same year/month/week, blank period →
  // both key to "…|wk" with DIFFERENT content (arabic W15 in the real data).
  const r1: CellSpec[] = ['', 'Year 5', 'December', 15, '', 'Lesson one'];
  const r2: CellSpec[] = ['', '', '', '', '', 'Lesson two']; // merged year/month/week, blank period
  const wb = makeWorkbook({ Sheet1: [...headerBlock(headers), r1, r2] });

  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'science');
  // Neither arbitrary row is kept — the key is dropped (no silent overwrite, no invented key).
  assert.equal(lessonRows.filter((r) => r.week === 15).length, 0);
  assert.equal(report.droppedCollisions.length, 1);
  assert.deepEqual(report.droppedCollisions[0].rows, [4, 5]); // 1-based source rows (data begins at row 4)
  assert.ok(report.warnings.some((w) => /GENUINE collision/.test(w)));
});

test('EXACT duplicate (same key AND identical content) is kept once — no data loss, no drop', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const real: CellSpec[] = ['', 'Year 5', 'January', 20, 'Period 1', 'Relate the ultrastructure'];
  // Blank Year (inherits Year 5), same Week/Period/Daily — a source copy-paste (Science W20).
  const dupRow: CellSpec[] = ['', '', 'January', 20, 'Period 1', 'Relate the ultrastructure'];
  const wb = makeWorkbook({ Sheet1: [...headerBlock(headers), real, dupRow] });

  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'science');
  const w20 = lessonRows.filter((r) => r.week === 20 && r.period === 1);
  assert.equal(w20.length, 1); // kept once — real content preserved
  assert.equal(w20[0].daily_outcome, 'Relate the ultrastructure');
  assert.equal(report.droppedCollisions.length, 0); // NOT dropped
  assert.ok(report.warnings.some((w) => /exact-duplicate/.test(w)));
});

test('benign MARKER collision does not drop or fail — junk-heavy import still lands', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  // Two non-instructional marker rows share a key (blank period → "…|wk"); a real lesson lands.
  const m1: CellSpec[] = ['', 'Year 3', 'August', 1, '', 'Orientation & Activity'];
  const m2: CellSpec[] = ['', '', '', '', '', 'Evaluation']; // same key as m1 (W1|wk)
  const real: CellSpec[] = ['', '', '', 2, 'Period 1', 'Real lesson']; // labelled W2 P1
  const wb = makeWorkbook({ Sheet1: [...headerBlock(headers), m1, m2, real] });

  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'professionalism');
  assert.equal(report.droppedCollisions.length, 0); // markers never trigger a drop
  assert.ok(lessonRows.some((r) => r.daily_outcome === 'Real lesson'));
});

test('week-reset: a blank-Year/Week block at a period restart is dropped (reported), the labelled week survives', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const rows: CellSpec[][] = [
    ...headerBlock(headers),
    ['', 'Year 5', 'May', 36, 'Period 1', 'Mitosis'], // labelled W36
    ['', '', '', '', 'Period 2', 'Mitosis P2'], // merged blanks (P2 of W36)
    ['', '', '', '', 'Period 1', 'Reproduction'], // blank-Year/Week block, restarts at P1
    ['', '', '', '', 'Period 2', 'Reproduction P2'],
    ['', 'Year 5', 'May', 37, 'Period 1', 'Chemicals'], // labelled W37 resumes
  ];
  const wb = makeWorkbook({ Sheet1: rows });
  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'science');

  // W36 keeps its labelled content — the blank block did NOT clobber it.
  assert.equal(lessonRows.find((r) => r.week === 36 && r.period === 1)?.daily_outcome, 'Mitosis');
  // The blank block is not written under any week (dropped) and is reported.
  assert.ok(!lessonRows.some((r) => r.daily_outcome === 'Reproduction'));
  assert.ok(report.droppedBlankWeekRows.length >= 2);
  assert.ok(report.warnings.some((w) => /blank Week cell at a period restart/.test(w)));
  // W37 resumes normally.
  assert.equal(lessonRows.find((r) => r.week === 37 && r.period === 1)?.daily_outcome, 'Chemicals');
});

test('weekly-shape subject (no Daily-LO col): a blank weekly-knowledge cell stays blank (not forward-filled)', () => {
  // Mirror Yoga: Week + weekly Skill/Knowledge, NO Daily-LO column. One row per week.
  const headers: CellSpec[] = [
    '', 'Year', 'Month', 'Week', 'Weekly Skill Learning Outcome', 'Weekly Knowledge Learning Outcome',
  ];
  const w21: CellSpec[] = ['', 'Year 1', 'March', 21, 'skill 21', 'knowledge 21'];
  const w22: CellSpec[] = ['', '', '', 22, 'skill 22', '']; // knowledge blank — must NOT inherit W21
  const wb = makeWorkbook({ Sheet1: [...headerBlock(headers), w21, w22] });

  const { lessonRows } = parseCurriculumWorkbook(wb, 'yoga');
  const r22 = lessonRows.find((r) => r.week === 22);
  assert.equal(r22?.weekly_knowledge_lo, null); // stayed blank
  assert.notEqual(r22?.weekly_knowledge_lo, 'knowledge 21'); // did not invent W21's knowledge
  // Outcome composes from the (present) skill alone.
  assert.equal(r22?.daily_outcome, 'skill 22');
});

test('daily merged subject: normal fill-down is unchanged (year/month/week + weekly S/K within a week)', () => {
  const headers: CellSpec[] = [
    '', 'Year', 'Month', 'Week', 'Weekly Skill Learning Outcome',
    'Weekly Knowledge Learning Outcome', 'Period #', 'Daily Learning Outcome',
  ];
  // Merged: values on the Period-1 row, blank on P2 — the daily subject's normal shape.
  const p1: CellSpec[] = ['', 'Year 4', 'June', 3, 'wk skill', 'wk knowledge', 'Period 1', 'Daily one'];
  const p2: CellSpec[] = ['', '', '', '', '', '', 'Period 2', 'Daily two']; // all merged blanks
  const wb = makeWorkbook({ Sheet1: [...headerBlock(headers), p1, p2] });

  const { lessonRows, report } = parseCurriculumWorkbook(wb, 'maths');
  assert.equal(lessonRows.length, 2);
  const [a, b] = lessonRows.sort((x, y) => (x.period ?? 0) - (y.period ?? 0));
  // P2 inherits year/month/week AND the merged weekly S/K (forward-fill within the week is intact).
  assert.deepEqual(
    [b.year, b.month, b.week, b.period, b.weekly_skills_lo, b.weekly_knowledge_lo],
    [4, 'June', 3, 2, 'wk skill', 'wk knowledge'],
  );
  assert.equal(a.daily_outcome, 'Daily one');
  assert.equal(b.daily_outcome, 'Daily two');
  assert.equal(report.droppedCollisions.length, 0);
  assert.equal(report.droppedBlankWeekRows.length, 0);
});

// ── A brand-new column does not break the parse; it is surfaced ──────────────────

test('a renamed/new column lands in unmappedHeaders and parse still succeeds', () => {
  const headers: CellSpec[] = [
    '', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome', 'Sparkle Index 3000',
  ];
  const data: CellSpec[] = ['', 'Year 5', 'April', 2, 'Period 3', 'Learn', 'whatever'];
  const wb = makeWorkbook({ Sheet1: [...headerBlock(headers), data] });
  const { report, lessonRows } = parseCurriculumWorkbook(wb, 'it');
  assert.equal(lessonRows.length, 1);
  assert.deepEqual(
    report.unmappedHeaders.map((u) => u.header),
    ['Sparkle Index 3000'],
  );
});

// ── Inline monthly Knowledge/Skills split (maths/science/it/arabic) ───────────────

test('splitInlineMonthly: maths "Monthly Knowledge/Skills:" splits both sections', () => {
  const blob = 'Monthly Knowledge:\r\n. Understand place value.\r\n\r\nMonthly Skills:\r\n. Compare and order numbers.';
  const r = splitInlineMonthly('maths', blob);
  assert.deepEqual(r, {
    knowledge: '. Understand place value.',
    skills: '. Compare and order numbers.',
  });
});

test('splitInlineMonthly: science "… Learning Outcome:" with same-line (space-run) content', () => {
  const blob = 'Knowledge Learning Outcome:      Explain ecosystems.\nSkills Learning Outcome:      Classify organisms.';
  const r = splitInlineMonthly('science', blob);
  assert.deepEqual(r, { knowledge: 'Explain ecosystems.', skills: 'Classify organisms.' });
});

test('splitInlineMonthly: it singular "Skill Learning Outcome:" is matched', () => {
  const blob = 'Skill Learning Outcome:\nUse formatting tools.\nKnowledge Learning Outcome:\nIdentify file types.';
  const r = splitInlineMonthly('it', blob);
  assert.deepEqual(r, { knowledge: 'Identify file types.', skills: 'Use formatting tools.' });
});

test('splitInlineMonthly: arabic markers, Skills→Knowledge order (order-independent)', () => {
  const blob = 'المهارات :\r\n. نطق الحروف.\r\nالمعرفة :\r\n. تمييز الأصوات.';
  const r = splitInlineMonthly('arabic', blob);
  assert.deepEqual(r, { knowledge: '. تمييز الأصوات.', skills: '. نطق الحروف.' });
});

test('splitInlineMonthly: both-labels-required guard — one section only → null', () => {
  assert.equal(splitInlineMonthly('maths', 'Monthly Knowledge:\n. Only knowledge here.'), null);
  // typo in a label (source data) → that label unmatched → falls through to null
  assert.equal(
    splitInlineMonthly('it', 'Skill learning ourtcomes:\nX\nKnowledge Learning Outcome:\nY'),
    null,
  );
});

test('splitInlineMonthly: non-split subject english is untouched → null', () => {
  // English's combined cell uses bare Skills/Knowledge heading lines that the browse
  // renderer splits at read time, so english stays OUT of MONTHLY_SPLIT_SUBJECTS and
  // splitInlineMonthly leaves its cell combined.
  const blob = 'Skills\n. a\nKnowledge\n. b';
  assert.equal(splitInlineMonthly('english', blob), null);
  assert.equal(splitInlineMonthly('maths', null), null);
});

test('splitInlineMonthly: professionalism labels alone on their own line, prose on the next', () => {
  // The real V4 professionalism shape (confirmed on curriculum_version 70b294f0): the
  // Skill/Knowledge labels sit alone on a line with the prose on the FOLLOWING line, so
  // the label line's `rest` is empty and the following non-label line must accumulate
  // into the current section.
  const blob =
    'Skill Learning Outcome:\n' +
    'Build professional relationships, manage well-being, and justify the importance of consistent professional behaviour.\n' +
    'Knowledge Learning Outcome:\n' +
    'Compare professional and personal relationships and describe what reliable professional conduct looks like.';
  const r = splitInlineMonthly('professionalism', blob);
  assert.deepEqual(r, {
    skills:
      'Build professional relationships, manage well-being, and justify the importance of consistent professional behaviour.',
    knowledge:
      'Compare professional and personal relationships and describe what reliable professional conduct looks like.',
  });
});

test('splitInlineMonthly: professionalism single-section cell → null (both-labels guard)', () => {
  // Only one section present: leave monthly_lo combined rather than writing a half-split.
  assert.equal(
    splitInlineMonthly('professionalism', 'Skill Learning Outcome:\nonly skills here.'),
    null,
  );
});

// ── Real-workbook regression gate (self-skips without the gitignored IP files) ─────
//
// Proves the blank-cell fix leaves the untouched subjects byte-identical: for a subject
// with no genuine collision / blank-week block / duplicate, none of the new code paths
// fire, so its output equals pre-fix (the fill scoping guarantees the rest). Verified
// out-of-band that english/maths/professionalism are byte-identical and arabic differs
// ONLY at the W15 collision; these assertions lock that in where the workbooks are present.

const FIXTURES_DIR =
  process.env.CURRICULUM_FIXTURES_DIR ?? resolve(import.meta.dirname, '../../../../test/fixtures/curriculum');
const hasWorkbook = (subject: string): boolean => existsSync(resolve(FIXTURES_DIR, `${subject}.xlsx`));
const parseFixture = (subject: string) =>
  parseCurriculumWorkbook(readFileSync(resolve(FIXTURES_DIR, `${subject}.xlsx`)), subject, {});

for (const subject of ['english', 'maths', 'professionalism']) {
  test(`regression — ${subject} untouched by the blank-cell fix (no drop/reset/dup activity)`, {
    skip: hasWorkbook(subject) ? false : 'real workbook absent (gitignored IP)',
  }, () => {
    const { report } = parseFixture(subject);
    assert.equal(report.droppedCollisions.length, 0, `${subject}: unexpected genuine collision`);
    assert.equal(report.droppedBlankWeekRows.length, 0, `${subject}: unexpected blank-week drop`);
    assert.ok(
      !report.warnings.some((w) => /exact-duplicate/.test(w)),
      `${subject}: unexpected exact-duplicate`,
    );
  });
}

test('regression — arabic changes ONLY at the genuine W15 collision', {
  skip: hasWorkbook('arabic') ? false : 'arabic workbook absent (gitignored IP)',
}, () => {
  const { report } = parseFixture('arabic');
  assert.deepEqual(report.droppedCollisions.map((c) => c.key), ['arabic|Y5|December|W15|wk']);
  assert.equal(report.droppedBlankWeekRows.length, 0);
});
