// Calendar-date resolution for the planning board's curriculum weeks.
//
// ⚠️ TEMPORARY STOPGAP — read before changing. `public.term_week (week_no
// smallint pk, starts_on date)` is a HAND-MAINTAINED mapping from a curriculum
// teaching-week number to that week's real Monday. George applies the rows by
// SQL; the table is intentionally EMPTY for now and will be replaced wholesale
// by the warehouse / timetable schedule later. This helper is the SINGLE point
// that turns a teaching-week number into calendar facts, so swapping the source
// later is a one-file edit. Everything date-related on the board (the "· current"
// flag, the "Week of …" label, and the day-column dates) flows through here.
//
// Because the table is empty at runtime, callers MUST degrade gracefully: a
// missing row yields `{ mondayDate: null, isCurrent: false }` and NO date is ever
// fabricated (no "+7 from a guessed start" fallback). Only a real `term_week`
// row produces a date or a "current" week.

import type { createClient } from '@/lib/supabase/server';
import { addDays, mondayOf, todayInBeirut } from '@/lib/week';

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
 * contains today, by reading the (currently empty) `term_week` mapping. Returns
 * `{ mondayDate: null, isCurrent: false }` whenever the row is absent — the only
 * state until George seeds the table — so the board degrades to numbers + labels
 * with dates dormant. Reference tables are read-only to authenticated users, so
 * the auth'd client suffices.
 */
export async function resolveTermWeek(
  supabase: ServerSupabase,
  weekNo: number,
): Promise<TermWeekResolution> {
  const { data } = await supabase
    .from('term_week')
    .select('starts_on')
    .eq('week_no', weekNo)
    .maybeSingle();

  const mondayDate = (data as { starts_on?: string | null } | null)?.starts_on ?? null;
  if (!mondayDate) return { mondayDate: null, isCurrent: false };

  // ISO `YYYY-MM-DD` strings compare lexicographically, so no Date math is needed.
  // "Today" is Beirut wall-clock (the app's timezone), not UTC.
  const today = todayInBeirut();
  const isCurrent = today >= mondayDate && today <= addDays(mondayDate, 4);
  return { mondayDate, isCurrent };
}

/**
 * The teaching-week number whose real week contains today (Asia/Beirut), or `null`
 * when today falls outside every seeded term (holidays / gaps, or the table isn't
 * seeded yet). Resolved by matching today's Monday against `term_week.starts_on`, so
 * weekends resolve to their own Mon–Fri week. The board uses this to land on the
 * current week when the URL names no coordinate.
 */
export async function resolveCurrentTermWeekNo(
  supabase: ServerSupabase,
): Promise<number | null> {
  const monday = mondayOf(todayInBeirut());
  const { data } = await supabase
    .from('term_week')
    .select('week_no')
    .eq('starts_on', monday)
    .order('week_no', { ascending: true })
    .limit(1);

  const weekNo = (data?.[0] as { week_no?: number | null } | undefined)?.week_no;
  return typeof weekNo === 'number' ? weekNo : null;
}
