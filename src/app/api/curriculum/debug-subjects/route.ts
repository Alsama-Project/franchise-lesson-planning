import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth';
import { getCurriculumSubjectCodes } from '@/lib/curriculumUtils';

// TEMPORARY DIAGNOSTIC — remove after the /curriculum fix is verified. Reports the
// picker's actual source (`getCurriculumSubjectCodes`) beside a direct, UNCAPPED
// ground-truth read, so the post-fix check is trustworthy. Both `directDb` reads use
// PostgREST `count` (head:true), which returns the true total regardless of the
// 1000-row row cap — the row cap only truncates returned ROWS, never the count. After
// the scoped-reads fix + migration 0047, both `cached.count` and
// `directDb.activeDistinctCount` must read 7 / 6071.
// Admin-only. GET /api/curriculum/debug-subjects
export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  // 1) The picker's actual source (now the curriculum_active_subjects view).
  let cachedSubjectCodes: string[] = [];
  let cachedError: string | null = null;
  try {
    cachedSubjectCodes = await getCurriculumSubjectCodes();
  } catch (e) {
    cachedError = e instanceof Error ? e.message : String(e);
  }

  // 2) Ground truth — service-role, UNCAPPED per-subject counts. Iterate the subjects
  //    reference table and COUNT active rows per code (head:true → count only, no rows,
  //    so the 1000-row cap is irrelevant).
  const admin = createAdminClient();
  const { count: activeTotal } = await admin
    .from('curriculum_lesson')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { data: subjectRows } = await admin.from('subjects').select('code');
  const activeByCode: Record<string, number> = {};
  for (const s of (subjectRows ?? []) as Array<{ code: string }>) {
    const { count } = await admin
      .from('curriculum_lesson')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('subject_code', s.code);
    if (count && count > 0) activeByCode[s.code] = count;
  }

  return NextResponse.json({
    ts: new Date().toISOString(),
    cached: {
      subjectCodes: cachedSubjectCodes,
      count: cachedSubjectCodes.length,
      error: cachedError,
    },
    directDb: {
      activeTotalRows: activeTotal ?? null,
      activeDistinct: Object.keys(activeByCode).sort(),
      activeDistinctCount: Object.keys(activeByCode).length,
      activeRowCountsBySubject: activeByCode,
    },
  });
}
