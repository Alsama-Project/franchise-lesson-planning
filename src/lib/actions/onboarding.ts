'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** A soft, non-fatal note (e.g. classes couldn't be saved under current RLS). */
  warning?: string;
}

export type OnboardingRole = 'teacher' | 'coordinator';

export interface FinishOnboardingInput {
  fullName: string;
  role: OnboardingRole;
  schoolId: string;
  subjectIds: string[];
  classIds: string[];
}

/**
 * Persist the onboarding choices, then route the user.
 *
 * Common: update `profiles.full_name` when it changed.
 *
 * Teacher (unchanged): self-provision via the `complete_onboarding` SECURITY
 * DEFINER RPC — the only self-service write path for `subject_membership` and
 * `class_teachers` (neither has a permissive client INSERT policy). It joins one
 * membership per (centre, subject) as role 'teacher' and self-assigns the ticked
 * classes, scoped to those spaces. Idempotent, so re-running never duplicates.
 * Redirects into the app.
 *
 * Coordinator (new): grants NO access. File a pending request for the single
 * chosen subject via `request_coordinator_access` (centre/classes ignored —
 * coordinators are school-agnostic), then redirect back to `/onboarding`, where
 * the page renders the "pending approval" screen. Only an admin approval mints
 * coordinator access.
 */
export async function finishOnboarding(input: FinishOnboardingInput): Promise<ActionResult> {
  const name = input.fullName.trim();
  if (!name) return { ok: false, error: 'Enter your name.' };

  const isCoordinator = input.role === 'coordinator';

  if (isCoordinator) {
    if (input.subjectIds.length !== 1) {
      return { ok: false, error: 'Choose the subject you coordinate.' };
    }
  } else {
    if (!input.schoolId) return { ok: false, error: 'Choose your centre.' };
    if (input.subjectIds.length === 0) return { ok: false, error: 'Choose at least one subject.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Name (only write when it actually changed).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  if ((profile as { full_name: string | null } | null)?.full_name !== name) {
    const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
    if (error) return { ok: false, error: error.message };
  }

  if (isCoordinator) {
    // Coordinator: file a pending request only — grants nothing. The request
    // lives in `coordinator_request` (a separate table invisible to every access
    // reader), so no access is granted until an admin approves.
    const { error: reqErr } = await supabase.rpc('request_coordinator_access', {
      p_subject_id: input.subjectIds[0],
    });
    if (reqErr) return { ok: false, error: reqErr.message };

    revalidatePath('/onboarding');
    redirect('/onboarding');
  }

  // Teacher: memberships + class assignments — via the SECURITY DEFINER RPC (the
  // only self-service write path; neither `subject_membership` nor
  // `class_teachers` has a permissive client INSERT policy). Role is hardcoded to
  // 'teacher' and classes are scoped to the joined spaces inside the function;
  // idempotent.
  const { error: rpcErr } = await supabase.rpc('complete_onboarding', {
    p_centre_id: input.schoolId,
    p_subject_ids: input.subjectIds,
    p_class_ids: input.classIds,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  revalidatePath('/');
  redirect('/');
}

export interface SaveSettingsInput {
  fullName?: string;
  /** Spaces to join: one (centre, subject) pair per entry. */
  addSpaces: Array<{ schoolId: string; subjectId: string }>;
  /** `subject_membership` ids to leave. */
  removeSpaceIds: string[];
  /**
   * The FULL set of class ids the caller should be assigned to — declarative,
   * reconciled by `set_my_classes` within the caller's own subject spaces. Omit
   * (undefined) to leave class assignments untouched (e.g. a name-only save).
   */
  classIds?: string[];
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

  // Join spaces — through the same controlled RPC as onboarding (role hardcoded
  // to 'teacher', idempotent). addSpaces may span several centres, so call once
  // per centre with that centre's subjects.
  if (input.addSpaces.length > 0) {
    const subjectsByCentre = new Map<string, string[]>();
    for (const s of input.addSpaces) {
      const list = subjectsByCentre.get(s.schoolId) ?? [];
      list.push(s.subjectId);
      subjectsByCentre.set(s.schoolId, list);
    }
    for (const [schoolId, subjectIds] of subjectsByCentre) {
      const { error } = await supabase.rpc('complete_onboarding', {
        p_centre_id: schoolId,
        p_subject_ids: subjectIds,
      });
      if (error) return { ok: false, error: error.message };
    }
  }

  // Classes — reconcile the caller's assignments to the ticked set through the
  // `set_my_classes` SECURITY DEFINER RPC. `class_teachers` has no client-write
  // policy (0006 is select-only); this definer RPC is the sole self-service
  // path, scoped to the caller's own subject spaces (mirrors onboarding). A
  // failure here is a real error — surfaced, not swallowed into a soft warning.
  if (input.classIds !== undefined) {
    const { error } = await supabase.rpc('set_my_classes', { p_class_ids: input.classIds });
    if (error) {
      const t = await getTranslations('settings');
      return { ok: false, error: t('profile.classesSaveError') };
    }
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true };
}
