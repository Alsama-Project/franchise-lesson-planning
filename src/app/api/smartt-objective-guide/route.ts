import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { docxToMarkdown } from '@/lib/ai/docx';
import {
  originalOrDerivedDownload,
  removeSourceDocument,
  uploadSourceDocument,
} from '@/lib/download/source-documents';

export const dynamic = 'force-dynamic';

/**
 * POST /api/smartt-objective-guide
 *
 * Admin-only. Uploads a new version of the SMARTT objective guide — the
 * admin-authored steering text (Kadria's guidance) that shapes the objective
 * checker (Aya). Accepts a plain-text `.md` or `.txt` file, or a Word `.docx`, as
 * multipart/form-data (`file` field). Text files are read as-is; a `.docx` is
 * converted to markdown server-side (mammoth → HTML → turndown, images dropped).
 * Either way the resulting text is INSERTed as a new `smartt_objective_guide` row
 * (`uploaded_by` = the caller). Each upload is a new immutable version; the
 * latest is active.
 *
 * Auth: a signed-in admin only. Non-admins get 403; the table's RLS
 * (`smartt_objective_guide_insert_admin`) is the backstop.
 *
 * Faithful clone of /api/ai-resource-guide — different table, same posture.
 */

/** Max accepted guide size. The guide is composed into every check call, so a
 *  runaway upload would bloat the prompt; 256 KB is generous for prose. */
const MAX_BYTES = 256 * 1024;

/** Raw upload bound for a `.docx` (which may carry images we discard). This only
 *  caps what the parser ingests; the extracted text is held to {@link MAX_BYTES}. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Accepted plain-text extensions, read verbatim as the guide. */
const TEXT_EXTENSIONS = ['.md', '.txt'] as const;

/** Word document extension + mimetype, converted to markdown before storage. */
const DOCX_EXTENSION = '.docx';
const DOCX_MIMETYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** All accepted extensions, for the file-type error message. */
const ALLOWED_EXTENSIONS = [...TEXT_EXTENSIONS, DOCX_EXTENSION] as const;

export async function POST(request: NextRequest) {
  // ── Authorise: signed-in admin only ──
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can update the SMARTT objective guide.' },
      { status: 403 },
    );
  }

  // ── Read the uploaded file (multipart/form-data, `file` field) ──
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Send the guide as multipart/form-data with a "file" field.' },
      { status: 400 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get('file');
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const isDocx = name.endsWith(DOCX_EXTENSION) || file.type === DOCX_MIMETYPE;
  const isText = TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!isDocx && !isText) {
    return NextResponse.json(
      { error: `Unsupported file type. Upload a ${ALLOWED_EXTENSIONS.join(', ')} file.` },
      { status: 400 },
    );
  }

  // Bound the parser's input. Text guides are small; a .docx may carry images
  // (which we drop) so it gets a roomier raw cap — the real limit is applied to
  // the extracted text below.
  const rawCap = isDocx ? MAX_UPLOAD_BYTES : MAX_BYTES;
  if (file.size > rawCap) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.round(rawCap / 1024)} KB).` },
      { status: 400 },
    );
  }

  // Resolve the file to the guide text: .docx is converted to markdown
  // (images dropped); .md / .txt are read verbatim.
  let content: string;
  if (isDocx) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      content = (await docxToMarkdown(buffer)).trim();
    } catch {
      return NextResponse.json(
        { error: 'Could not read the Word document. Please check the file and try again.' },
        { status: 400 },
      );
    }
  } else {
    content = (await file.text()).trim();
  }

  // Validation, applied to the resolved text (non-empty + size cap).
  if (content.length === 0) {
    return NextResponse.json({ error: 'The guide file is empty.' }, { status: 400 });
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    return NextResponse.json(
      { error: `Guide text is too large (max ${Math.round(MAX_BYTES / 1024)} KB).` },
      { status: 400 },
    );
  }

  // ── Retain the original bytes (Branch 2a) ──
  // Store the raw file in the admin-only `source-documents` bucket via the RLS
  // client (the admin session owns the object); the service-role key is never
  // used. Parse output is unchanged — this is byte retention alongside it.
  const supabase = await createClient();
  const uploaded = await uploadSourceDocument(supabase, profile.id, file);
  if (!uploaded.ok) {
    return NextResponse.json(
      { error: 'Could not store the uploaded file. Please try again.' },
      { status: 500 },
    );
  }

  // ── Insert a new version (RLS enforces admin + uploaded_by = caller) ──
  // `original_filename` (0021) is display metadata; `original_storage_path`
  // (20260803140000) points at the retained original. The served `content` is
  // unchanged. We store the original (case-preserving) name.
  const { data, error } = await supabase
    .from('smartt_objective_guide')
    .insert({
      content,
      uploaded_by: profile.id,
      original_filename: file.name,
      original_storage_path: uploaded.path,
    })
    .select('id, created_at')
    .single();

  if (error) {
    // Roll back the orphaned object so a failed insert never leaks storage
    // (mirrors uploadWorksheetImageAction's cleanup).
    await removeSourceDocument(supabase, uploaded.path);
    return NextResponse.json(
      { error: 'Could not save the guide. Please try again.' },
      { status: 500 },
    );
  }

  const row = data as { id: string; created_at: string };
  return NextResponse.json({ id: row.id, created_at: row.created_at }, { status: 201 });
}

/**
 * GET /api/smartt-objective-guide
 *
 * Admin-only download of the guide CURRENTLY IN FORCE. Fallback chain (Branch 2a):
 * if the active version has a retained original (`original_storage_path`), redirect
 * to a short-lived signed URL that saves the byte-identical original under its true
 * filename; otherwise serve the derived `content` markdown as a `.md` attachment
 * (Branch 1 behaviour, unchanged — what pre-Branch-2a rows fall back to).
 *
 * Auth reuses the POST guard verbatim: getCurrentProfile() → 401 if none, 403
 * unless role === 'admin'; the table's admin-only RLS is the backstop. A missing
 * guide is a 404, never an empty file.
 *
 * Faithful clone of GET /api/ai-resource-guide — different table, same posture.
 */
export async function GET() {
  // ── Authorise: signed-in admin only (identical to POST) ──
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can update the SMARTT objective guide.' },
      { status: 403 },
    );
  }

  // Active version = latest created_at (mirrors get_active_smartt_guide()).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('smartt_objective_guide')
    .select('content, original_filename, original_storage_path, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not load the guide.' }, { status: 500 });
  }
  const row = data as
    | {
        content: string;
        original_filename: string | null;
        original_storage_path: string | null;
        created_at: string;
      }
    | null;
  if (!row || !row.content) {
    return NextResponse.json({ error: 'No guide uploaded.' }, { status: 404 });
  }

  // Prefer the retained original (byte-identical), else the derived `.md`.
  return originalOrDerivedDownload(supabase, {
    originalStoragePath: row.original_storage_path,
    originalFilename: row.original_filename,
    fallbackSlug: 'smartt-objective-guide',
    createdAt: row.created_at,
    derivedText: row.content,
  });
}
