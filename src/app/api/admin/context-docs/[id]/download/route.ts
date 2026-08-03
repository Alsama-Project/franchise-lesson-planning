import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/context-docs/guard';
import { originalOrDerivedDownload } from '@/lib/download/source-documents';

/**
 * GET /api/admin/context-docs/[id]/download
 *
 * Admin-only download of a context document's ACTIVE version. Fallback chain: if
 * the active version has a retained original (`original_storage_path`, Branch 2b),
 * redirect to a short-lived signed URL that saves the byte-identical original under
 * its true filename; otherwise serve the derived `body_md` markdown as a `.md`
 * attachment (Branch 1 behaviour — what pre-Branch-2b versions fall back to).
 *
 * Auth reuses the sibling routes' guard verbatim (`requireAdmin()`): 401 if not
 * signed in, 403 unless role === 'admin', with the tables' admin-only RLS (0063)
 * as the backstop. Everything runs through the RLS-scoped client — never the
 * service-role key. A document with no active version (or one the caller cannot
 * see) is a 404, never an empty file.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;

  const supabase = await createClient();
  // The active version is unique per doc (partial unique index in 0063).
  const { data, error } = await supabase
    .from('ai_context_doc_version')
    .select('body_md, original_filename, original_storage_path, created_at')
    .eq('doc_id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not load the document.' }, { status: 500 });
  }
  const row = data as
    | {
        body_md: string;
        original_filename: string | null;
        original_storage_path: string | null;
        created_at: string;
      }
    | null;
  if (!row || !row.body_md) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  // Prefer the retained original (byte-identical), else the derived `.md`.
  // Legacy versions may carry no filename; fall back to a stable slug of the
  // document id + the version date.
  return originalOrDerivedDownload(supabase, {
    originalStoragePath: row.original_storage_path,
    originalFilename: row.original_filename,
    fallbackSlug: id,
    createdAt: row.created_at,
    derivedText: row.body_md,
  });
}
