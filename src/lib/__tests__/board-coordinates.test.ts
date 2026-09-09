// The planning board orders its (month, week) coordinates by the ACADEMIC week
// number, not by calendar month. These lock the fix for the legacy flat counter,
// where January-first month ordering pushed September (the academic Week 1) to flat
// position ~24 and rendered "Week 26 · current" for today. The label is now the
// academic `week` itself (equal to `term_week.week_no` by design). Node's built-in
// runner (see package.json "test").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderBoardCoordinates, type MonthWeeks } from '../board-nav';

// A Y1–6 scheme of work: Sep=Week 1..38, with the real short months (Dec has 3
// teaching weeks 13–15, Feb has 3 weeks 20–22 — the holiday breaks). Deliberately
// listed in a jumbled month order to prove the output order comes from `week`, not
// from input order.
const Y1_TO_6: MonthWeeks[] = [
  { month: 'January', weeks: [16, 17, 18, 19] },
  { month: 'September', weeks: [1, 2, 3, 4] },
  { month: 'December', weeks: [13, 14, 15] },
  { month: 'June', weeks: [35, 36, 37, 38] },
  { month: 'October', weeks: [5, 6, 7, 8] },
  { month: 'November', weeks: [9, 10, 11, 12] },
  { month: 'February', weeks: [20, 21, 22] },
  { month: 'March', weeks: [23, 24, 25, 26] },
  { month: 'April', weeks: [27, 28, 29, 30] },
  { month: 'May', weeks: [31, 32, 33, 34] },
];

test('September (academic Week 1) leads, not January — the bug being fixed', () => {
  const coords = orderBoardCoordinates([Y1_TO_6]);
  assert.deepEqual(coords[0], { month: 'September', week: 1 });
});

test('the September group is Weeks 1–4, never 24–27', () => {
  const coords = orderBoardCoordinates([Y1_TO_6]);
  const september = coords.filter((c) => c.month === 'September').map((c) => c.week);
  assert.deepEqual(september, [1, 2, 3, 4]);
});

test('weeks run monotonically 1→38 (the label equals the academic week)', () => {
  const coords = orderBoardCoordinates([Y1_TO_6]);
  const weeks = coords.map((c) => c.week);
  const expected = Array.from({ length: 38 }, (_, i) => i + 1);
  assert.deepEqual(weeks, expected);
});

test("Term 2's first teaching week is Week 17 (continuous), not a per-term W1", () => {
  const coords = orderBoardCoordinates([Y1_TO_6]);
  // After the Christmas break (weeks end at 15 in December), January opens at 16;
  // the second January coordinate — Term 2's first full teaching week in the sample —
  // is Week 17, proving continuous (not per-term) numbering.
  const january = coords.filter((c) => c.month === 'January').map((c) => c.week);
  assert.deepEqual(january, [16, 17, 18, 19]);
});

test('Y0 (February-anchored) numbers from its own Week 1 in March', () => {
  // Y0 runs March=Week 1 → Week 20; its Week 1 is in March, not September.
  const y0: MonthWeeks[] = [
    { month: 'March', weeks: [1, 2, 3, 4] },
    { month: 'April', weeks: [5, 6, 7, 8] },
  ];
  const coords = orderBoardCoordinates([y0]);
  assert.deepEqual(coords[0], { month: 'March', week: 1 });
});

test('a week present across years is de-duplicated to one coordinate', () => {
  const a: MonthWeeks[] = [{ month: 'September', weeks: [1, 2] }];
  const b: MonthWeeks[] = [{ month: 'September', weeks: [2, 3] }];
  const coords = orderBoardCoordinates([a, b]);
  assert.deepEqual(coords, [
    { month: 'September', week: 1 },
    { month: 'September', week: 2 },
    { month: 'September', week: 3 },
  ]);
});
