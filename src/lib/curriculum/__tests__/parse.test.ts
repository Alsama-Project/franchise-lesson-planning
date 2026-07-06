import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  });

  // P2: hierarchical cells forward-filled from P1; per-row theme/grammar blank → null.
  assert.equal(lessonRows[1].week, 1);
  assert.equal(lessonRows[1].month, 'February');
  assert.equal(lessonRows[1].weekly_skills_lo, 'Skill: write letters');
  assert.equal(lessonRows[1].theme, null);
  assert.equal(lessonRows[1].grammar_vocabulary, null);

  // Baseline: period NULL, daily NULL, a sentinel lesson_key that can't collide with
  // the numeric-period keys teacher lessons link to.
  const baselineRow = lessonRows[2];
  assert.equal(baselineRow.period, null);
  assert.equal(baselineRow.daily_outcome, null);
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

// ── Multiple candidate sheets (non-pinned subject) → pick FIRST, flag for review ──
//
// The heuristic deliberately does NOT prefer a higher V-number or the last sheet: the
// imported draft is not necessarily the newest tab (gold was built from Professionalism
// V1, not V4). For a non-pinned subject it falls to (most fields, then first sheet).

test('multiple curriculum sheets: selects the FIRST shaped sheet, flags needsReview', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const data: CellSpec[] = ['', 'Year 4', 'June', 1, 'Period 1', 'Practice'];
  const block = [...headerBlock(headers), data];
  const wb = makeWorkbook({
    Cover: [['Welcome'], ['not a curriculum sheet']],
    'Curriculum A': block,
    'Curriculum B': block,
  });

  const { report } = parseCurriculumWorkbook(wb, 'maths'); // maths is not pinned
  assert.equal(report.selectedSheet, 'Curriculum A');
  assert.equal(report.needsReview, true);
  assert.deepEqual(report.candidateSheets, ['Curriculum B']);
  assert.ok(report.warnings.some((w) => w.includes('Multiple curriculum-shaped sheets')));
});

// ── Canonical sheet pin (professionalism/arabic) overrides the heuristic ──────────

test('canonical sheet pin selects the imported draft, not the highest version', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const data: CellSpec[] = ['', 'Year 4', 'June', 1, 'Period 1', 'Practice'];
  const block = [...headerBlock(headers), data];
  // Real professionalism ships V1/V2/V4; gold was built from V1. Order must not matter.
  const wb = makeWorkbook({ V4: block, V2: block, V1: block });

  const { report } = parseCurriculumWorkbook(wb, 'professionalism');
  assert.equal(report.selectedSheet, 'V1');
});

test('canonical sheet pin throws (never silently falls back) when the sheet is absent', () => {
  const headers: CellSpec[] = ['', 'Year', 'Month', 'Week', 'Period #', 'Daily Learning Outcome'];
  const data: CellSpec[] = ['', 'Year 4', 'June', 1, 'Period 1', 'Practice'];
  const wb = makeWorkbook({ V4: [...headerBlock(headers), data] }); // no V1
  assert.throws(() => parseCurriculumWorkbook(wb, 'professionalism'), /V1/);
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

test('splitInlineMonthly: non-split subjects (english, professionalism) are untouched → null', () => {
  const blob = 'Skills\n. a\nKnowledge\n. b';
  assert.equal(splitInlineMonthly('english', blob), null);
  assert.equal(splitInlineMonthly('professionalism', blob), null);
  assert.equal(splitInlineMonthly('maths', null), null);
});
