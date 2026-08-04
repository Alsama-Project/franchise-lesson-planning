import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/context-docs/guard';
import { MAX_BYTES } from '@/lib/context-docs/parse-upload';
import { validateFrameHtml } from '@/lib/worksheet-frame/frame';

/**
 * POST /api/admin/worksheet-frame
 *
 * Admin-only. Upsert a subject's printed worksheet page frame (HTML) into
 * `worksheet_frame` — upload REPLACES, keyed on `subject_id`, no versions.
 * Multipart/form-data with a `file` field (`.html` only) plus a `subject_id` body
 * field. Same admin gate and size cap as the context-doc / AI-resource-guide
 * uploads. The upsert runs through the RLS client (the table's admin/coordinator
 * write policy is the backstop); the service-role key is never used.
 *
 * The HTML is REJECTED (never sanitised) when it omits the exercise slot marker or
 * contains a script vector — see validateFrameHtml. The app ships no HTML
 * sanitiser by design: a rejected upload is a better failure than silently altered
 * markup.
 */
export const runtime = 'nodejs';

const HTML_EXTENSION = '.html';
const HTML_MIMETYPE = 'text/html';

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Send the frame as multipart/form-data with a "file" field.' },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 });
  }

  const subjectId = (asString(form.get('subject_id')) ?? '').trim();
  if (!subjectId) {
    return NextResponse.json({ error: 'A subject is required.' }, { status: 400 });
  }

  const candidate = form.get('file');
  if (!(candidate instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  const file = candidate;

  const name = file.name.toLowerCase();
  const isHtml = name.endsWith(HTML_EXTENSION) || file.type === HTML_MIMETYPE;
  if (!isHtml) {
    return NextResponse.json(
      { error: `Unsupported file type. Upload a ${HTML_EXTENSION} file.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.round(MAX_BYTES / 1024)} KB).` },
      { status: 400 },
    );
  }

  const html = (await file.text()).trim();
  if (html.length === 0) {
    return NextResponse.json({ error: 'The frame is empty.' }, { status: 400 });
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_BYTES) {
    return NextResponse.json(
      { error: `Frame HTML is too large (max ${Math.round(MAX_BYTES / 1024)} KB).` },
      { status: 400 },
    );
  }

  const valid = validateFrameHtml(html);
  if (!valid.ok) {
    // Structured rejection: the upload panel lists every reason at once and names the
    // script lines. Distinct from the flat `{ error }` shape of the checks above.
    return NextResponse.json(
      {
        filename: file.name,
        missingMarker: valid.rejection.missingMarker,
        scriptLines: valid.rejection.scriptLines,
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('worksheet_frame')
    .upsert(
      {
        subject_id: subjectId,
        html,
        original_filename: file.name,
        updated_by: gate.profile.id,
      },
      { onConflict: 'subject_id' },
    );

  if (error) {
    return NextResponse.json(
      { error: 'Could not save the frame. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null;
}
