import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurriculumWorkbook } from '../parse';
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
];

function englishWorkbook(): Buffer {
  const blanks: CellSpec[][] = Array.from({ length: 5 }, () => []);
  const p1: CellSpec[] = [
    '', 'English', 'Read & write', 'Year 0', 'Annual: literacy', 'February',
    'Monthly: letters', 1, 'Skill: write letters', 'Know: alphabet', 'Period 1',
    'Write letter a', 'Alfadeca - Vowels workbook', 'Basic Literacy', 'Alphabet',
    '1.S1.K1.H1', '#REF!',
  ];
  const p2: CellSpec[] = [
    '', '', '', '', '', '', '', '', '', '', 'Period 2', 'Write letter b', 'Page p6',
    'Basic Literacy', '', '1.S1.K1.H2', '#REF!',
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
  assert.equal(report.unmappedHeaders.length, 0); // helper excluded, not unmapped
  assert.equal(report.rowCount, 3); // P1, P2, Baseline

  const daily = report.columnMap.find((m) => m.canonicalField === 'dailyLearningOutcome');
  assert.equal(daily?.column, 'L');
  assert.equal(daily?.confidence, 1);

  // Down-adapted rows for the current curriculum_lesson table.
  assert.equal(lessonRows.length, 2);
  assert.equal(skippedLessonRows, 1); // the baseline row can't satisfy the 5-tuple
  assert.deepEqual(lessonRows[0], {
    subject_code: 'english',
    year: 0,
    month: 'February',
    week: 1,
    period: 1,
    lesson_key: 'english|Y0|February|W1|P1',
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
  });

  // P2: hierarchical cells forward-filled from P1; per-row theme blank → null.
  assert.equal(lessonRows[1].week, 1);
  assert.equal(lessonRows[1].month, 'February');
  assert.equal(lessonRows[1].weekly_skills_lo, 'Skill: write letters');
  assert.equal(lessonRows[1].theme, null);

  // Canonical record captures the richer model (incl. single monthly LO).
  const r1 = records[0];
  assert.equal(r1.subject, 'English');
  assert.equal(r1.subjectLearningOutcome, 'Read & write');
  assert.equal(r1.yearIndex, 0);
  assert.equal(r1.annualLearningOutcome, 'Annual: literacy');
  assert.equal(r1.monthlyLearningOutcome, 'Monthly: letters');
  assert.equal(r1.periodNumber, 1);
  assert.equal(r1.sourceRow, 9);

  // Non-instructional row kept with null period/daily.
  const baseline = records[2];
  assert.equal(baseline.period, 'Baseline Evaluation');
  assert.equal(baseline.periodNumber, null);
  assert.equal(baseline.dailyLearningOutcome, null);

  assert.ok(report.warnings.some((w) => w.includes('non-instructional')));
  assert.ok(report.warnings.some((w) => w.includes('#REF!')));
  assert.ok(report.warnings.some((w) => w.includes('curriculum_lesson')));
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

test('weekly grain: one record per week, nothing written to the 5-tuple table', () => {
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
  assert.equal(lessonRows.length, 0);
  assert.equal(skippedLessonRows, 2);
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

// ── Multiple candidate sheets → pick V4, flag for review ─────────────────────────

test('multiple curriculum sheets: selects the highest version, flags needsReview', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const data: CellSpec[] = ['', 'Year 4', 'June', 1, 'Period 1', 'Practice'];
  const block = [...headerBlock(headers), data];
  const wb = makeWorkbook({
    Cover: [['Welcome'], ['not a curriculum sheet']],
    'Professionalism V1': block,
    'Professionalism V4': block,
  });

  const { report } = parseCurriculumWorkbook(wb, 'professionalism');
  assert.equal(report.selectedSheet, 'Professionalism V4');
  assert.equal(report.needsReview, true);
  assert.deepEqual(report.candidateSheets, ['Professionalism V1']);
  assert.ok(report.warnings.some((w) => w.includes('Multiple curriculum-shaped sheets')));
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
