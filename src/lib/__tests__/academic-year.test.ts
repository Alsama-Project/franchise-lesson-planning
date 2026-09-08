// The academic-year boundary is AUGUST, not 1 September: the year starts after the
// ~3-week August break, so an Aug–Dec start files under that calendar year and a
// Jan–Jul start files under the previous one. These lock the boundary and guard
// against a 1-September regression. Node's built-in runner (see package.json "test").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { academicYearOf } from '../week';

test('a late-August start files under the NEW year (the bug being fixed)', () => {
  // 31 Aug 2026 → "2026 / 27", not "2025 / 26".
  assert.equal(academicYearOf('2026-08-31'), 2026);
});

test('1 August is the boundary — it already belongs to the new year', () => {
  assert.equal(academicYearOf('2026-08-01'), 2026);
});

test('September through December file under the start year', () => {
  assert.equal(academicYearOf('2026-09-01'), 2026);
  assert.equal(academicYearOf('2026-12-18'), 2026);
});

test('January through July file under the PREVIOUS year', () => {
  assert.equal(academicYearOf('2027-01-15'), 2026); // Jan 2027 → the 2026/27 year
  assert.equal(academicYearOf('2026-01-15'), 2025); // Jan 2026 → the 2025/26 year
  assert.equal(academicYearOf('2026-07-31'), 2025); // July is still the old year
});

test('no 1-September assumption remains: mid-August files under the new year', () => {
  // Under the old Sept cutoff this returned 2025; it must now be 2026.
  assert.equal(academicYearOf('2026-08-15'), 2026);
});

test('a malformed date falls back without throwing', () => {
  assert.equal(typeof academicYearOf('not-a-date'), 'number');
});
