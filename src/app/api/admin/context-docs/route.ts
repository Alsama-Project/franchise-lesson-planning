import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, validateScope } from '@/lib/context-docs/guard';
import { parseUploadedDoc } from '@/lib/context-docs/parse-upload';
import { removeSourceDocument, uploadSourceDocument } from '@/lib/download/source-documents';

/**
 * POST /api/admin/context-docs
 *
 * Admin-only. Create a context document and its first version (v1, active) in one
 * transaction. Multipart/form-data with a `file` field (.md / .txt verbatim,
 * .docx converted to markdown) plus body fields: `layer`, `subject_id`, `tool`,
 * `name`. The (layer, subject_id, tool) combination is validated against the DB
 * `ai_context_doc_scope` CHECK before insert so a bad combination returns a clear
 * 400. The insert runs through the RLS client via the `create_ai_context_doc`
 * RPC (0066); the service-role key is never used.
 */
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

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

  const scope = validateScope({
    layer: asString(form.get('layer')),
    subjectId: asString(form.get('subject_id')),
    tool: asString(form.get('tool')),
  });
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: 400 });

  const name = (asString(form.get('name')) ?? '').trim();
  if (!name) return NextResponse.json({ error: 'A document name is required.' }, { status: 400 });

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

  const { data, error } = await supabase.rpc('create_ai_context_doc', {
    p_layer: scope.layer,
    p_subject_id: scope.subjectId,
    p_tool: scope.tool,
    p_name: name,
    p_body_md: parsed.text,
    p_original_filename: parsed.filename,
    p_original_storage_path: uploaded.path,
  });

  if (error) {
    // Roll back the orphaned object so a failed RPC never leaks storage.
    await removeSourceDocument(supabase, uploaded.path);
    return NextResponse.json(
      { error: 'Could not save the document. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data as string }, { status: 201 });
}

function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null;
}
