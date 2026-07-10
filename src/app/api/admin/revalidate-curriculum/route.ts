import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { isAdmin } from '@/lib/auth';
import { CURRICULUM_CACHE_TAG } from '@/lib/curriculumUtils';

/**
 * GET /api/admin/revalidate-curriculum
 *
 * Admin-only escape hatch to bust the curriculum reference cache without running
 * an import. The subject dropdown (via `getCurriculumSubjectCodes`) reads through
 * an `unstable_cache` entry tagged `CURRICULUM_CACHE_TAG`, which normally only
 * revalidates on the import path. This drops that cached read on demand.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  // Expire immediately (matches the import path) so the next read misses the
  // stale entry rather than serving it stale-while-revalidate.
  revalidateTag(CURRICULUM_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
