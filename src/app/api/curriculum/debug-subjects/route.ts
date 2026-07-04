import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth';
import { getCurriculumSubjectCodes } from '@/lib/curriculumUtils';

// TEMPORARY DIAGNOSTIC — remove after the /curriculum stale-dropdown root cause is
// pinned. Two cache-layer fixes to `fetchActiveRows` did not change the picker's
// 3-subject list, so this route reads the SAME source the picker uses (the cached
// `getCurriculumSubjectCodes`) AND a direct, uncached admin query of the ground truth,
// side by side, to locate the exact 7→3 reduction:
//   • cached == direct == 7          → reduction is client-side / elsewhere.
//   • cached == 3, direct == 7       → the cached entry is STILL stuck (bump inert).
//   • direct == 3                    → the DB itself has only 3 active subjects → a
//                                      DATA problem (dead rows / wrong subject_code /
//                                      deactivated), NOT a cache problem.
// Admin-only. GET /api/curriculum/debug-subjects
export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  // 1) The picker's actual source — cached getCurriculumSubjectCodes → fetchActiveRows.
  let cachedSubjectCodes: string[] = [];
  let cachedError: string | null = null;
  try {
    cachedSubjectCodes = await getCurriculumSubjectCodes();
  } catch (e) {
    cachedError = e instanceof Error ? e.message : String(e);
  }

  // 2) Ground truth — direct, uncached, service-role read (bypasses RLS + the cache).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('curriculum_lesson')
    .select('subject_code, is_active');
  const activeByCode: Record<string, number> = {};
  const inactiveByCode: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ subject_code: string; is_active: boolean }>) {
    const bucket = r.is_active ? activeByCode : inactiveByCode;
    bucket[r.subject_code] = (bucket[r.subject_code] ?? 0) + 1;
  }

  return NextResponse.json({
    ts: new Date().toISOString(),
    cached: {
      subjectCodes: cachedSubjectCodes,
      count: cachedSubjectCodes.length,
      error: cachedError,
    },
    directDb: {
      activeDistinct: Object.keys(activeByCode).sort(),
      activeDistinctCount: Object.keys(activeByCode).length,
      activeRowCountsBySubject: activeByCode,
      inactiveRowCountsBySubject: inactiveByCode,
      error: error?.message ?? null,
    },
  });
}
