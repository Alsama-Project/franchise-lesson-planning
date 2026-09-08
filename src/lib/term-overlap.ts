// The term-overlap rule — the ONLY guard against two terms silently corrupting
// `term_week.week_no`.
//
// `week_no` is contiguous 1..N per (school_id, year); the view derives it with a
// `row_number()` over every term that shares a (school, year). Two terms that
// overlap in date on a shared (school, year) make that numbering meaningless —
// which lands learning outcomes and daily sessions on the wrong Mondays. There is
// no database trigger for this (migration 0062 defers it to the UI), so this
// single rule is load-bearing.
//
// It is imported by BOTH sides so they can never drift:
//   • the admin Term Calendar UI — to disable Save and explain in the amber strip;
//   • the server write path (createTerm / updateTerm) — to reject a write that
//     bypasses the UI. A disabled button alone is a leaky guard.
//
// Pure and dependency-light (only `addDays`), so it is unit-testable in isolation.

import { addDays } from '@/lib/week';

/** The overlap-relevant shape of a term: its Monday range and its scope sets. */
export interface TermScope {
  id: string;
  /** Monday (`YYYY-MM-DD`) of Week 1. */
  startsOn: string;
  /** Whole weeks the term spans (1..40). */
  numWeeks: number;
  /** Centres (`schools.id`) the term applies to — its `term_school` set. */
  schoolIds: string[];
  /** Curriculum years (0–6) the term applies to — its `term_year` set. */
  years: number[];
}

/**
 * A term occupies the half-open Monday range `[startsOn, startsOn + numWeeks·7)`.
 * Comparing half-open ranges with strict `<` is exactly "share at least one week":
 * it equals the inclusive test `A.start ≤ B.lastMonday AND B.start ≤ A.lastMonday`,
 * because on a 7-day grid `X ≤ lastMonday ⟺ X < lastMonday + 7`. ISO `YYYY-MM-DD`
 * strings order lexically the same as chronologically, so no Date parsing is needed.
 */
export function termDatesOverlap(
  a: { startsOn: string; numWeeks: number },
  b: { startsOn: string; numWeeks: number },
): boolean {
  const aEnd = addDays(a.startsOn, a.numWeeks * 7); // exclusive
  const bEnd = addDays(b.startsOn, b.numWeeks * 7); // exclusive
  return a.startsOn < bEnd && b.startsOn < aEnd;
}

/** The centres two terms share (intersection of their `term_school` sets). */
export function sharedSchools(a: TermScope, b: TermScope): string[] {
  return a.schoolIds.filter((s) => b.schoolIds.includes(s));
}

/** The curriculum years two terms share (intersection of their `term_year` sets). */
export function sharedYears(a: TermScope, b: TermScope): number[] {
  return a.years.filter((y) => b.years.includes(y));
}

export interface TermOverlapHit {
  /** The conflicting term. */
  term: TermScope;
  /** The centres both terms cover (non-empty). */
  schools: string[];
  /** The years both terms cover (non-empty). */
  years: number[];
}

/**
 * The first term in `others` that `candidate` would corrupt `week_no` with: dates
 * overlap AND they share at least one school AND at least one year. Returns the hit
 * (with the shared scope, for the message) or `null` when none conflict.
 *
 * A term with no schools OR no years produces zero weeks, so it can corrupt nothing
 * and never conflicts — matching the view, where such a term contributes no rows.
 * `candidate.id` is skipped so a term never conflicts with itself.
 */
export function findTermOverlap(candidate: TermScope, others: TermScope[]): TermOverlapHit | null {
  if (candidate.schoolIds.length === 0 || candidate.years.length === 0) return null;
  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (other.schoolIds.length === 0 || other.years.length === 0) continue;
    if (!termDatesOverlap(candidate, other)) continue;
    const schools = sharedSchools(candidate, other);
    if (schools.length === 0) continue;
    const years = sharedYears(candidate, other);
    if (years.length === 0) continue;
    return { term: other, schools, years };
  }
  return null;
}
