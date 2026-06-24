import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, getMyMemberships } from '@/lib/auth';
import { importCurriculumWorkbook } from '@/lib/curriculum/import';
import { parseCurriculumWorkbook } from '@/lib/curriculum/parse';
import type { CurriculumSyncSource } from '@/lib/curriculum/types';

/**
 * POST /api/curriculum/import
 *
 * Receives one subject's curriculum workbook (xlsx) and syncs it into
 * `curriculum_lesson`: parse → upsert on the natural key → reconcile (deactivate
 * untouched rows) → record a `curriculum_sync_run` → revalidate the curriculum
 * cache tag. This single endpoint backs BOTH the n8n folder-watch and the in-app
 * "Refresh now"/upload.
 *
 * Body: the xlsx as raw binary, or multipart/form-data with a `file` field.
 * subject_code: query param `?subject_code=` or a multipart `subject_code` field.
 *
 * Auth — either path is accepted, anything else is rejected:
 *   (a) header `x-curriculum-secret: $CURRICULUM_IMPORT_SECRET`            → n8n
 *   (b) a signed-in session that is a member of `subject_code` OR an admin  → UI
 */
export async function POST(request: NextRequest) {
  // ── Read subject_code + workbook bytes (multipart or raw binary) ──
  let subjectCode = request.nextUrl.searchParams.get('subject_code') ?? '';
  const dryRunParam = request.nextUrl.searchParams.get('dryRun');
  let dryRun = dryRunParam === '1' || dryRunParam === 'true';
  let sheet = request.nextUrl.searchParams.get('sheet') ?? undefined;
  let fileName = '';
  let buffer: ArrayBuffer | null = null;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    const formSubject = form.get('subject_code');
    const formDryRun = form.get('dryRun');
    const formSheet = form.get('sheet');
    if (typeof formSubject === 'string' && formSubject) subjectCode = formSubject;
    if (typeof formDryRun === 'string' && (formDryRun === '1' || formDryRun === 'true')) dryRun = true;
    if (typeof formSheet === 'string' && formSheet) sheet = formSheet;
    if (file instanceof File) {
      buffer = await file.arrayBuffer();
      fileName = file.name;
    }
  } else {
    buffer = await request.arrayBuffer();
  }

  subjectCode = subjectCode.trim();
  if (!subjectCode) {
    return NextResponse.json({ error: 'Missing subject_code.' }, { status: 400 });
  }
  if (!buffer || buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Missing or empty workbook.' }, { status: 400 });
  }

  // ── Authorise: secret header (n8n) OR session membership/admin (UI) ──
  const source = await authorise(request, subjectCode);
  if (source === 'unauthenticated') {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (source === 'forbidden') {
    return NextResponse.json(
      { error: `Not permitted to import curriculum for "${subjectCode}".` },
      { status: 403 },
    );
  }

  // ── Dry-run: parse and return the operator report WITHOUT writing. This is the
  //    safety check when a workbook changes shape (column map, unmapped headers,
  //    missing fields, sample records) — no DB mutation, no sync run. ──
  if (dryRun) {
    try {
      const { report } = parseCurriculumWorkbook(buffer, subjectCode, { sheet, fileName });
      return NextResponse.json({ dryRun: true, report });
    } catch (err) {
      return NextResponse.json(
        { dryRun: true, error: err instanceof Error ? err.message : 'Failed to parse workbook.' },
        { status: 422 },
      );
    }
  }

  // ── Run the import ──
  const result = await importCurriculumWorkbook({ buffer, subjectCode, source });
  if (result.status === 'error') {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result);
}

type AuthOutcome = CurriculumSyncSource | 'unauthenticated' | 'forbidden';

/**
 * Resolve which (authorised) path this request used, or why it's rejected.
 * The secret path short-circuits to 'n8n'. The session path checks subject
 * membership or admin and resolves to 'upload'.
 */
async function authorise(request: NextRequest, subjectCode: string): Promise<AuthOutcome> {
  const secret = process.env.CURRICULUM_IMPORT_SECRET;
  const provided = request.headers.get('x-curriculum-secret');
  if (secret && provided && provided === secret) return 'n8n';

  const profile = await getCurrentProfile();
  if (!profile) return 'unauthenticated';
  if (profile.role === 'admin') return 'upload';

  // Member of this subject (in any school) may refresh it.
  const supabase = await createClient();
  const { data } = await supabase.from('subjects').select('id').eq('code', subjectCode).maybeSingle();
  const subjectId = (data as { id: string } | null)?.id;
  if (!subjectId) return 'forbidden';

  const memberships = await getMyMemberships();
  return memberships.some((m) => m.subjectId === subjectId) ? 'upload' : 'forbidden';
}
