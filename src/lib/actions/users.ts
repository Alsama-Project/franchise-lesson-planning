'use server';

// Mutations for the admin Users tab. Every write goes through the auth'd,
// cookie-bound client to the SECURITY DEFINER RPCs (set_user_admin /
// set_user_deactivated), which are themselves hard-gated on is_admin() and hold
// the real invariants (last-active-admin protection, no self-deactivate). The
// server-side admin check here is a friendly first line only.
//
// "Signed out on every device": session revocation is performed INSIDE
// set_user_deactivated (it deletes the user's auth.sessions rows as its definer
// owner). auth-js 2.108 has no by-user-id global logout in its admin API and the
// `auth` schema is not exposed via PostgREST, so this cannot be done from a
// service-role JS client — doing it in the RPC is both possible and atomic with
// the deactivation. See migration 0035.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, type MembershipRole } from '@/lib/auth';

export interface UsersActionResult {
  ok: boolean;
  error?: string;
}

function fail(error: string): UsersActionResult {
  return { ok: false, error };
}

async function requireAdmin(): Promise<UsersActionResult | null> {
  const profile = await getCurrentProfile();
  if (!profile) return fail('You must be signed in.');
  if (profile.role !== 'admin') return fail('Admins only.');
  return null;
}

/** Promote (makeAdmin=true) or demote (false) a user's global admin role. */
export async function setUserAdmin(
  userId: string,
  makeAdmin: boolean,
): Promise<UsersActionResult> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_user_admin', {
    p_user_id: userId,
    p_make_admin: makeAdmin,
  });
  if (error) return fail(error.message);

  revalidatePath('/settings');
  return { ok: true };
}

/** Deactivate (deactivated=true) or reactivate (false) a user. */
export async function setUserDeactivated(
  userId: string,
  deactivated: boolean,
): Promise<UsersActionResult> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_user_deactivated', {
    p_user_id: userId,
    p_deactivated: deactivated,
  });
  if (error) return fail(error.message);

  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Grant, switch, or revoke a user's membership of one (centre, subject) space.
 * `role` = 'teacher' | 'coordinator' upserts the row (the unique key means one row
 * per space, so switching role is a plain upsert — no separate delete); `role` =
 * null deletes the membership. Writes go direct to `subject_membership` under the
 * `sm_admin_write` RLS policy (admin-gated, `for all`), the same path the Members
 * tab's `saveMembership`/`removeMembership` already use. `membership_role` has no
 * 'admin' value, so this can never escalate a user to org-admin. Admin-only here
 * is a friendly first line; RLS is the real backstop.
 */
export async function setUserMembership(
  userId: string,
  schoolId: string,
  subjectId: string,
  role: MembershipRole | null,
): Promise<UsersActionResult> {
  const guard = await requireAdmin();
  if (guard) return guard;

  if (!userId || !schoolId || !subjectId) return fail('Pick a person and a subject space.');

  const supabase = await createClient();

  if (role === null) {
    const { error } = await supabase
      .from('subject_membership')
      .delete()
      .eq('profile_id', userId)
      .eq('school_id', schoolId)
      .eq('subject_id', subjectId);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase
      .from('subject_membership')
      .upsert(
        { profile_id: userId, school_id: schoolId, subject_id: subjectId, role },
        { onConflict: 'profile_id,school_id,subject_id' },
      );
    if (error) return fail(error.message);
  }

  revalidatePath('/settings');
  return { ok: true };
}
