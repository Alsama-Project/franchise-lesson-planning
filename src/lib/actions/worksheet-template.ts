'use server';

// Server Action behind Template Mode's autosave + "Publish master" — the sole
// writer of `worksheet_template.body` (migration 0062). One row per subject; the
// upsert creates it on first save and updates it thereafter. Authorisation rides
// entirely on RLS: the INSERT/UPDATE policies permit only an admin or the
// coordinator OF THAT SUBJECT (`is_admin() OR is_coordinator_of_subject(null, subject_id)`).
// No service-role key, no schema change. Never writes a `lesson_plans` row.

import { createClient } from '@/lib/supabase/server';

export interface SaveWorksheetTemplateResult {
  ok: boolean;
  error?: string;
  /** Server timestamp of the write, for the autosave "Saved" indicator. */
  updated_at?: string;
}

/**
 * Autosave / publish a subject's master template body. The body is the SAME
 * unenforced jsonb shape as `lesson_plans.worksheet` (the v3 envelope). Stamps
 * `updated_by` with the caller so the console can show "last edited by whom"; the
 * `updated_at` trigger stamps the row on update, and the column default handles the
 * first insert.
 */
export async function saveWorksheetTemplate(
  subjectId: string,
  body: unknown,
): Promise<SaveWorksheetTemplateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('worksheet_template')
    .upsert(
      { subject_id: subjectId, body, updated_by: user.id },
      { onConflict: 'subject_id' },
    )
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Template not found or not permitted.' };

  return { ok: true, updated_at: (data as { updated_at: string }).updated_at };
}
