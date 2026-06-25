// GET /api/resources/[id]/file — resolve a resource to a short-lived signed URL
// and redirect to it. Without a query flag the file is served inline (so PDFs and
// images render in a new tab); `?download=1` forces a save with the original
// filename via Content-Disposition. Link-backed resources redirect to their
// external URL.
//
// URL generation runs SERVER-SIDE through the auth'd, RLS-scoped client — never
// the service-role key and never client-side. The resource lookup is itself
// RLS-scoped (a resource the caller may not see 404s), and the private bucket's
// `resources_storage_select_authenticated` policy gates the signed-URL mint. This
// mirrors the /api posture used by generate-resource / check-objective.
//
// NOTE: resources are currently org-wide readable (migration 0008:
// `resources_select_authenticated using (true)`) and carry a `subject_id` but no
// centre/school, so the (centre, subject) `subject_membership` boundary cannot be
// applied to them as-is. Tightening to subject membership is parked pending a
// product decision — see the branch summary.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORAGE_BUCKET = 'resources';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Recover a human filename from a stored object path of the shape
 * `${userId}/${uuid}-${safeName}` (see buildStoragePath in src/lib/resources).
 * Falls back to the last path segment when the prefix doesn't match.
 */
function filenameFromPath(filePath: string): string {
  const objectName = filePath.split('/').pop() ?? filePath;
  const stripped = objectName.replace(/^[0-9a-fA-F-]{36}-/, '');
  return stripped || objectName;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Not authenticated.', { status: 401 });

  // RLS-scoped lookup: a resource the caller may not see simply comes back null.
  const { data: resource } = await supabase
    .from('resources')
    .select('file_path, external_url')
    .eq('id', id)
    .maybeSingle();

  const row = resource as { file_path: string | null; external_url: string | null } | null;
  if (!row) return new NextResponse('Resource not found.', { status: 404 });

  // Link-backed resource: send the caller straight to the external URL.
  if (row.external_url) {
    try {
      return NextResponse.redirect(new URL(row.external_url));
    } catch {
      return new NextResponse('Resource link is invalid.', { status: 422 });
    }
  }
  if (!row.file_path) return new NextResponse('Resource has no file.', { status: 404 });

  const wantsDownload = request.nextUrl.searchParams.get('download') === '1';

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(
      row.file_path,
      SIGNED_URL_TTL_SECONDS,
      wantsDownload ? { download: filenameFromPath(row.file_path) } : undefined,
    );

  if (error || !data) {
    return new NextResponse('Could not generate a link for this file.', { status: 502 });
  }

  return NextResponse.redirect(data.signedUrl);
}
