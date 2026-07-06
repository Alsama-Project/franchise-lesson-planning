'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, getMyMemberships } from '@/lib/auth';
import { importCurriculumWorkbook } from '@/lib/curriculum/import';
import type { UnresolvedCurriculumRow } from '@/lib/curriculum/types';

/**
 * List a subject's active `curriculum_lesson` rows that have no daily outcome — the
 * live backing for the "Review N unresolved" inspector on Settings > Curriculum. These
 * are benign structural rows (weekly-grain / no daily-outcome column), surfaced so the
 * count is inspectable; nothing is mutated. Read through the auth'd client (curriculum
 * is RLS-readable by any authenticated user); requires a signed-in profile.
 */
export async function listUnresolvedCurriculumRows(
  subjectCode: string,
): Promise<UnresolvedCurriculumRow[]> {
  const code = subjectCode.trim();
  if (!code) return [];
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('curriculum_lesson_active')
    .select('lesson_key, year, week, period')
    .eq('subject_code', code)
    .is('daily_outcome', null)
    .order('year', { ascending: true })
    .order('week', { ascending: true })
    .order('period', { ascending: true, nullsFirst: true });
  if (error) throw new Error(`Failed to load unresolved rows: ${error.message}`);

  return ((data ?? []) as Array<{
    lesson_key: string;
    year: number;
    week: number;
    period: number | null;
  }>).map((r) => ({ lessonKey: r.lesson_key, year: r.year, week: r.week, period: r.period }));
}

// In-app "Refresh now" / manual upload. This is the UI path of the import — it
// re-checks authorisation server-side (admin, or a member of the subject) and then
// runs the same import as the n8n endpoint, with source 'upload'. The visible
// controls are a separate design slice; this action + the minimal admin control
// exist to exercise the path end-to-end.

export interface CurriculumImportState {
  ok: boolean;
  message: string;
}

export async function importCurriculumAction(
  _prev: CurriculumImportState | null,
  formData: FormData,
): Promise<CurriculumImportState> {
  const subjectCode = String(formData.get('subject_code') ?? '').trim();
  const file = formData.get('file');

  if (!subjectCode) return { ok: false, message: 'Choose a subject.' };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose an .xlsx file to upload.' };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: 'You must be signed in.' };

  if (profile.role !== 'admin') {
    const supabase = await createClient();
    const { data } = await supabase
      .from('subjects')
      .select('id')
      .eq('code', subjectCode)
      .maybeSingle();
    const subjectId = (data as { id: string } | null)?.id;
    const memberships = await getMyMemberships();
    if (!subjectId || !memberships.some((m) => m.subjectId === subjectId)) {
      return { ok: false, message: `You can't refresh curriculum for "${subjectCode}".` };
    }
  }

  const buffer = await file.arrayBuffer();
  const result = await importCurriculumWorkbook({
    buffer,
    subjectCode,
    source: 'upload',
    fileName: file.name,
  });
  if (result.status === 'error') {
    return { ok: false, message: result.error ?? 'Import failed.' };
  }
  return {
    ok: true,
    message:
      `Synced ${result.rowsUpserted} lessons for "${subjectCode}" · ` +
      `${result.unresolved} without a daily outcome · ${result.rowsDeactivated} deactivated.`,
  };
}

/**
 * PUBLISH A NEW curriculum version for a subject from an uploaded workbook. This is a
 * DISTINCT action from `importCurriculumAction` (a reconcile): it writes every parsed
 * row under a fresh version and makes it active, leaving the prior version's rows —
 * and every plan pinned to them — untouched. Admin-only (heavier than a routine
 * re-sync); the guards do not run because nothing is dropped from the active set.
 */
export async function publishCurriculumVersionAction(
  _prev: CurriculumImportState | null,
  formData: FormData,
): Promise<CurriculumImportState> {
  const subjectCode = String(formData.get('subject_code') ?? '').trim();
  const file = formData.get('file');

  if (!subjectCode) return { ok: false, message: 'Choose a subject.' };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose an .xlsx file to publish.' };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: 'You must be signed in.' };
  if (profile.role !== 'admin') {
    return { ok: false, message: 'Only an admin can publish a new curriculum version.' };
  }

  const buffer = await file.arrayBuffer();
  const result = await importCurriculumWorkbook({
    buffer,
    subjectCode,
    source: 'upload',
    fileName: file.name,
    newVersion: true,
  });
  if (result.status === 'error') {
    return { ok: false, message: result.error ?? 'Publish failed.' };
  }
  return {
    ok: true,
    message:
      `Published version ${result.newVersionNo ?? '?'} for "${subjectCode}" · ` +
      `${result.rowsUpserted} lessons · ${result.unresolved} without a daily outcome. ` +
      `Existing plans stay on their previous version.`,
  };
}
