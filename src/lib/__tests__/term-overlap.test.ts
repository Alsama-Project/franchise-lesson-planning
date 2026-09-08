// The term-overlap guard is the ONLY thing standing between an edited date and a
// corrupted `term_week.week_no` (no DB trigger). These lock its rule: adjacency is
// not overlap, overlap needs BOTH a shared school AND a shared year, and an
// unscoped term corrupts nothing. Node's built-in runner (see package.json "test").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTermOverlap, termDatesOverlap, type TermScope } from '../term-overlap';

// A 12-week term starting 2027-05-17 spans Mondays 2027-05-17 .. 2027-08-02.
const base: TermScope = {
  id: 'A',
  startsOn: '2027-05-17',
  numWeeks: 12,
  schoolIds: ['s1'],
  years: [1, 2],
};

test('a term does not overlap itself in a list', () => {
  assert.equal(findTermOverlap(base, [base]), null);
});

test('back-to-back terms (one starts the Monday after the other ends) do not overlap', () => {
  // base ends its last week on 2027-08-02; the next week's Monday is 2027-08-09.
  const next: TermScope = { ...base, id: 'B', startsOn: '2027-08-09', numWeeks: 4 };
  assert.equal(termDatesOverlap(base, next), false);
  assert.equal(findTermOverlap(base, [next]), null);
});

test('sharing a single week counts as an overlap', () => {
  // Starts on base's last Monday — one shared teaching week.
  const clash: TermScope = { ...base, id: 'B', startsOn: '2027-08-02', numWeeks: 4 };
  assert.equal(termDatesOverlap(base, clash), true);
  const hit = findTermOverlap(base, [clash]);
  assert.equal(hit?.term.id, 'B');
});

test('overlapping dates but NO shared school → no conflict', () => {
  const other: TermScope = { ...base, id: 'B', schoolIds: ['s2'] };
  assert.equal(findTermOverlap(base, [other]), null);
});

test('overlapping dates but NO shared year → no conflict', () => {
  const other: TermScope = { ...base, id: 'B', years: [3, 4] };
  assert.equal(findTermOverlap(base, [other]), null);
});

test('overlap needs a shared school AND a shared year — the hit reports both intersections', () => {
  const other: TermScope = { ...base, id: 'B', schoolIds: ['s1', 's2'], years: [2, 3] };
  const hit = findTermOverlap(base, [other]);
  assert.deepEqual(hit?.schools, ['s1']);
  assert.deepEqual(hit?.years, [2]);
});

test('an unscoped candidate (no schools or no years) never conflicts — it produces no weeks', () => {
  assert.equal(findTermOverlap({ ...base, schoolIds: [] }, [{ ...base, id: 'B' }]), null);
  assert.equal(findTermOverlap({ ...base, years: [] }, [{ ...base, id: 'B' }]), null);
});

test('an unscoped OTHER term is skipped as a conflict source', () => {
  const inert: TermScope = { ...base, id: 'B', years: [] };
  assert.equal(findTermOverlap(base, [inert]), null);
});
