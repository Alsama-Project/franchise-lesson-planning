import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/context-docs/guard';
import { parseUploadedDoc } from '@/lib/context-docs/parse-upload';
import { removeSourceDocument, uploadSourceDocument } from '@/lib/download/source-documents';

/**
 * POST /api/admin/context-docs/[id]/versions
 *
 * Admin-only. Replace a document: insert a new version at max(version)+1 and
 * deactivate the current one, in one transaction, via the `replace_ai_context_doc`
 * RPC (0066). The partial unique index `(doc_id) where is_active` forbids two
 * active versions, so the RPC deactivates before it inserts. Multipart/form-data
 * with a `file` field (.md / .txt verbatim, .docx converted). RLS client
 * throughout; the service-role key is never used.
 */
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Send the document as multipart/form-data with a "file" field.' },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 });
  }

  const parsed = await parseUploadedDoc(form);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const file = form.get('file');
  if (!(file instanceof File)) {
    // parsed.ok implies a valid file; this is a defensive guard for the uploader.
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const supabase = await createClient();

  // Retain the original bytes (Branch 2b) BEFORE the RPC, so a rollback is possible
  // if the RPC fails. RLS client → admin session owns the object (source-documents
  // is admin-only); the service-role key is never used. Parse output is unchanged.
  const uploaded = await uploadSourceDocument(supabase, gate.profile.id, file);
  if (!uploaded.ok) {
    return NextResponse.json(
      { error: 'Could not store the uploaded file. Please try again.' },
      { status: 500 },
    );
  }

  const { data, error } = await supabase.rpc('replace_ai_context_doc', {
    p_doc_id: id,
    p_body_md: parsed.text,
    p_original_filename: parsed.filename,
    p_original_storage_path: uploaded.path,
  });

  if (error) {
    // Roll back the orphaned object so a failed RPC never leaks storage.
    await removeSourceDocument(supabase, uploaded.path);
    // A missing / non-permitted doc surfaces as the RPC's "Document not found".
    const notFound = /not found/i.test(error.message ?? '');
    return NextResponse.json(
      { error: notFound ? 'Document not found.' : 'Could not save the new version. Please try again.' },
      { status: notFound ? 404 : 500 },
    );
  }

  return NextResponse.json({ version: data as number }, { status: 201 });
}
