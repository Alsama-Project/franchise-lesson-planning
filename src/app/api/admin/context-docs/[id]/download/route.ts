import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/context-docs/guard';
import { deriveMarkdownFilename, textAttachmentResponse } from '@/lib/download/text-attachment';

/**
 * GET /api/admin/context-docs/[id]/download
 *
 * Admin-only download of a context document's ACTIVE version text — the
 * `body_md` (markdown) that this document currently contributes to the AI prompt
 * stack. This is the derived current text, not the original uploaded file (the
 * bytes are not retained; original-byte retention is a separate branch). Served
 * as a `.md` attachment.
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
    .select('body_md, original_filename, created_at')
    .eq('doc_id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not load the document.' }, { status: 500 });
  }
  const row = data as
    | { body_md: string; original_filename: string | null; created_at: string }
    | null;
  if (!row || !row.body_md) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const filename = deriveMarkdownFilename({
    originalFilename: row.original_filename,
    // Legacy versions may carry no filename; fall back to a stable slug of the
    // document id + the version date.
    fallbackSlug: id,
    createdAt: row.created_at,
  });
  return textAttachmentResponse(filename, row.body_md);
}
