'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** A soft, non-fatal note (e.g. classes couldn't be saved under current RLS). */
  warning?: string;
}

export interface FinishOnboardingInput {
  fullName: string;
  schoolId: string;
  subjectIds: string[];
  classIds: string[];
}

/**
 * Persist the onboarding choices, then send the user into the app.
 *
 * 1. Update `profiles.full_name` when it changed.
 * 2. Self-join one `subject_membership` per (centre, subject) as role 'teacher'
 *    (RLS `sm_self_join` permits this). Upsert is idempotent on the unique key.
 * 3. Best-effort `class_teachers` self-assign for any ticked classes.
 *
 * Classes are an optional feature and `class_teachers` has no self-insert RLS
 * policy in the current schema, so a class write may be rejected; that is
 * surfaced as a non-fatal warning rather than blocking onboarding.
 */
export async function finishOnboarding(input: FinishOnboardingInput): Promise<ActionResult> {
  const name = input.fullName.trim();
  if (!name) return { ok: false, error: 'Enter your name.' };
  if (!input.schoolId) return { ok: false, error: 'Choose your centre.' };
  if (input.subjectIds.length === 0) return { ok: false, error: 'Choose at least one subject.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // 1. Name (only write when it actually changed).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  if ((profile as { full_name: string | null } | null)?.full_name !== name) {
    const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
    if (error) return { ok: false, error: error.message };
  }

  // 2. Subject memberships.
  const rows = input.subjectIds.map((subjectId) => ({
    profile_id: user.id,
    school_id: input.schoolId,
    subject_id: subjectId,
    role: 'teacher' as const,
  }));
  const { error: memberErr } = await supabase
    .from('subject_membership')
    .upsert(rows, { onConflict: 'profile_id,school_id,subject_id', ignoreDuplicates: true });
  if (memberErr) return { ok: false, error: memberErr.message };

  // 3. Classes (best-effort).
  let warning: string | undefined;
  if (input.classIds.length > 0) {
    const ct = input.classIds.map((classId) => ({ class_id: classId, teacher_id: user.id }));
    const { error: ctErr } = await supabase
      .from('class_teachers')
      .upsert(ct, { onConflict: 'class_id,teacher_id', ignoreDuplicates: true });
    if (ctErr) warning = 'Your spaces were saved; classes could not be saved yet.';
  }

  revalidatePath('/');
  if (warning) return { ok: true, warning };
  redirect('/');
}

export interface SaveSettingsInput {
  fullName?: string;
  /** Spaces to join: one (centre, subject) pair per entry. */
  addSpaces: Array<{ schoolId: string; subjectId: string }>;
  /** `subject_membership` ids to leave. */
  removeSpaceIds: string[];
  addClassIds: string[];
  removeClassIds: string[];
}

/**
 * Apply a settings delta on Save — additive/subtractive only, never a
 * nuke-and-recreate. Name, space joins/leaves, and class add/remove are written
 * in one pass. Refuses to leave the caller's last remaining space.
 */
export async function saveSettings(input: SaveSettingsInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Guard the last space: don't let a save remove every membership.
  if (input.removeSpaceIds.length > 0) {
    const { count } = await supabase
      .from('subject_membership')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id);
    const remaining = (count ?? 0) - input.removeSpaceIds.length + input.addSpaces.length;
    if (remaining < 1) {
      return { ok: false, error: 'You must belong to at least one subject space.' };
    }
  }

  // Name.
  if (input.fullName !== undefined) {
    const name = input.fullName.trim();
    if (!name) return { ok: false, error: 'Your name can’t be empty.' };
    const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
    if (error) return { ok: false, error: error.message };
  }

  // Leave spaces (RLS scopes the delete to the caller's own rows).
  if (input.removeSpaceIds.length > 0) {
    const { error } = await supabase
      .from('subject_membership')
      .delete()
      .in('id', input.removeSpaceIds)
      .eq('profile_id', user.id);
    if (error) return { ok: false, error: error.message };
  }

  // Join spaces.
  if (input.addSpaces.length > 0) {
    const rows = input.addSpaces.map((s) => ({
      profile_id: user.id,
      school_id: s.schoolId,
      subject_id: s.subjectId,
      role: 'teacher' as const,
    }));
    const { error } = await supabase
      .from('subject_membership')
      .upsert(rows, { onConflict: 'profile_id,school_id,subject_id', ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }

  // Classes (best-effort; see finishOnboarding note).
  let warning: string | undefined;
  if (input.removeClassIds.length > 0) {
    const { error } = await supabase
      .from('class_teachers')
      .delete()
      .in('class_id', input.removeClassIds)
      .eq('teacher_id', user.id);
    if (error) warning = 'Saved, but class changes could not be applied yet.';
  }
  if (input.addClassIds.length > 0) {
    const ct = input.addClassIds.map((classId) => ({ class_id: classId, teacher_id: user.id }));
    const { error } = await supabase
      .from('class_teachers')
      .upsert(ct, { onConflict: 'class_id,teacher_id', ignoreDuplicates: true });
    if (error) warning = 'Saved, but class changes could not be applied yet.';
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return warning ? { ok: true, warning } : { ok: true };
}
