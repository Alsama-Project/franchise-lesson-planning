// Calendar-date resolution for the planning board's curriculum weeks.
//
// SOURCE OF TRUTH — `public.term_week` is a VIEW (migration 0062) derived from
// `term × term_school × term_year`. `week_no` is contiguous 1..N across holiday
// gaps but restarts PER `(school_id, year)`: Year 0 is February-anchored, Y1–6 are
// September-anchored, and each centre may carry its own dates, so a single global
// week sequence is meaningless. The view therefore returns ONE ROW PER
// `(school_id, year)` for every `week_no`. Every resolver here MUST filter by
// `(school_id, year)` — `week_no` alone is NOT unique and never assume it is.
// (Pre-0062 this file read a flat table keyed by a globally-unique `week_no`; that
// model is gone. `.eq('week_no', n).maybeSingle()` used to be safe and no longer is.)
//
// A term with no `term_school` OR no `term_year` link produces zero rows, so a
// missing row is the normal "no term calendar for this (centre, year)" state, not
// an error: it yields `{ mondayDate: null, isCurrent: false }` and NO date is ever
// fabricated (no "+7 from a guessed start" fallback). Only a real `term_week` row
// produces a date or a "current" week.
//
// ERRORS SURFACE — these resolvers THROW on a PostgREST error rather than swallowing
// it and degrading to null. A query failure and a genuine no-terms result must never
// look the same to a caller (that ambiguity is exactly what hid the 0062 breakage:
// a cardinality violation rendered as a polite "Term dates not set").
//
// DIVERGENCE (known limitation) — when a centre's years disagree on the calendar (a
// Y0-only February term, say), the same `week_no` maps to different `starts_on`
// across years. The board still shows ONE week header, so where a single answer is
// forced (`resolveCurrentTermWeekNo` / `resolveNearestTermWeekNo`, and the date in
// `resolveTermWeek`) we pick the LOWEST year deterministically. Designing a real
// multi-year header is future work; this keeps the pick stable meanwhile.

import type { createClient } from '@/lib/supabase/server';
import { addDays, daysBetween, mondayOf, todayInBeirut } from '@/lib/week';

/** The cookie-bound, RLS-scoped server client (never the service-role key). */
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export interface TermWeekResolution {
  /** The week's real Monday (`YYYY-MM-DD`) from `term_week.starts_on`, or `null` when no row exists. */
  mondayDate: string | null;
  /** Whether today falls within `[starts_on, starts_on + 4 days]`. Always `false` when there's no row. */
  isCurrent: boolean;
}

/**
 * Resolve a curriculum teaching-week number to its calendar Monday and whether it
 * contains today, for a centre and a set of curriculum years.
 *
 * Scoped to the active centre (`schoolId`) and the teacher's shown year bands
 * (`years`). RESOLVED IF ANY BAND RESOLVES — a `week_no` present for any of the
 * years counts as "the term calendar covers this week", so the board shows no
 * warning. The returned date is the LOWEST resolving year's Monday (the divergence
 * tie-break above). Returns `{ mondayDate: null, isCurrent: false }` only when no
 * band has a row — the honest "no term calendar for this centre/year" state.
 *
 * Throws on a PostgREST error. Returns unresolved (no query) when `schoolId` is null
 * or `years` is empty — there is nothing to scope against.
 */
export async function resolveTermWeek(
  supabase: ServerSupabase,
  schoolId: string | null,
  years: number[],
  weekNo: number,
): Promise<TermWeekResolution> {
  if (!schoolId || years.length === 0) return { mondayDate: null, isCurrent: false };

  const { data, error } = await supabase
    .from('term_week')
    .select('year, starts_on')
    .eq('school_id', schoolId)
    .eq('week_no', weekNo)
    .in('year', years)
    .order('year', { ascending: true });

  if (error) throw new Error(`resolveTermWeek: term_week query failed: ${error.message}`);

  // Lowest resolving year's Monday (rows already ordered by year ascending).
  const rows = (data ?? []) as Array<{ year: number | null; starts_on: string | null }>;
  const mondayDate = rows.find((r) => !!r.starts_on)?.starts_on ?? null;
  if (!mondayDate) return { mondayDate: null, isCurrent: false };

  // ISO `YYYY-MM-DD` strings compare lexicographically, so no Date math is needed.
  // "Today" is Beirut wall-clock (the app's timezone), not UTC.
  const today = todayInBeirut();
  const isCurrent = today >= mondayDate && today <= addDays(mondayDate, 4);
  return { mondayDate, isCurrent };
}

/**
 * The teaching-week number whose real week contains today (Asia/Beirut) for a centre
 * and set of years, or `null` when today falls outside every seeded term (holidays /
 * gaps, or the calendar isn't seeded for this centre). Resolved by matching today's
 * Monday against `term_week.starts_on`, so weekends resolve to their own Mon–Fri week.
 * The board uses this to land on the current week when the URL names no coordinate.
 *
 * When years diverge (the same Monday maps to different `week_no` across years), the
 * LOWEST year wins deterministically. Throws on a PostgREST error; returns `null`
 * (no query) when `schoolId` is null or `years` is empty.
 */
export async function resolveCurrentTermWeekNo(
  supabase: ServerSupabase,
  schoolId: string | null,
  years: number[],
): Promise<number | null> {
  if (!schoolId || years.length === 0) return null;

  const monday = mondayOf(todayInBeirut());
  const { data, error } = await supabase
    .from('term_week')
    .select('week_no, year')
    .eq('school_id', schoolId)
    .eq('starts_on', monday)
    .in('year', years)
    .order('year', { ascending: true })
    .order('week_no', { ascending: true })
    .limit(1);

  if (error) throw new Error(`resolveCurrentTermWeekNo: term_week query failed: ${error.message}`);

  const weekNo = (data?.[0] as { week_no?: number | null } | undefined)?.week_no;
  return typeof weekNo === 'number' ? weekNo : null;
}

/**
 * The teaching-week number the "This week" button jumps to: today's own term week
 * when seeded, else the NEAREST seeded term week (min |starts_on − today's Monday|).
 * Returns `null` only when the centre's years have no seeded weeks at all. Unlike
 * `resolveCurrentTermWeekNo` (which drives on-load defaulting and must stay exact),
 * this always lands on a real seeded week so the button is never a dead end while the
 * calendar's coverage lags today.
 *
 * Scoped to `(schoolId, years)`; ties in distance break to the LOWEST year (the
 * divergence tie-break). Throws on a PostgREST error; returns `null` (no query) when
 * `schoolId` is null or `years` is empty.
 */
export async function resolveNearestTermWeekNo(
  supabase: ServerSupabase,
  schoolId: string | null,
  years: number[],
): Promise<number | null> {
  if (!schoolId || years.length === 0) return null;

  // Prefer today's exact week when it's seeded.
  const exact = await resolveCurrentTermWeekNo(supabase, schoolId, years);
  if (exact != null) return exact;

  // Else pick the seeded week whose Monday is closest to today's Monday.
  const monday = mondayOf(todayInBeirut());
  const { data, error } = await supabase
    .from('term_week')
    .select('week_no, year, starts_on')
    .eq('school_id', schoolId)
    .in('year', years);

  if (error) throw new Error(`resolveNearestTermWeekNo: term_week query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    week_no: number | null;
    year: number | null;
    starts_on: string | null;
  }>;

  let bestWeekNo: number | null = null;
  let bestDistance = Infinity;
  let bestYear = Infinity;
  for (const row of rows) {
    if (typeof row.week_no !== 'number' || !row.starts_on || typeof row.year !== 'number') continue;
    const distance = Math.abs(daysBetween(monday, row.starts_on));
    // Nearest Monday wins; on a tie, the lowest year wins deterministically.
    if (distance < bestDistance || (distance === bestDistance && row.year < bestYear)) {
      bestDistance = distance;
      bestWeekNo = row.week_no;
      bestYear = row.year;
    }
  }
  return bestWeekNo;
}
