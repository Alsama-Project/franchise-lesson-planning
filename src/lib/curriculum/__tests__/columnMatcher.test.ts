import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExcludedHeader,
  matchColumns,
  normalizeHeader,
  type HeaderCell,
} from '../columnMatcher';

function cells(headers: string[]): HeaderCell[] {
  return headers.map((text, col) => ({ col, text }));
}

test('normalizeHeader: lowercases, collapses, isolates #, strips brackets/diacritics', () => {
  assert.equal(normalizeHeader('  Daily   Learning\nOutcome '), 'daily learning outcome');
  assert.equal(normalizeHeader('Period # [to be hidden]'), 'period #');
  assert.equal(normalizeHeader('نتائج التعلُّم اليومية'), 'نتائج التعلم اليومية');
});

test('exact alias → confidence 1.0; position-independent', () => {
  const { byField } = matchColumns(cells(['Junk', 'Daily Learning Outcome', 'More']));
  const daily = byField.get('dailyLearningOutcome');
  assert.ok(daily);
  assert.equal(daily!.col, 1);
  assert.equal(daily!.confidence, 1);
});

test('Arabic headers map to the right canonical fields', () => {
  const { byField } = matchColumns(
    cells(['السنة', 'الشهر', 'نتائج التعلم اليومية', 'الموارد']),
  );
  assert.equal(byField.get('year')?.col, 0);
  assert.equal(byField.get('month')?.col, 1);
  assert.equal(byField.get('dailyLearningOutcome')?.col, 2);
  assert.equal(byField.get('resources')?.col, 3);
});

test('year vs annual-LO collision: both resolve distinctly', () => {
  const a = matchColumns(cells(['Year', 'Yearly Learning Outcome']));
  assert.equal(a.byField.get('year')?.col, 0);
  assert.equal(a.byField.get('annualLearningOutcome')?.col, 1);
  assert.equal(a.byField.has('year') && a.byField.get('year')!.col === 1, false);

  const b = matchColumns(cells(['Year', 'Annual Learning Outcome']));
  assert.equal(b.byField.get('year')?.col, 0);
  assert.equal(b.byField.get('annualLearningOutcome')?.col, 1);
});

test('helper / hidden / counter columns are excluded (not mapped, not unmapped)', () => {
  for (const h of [
    'Helper',
    'Skill LO #',
    'Knowledge LO #',
    'Hour #',
    'Notes [to be hidden]',
    'Old col [to be deleted]',
  ]) {
    assert.equal(isExcludedHeader(h), true, `${h} should be excluded`);
  }
  const { byField, unmappedHeaders } = matchColumns(
    cells(['Daily Learning Outcome', 'Helper', 'Skill LO #', 'Notes [to be hidden]']),
  );
  assert.equal(byField.size, 1);
  assert.equal(unmappedHeaders.length, 0); // excluded ≠ unmapped
});

test('"Period #" is genuine content, NOT excluded', () => {
  assert.equal(isExcludedHeader('Period #'), false);
  const { byField } = matchColumns(cells(['Period #']));
  assert.equal(byField.get('period')?.col, 0);
});

test('a renamed / brand-new column lands in unmappedHeaders, parse continues', () => {
  const { byField, unmappedHeaders } = matchColumns(
    cells(['Year', 'Wibble Factor 9000', 'Month']),
  );
  assert.equal(byField.get('year')?.col, 0);
  assert.equal(byField.get('month')?.col, 2);
  assert.deepEqual(
    unmappedHeaders.map((u) => u.header),
    ['Wibble Factor 9000'],
  );
  assert.equal(unmappedHeaders[0].column, 'B');
});

test('each header maps to at most one field; leftmost wins ties', () => {
  const { byField } = matchColumns(cells(['Resources', 'Resources']));
  assert.equal(byField.get('resources')?.col, 0);
});
