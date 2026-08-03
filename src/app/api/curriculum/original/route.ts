import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { signSourceDocumentDownloadUrl } from '@/lib/download/source-documents';

/**
 * GET /api/curriculum/original?subject_code=CODE
 *
 * Admin-only download of the ORIGINAL workbook currently in force for a subject —
 * the retained `.xlsx` from the most recent SUCCESSFUL sync run. There is NO
 * derived fallback for curriculum (Branch 1 shipped none): if that run has no
 * retained original (e.g. it came from the n8n path, which retains nothing), this
 * is a 404 and the UI renders no control.
 *
 * Admin-gated in app code (the source-documents bucket is admin-only by RLS too).
 * RLS-scoped server client throughout — the service-role key is never used.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can download the curriculum workbook.' },
      { status: 403 },
    );
  }

  const subjectCode = (request.nextUrl.searchParams.get('subject_code') ?? '').trim();
  if (!subjectCode) {
    return NextResponse.json({ error: 'Missing subject_code.' }, { status: 400 });
  }

  // The most recent SUCCESSFUL run for this subject is the file currently in force.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('curriculum_sync_run')
    .select('original_storage_path, source_filename')
    .eq('subject_code', subjectCode)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not load the curriculum run.' }, { status: 500 });
  }
  const row = data as
    | { original_storage_path: string | null; source_filename: string | null }
    | null;
  if (!row || !row.original_storage_path) {
    // No retained original (never uploaded, or the latest run came from n8n).
    return NextResponse.json({ error: 'No stored workbook for this subject.' }, { status: 404 });
  }

  const downloadName = row.source_filename?.trim() || `${subjectCode}-curriculum.xlsx`;
  const url = await signSourceDocumentDownloadUrl(supabase, row.original_storage_path, downloadName);
  if (!url) {
    return NextResponse.json({ error: 'Could not generate a link for the workbook.' }, { status: 502 });
  }

  const redirect = NextResponse.redirect(url);
  redirect.headers.set('Cache-Control', 'no-store');
  return redirect;
}
