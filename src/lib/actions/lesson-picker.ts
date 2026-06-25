'use server';

// Server actions behind the new-lesson wizard's in-modal curriculum navigation.
// The board hands the wizard its opening (subject, year, month, week); as the
// teacher changes the year (step 1) or the Month/Week controls (step 2) the
// client re-queries through these. They are thin, auth-gated wrappers over the
// server-only curriculum utils (which read the global curriculum via the admin
// client) — the gate keeps the curriculum behind a signed-in session, matching
// the table's "authenticated read" RLS policy.

import { createClient } from '@/lib/supabase/server';
import { getCurriculumNav, getCurriculumWeekCells } from '@/lib/curriculumUtils';
import type { MonthNav, PickerCell } from '@/components/create-lesson/types';

/** Months (calendar order) with their available week numbers for a (subject, year). */
export async function loadPickerNav(subjectCode: string, year: number): Promise<MonthNav[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  if (!subjectCode || !Number.isFinite(year)) return [];
  return getCurriculumNav(subjectCode, year);
}

/** The period cells (one per period, sorted) for a (subject, year, month, week). */
export async function loadPickerCells(
  subjectCode: string,
  year: number,
  month: string,
  week: number,
): Promise<PickerCell[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  if (!subjectCode || !month || !Number.isFinite(year) || !Number.isFinite(week)) return [];
  return getCurriculumWeekCells(subjectCode, year, month, week);
}
