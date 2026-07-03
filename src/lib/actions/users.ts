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
import { getCurrentProfile } from '@/lib/auth';
import { saveMembership } from '@/lib/actions/console';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface UsersActionResult {
  ok: boolean;
  error?: string;
}

/** The single access role a user is assigned in the role-first "Edit access" modal. */
export type AccessRole = 'admin' | 'teacher' | 'coordinator';

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

/** Approve a pending coordinator request → mints the coordinator_subject row via
 *  the admin-gated definer RPC. Idempotent (re-approving an already-decided
 *  request raises "not found" from the RPC, surfaced as an error). */
export async function approveCoordinatorRequest(requestId: string): Promise<UsersActionResult> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_coordinator_request', { p_request_id: requestId });
  if (error) return fail(error.message);

  revalidatePath('/settings');
  return { ok: true };
}

/** Reject a pending coordinator request → marks it rejected; grants nothing. */
export async function rejectCoordinatorRequest(requestId: string): Promise<UsersActionResult> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const supabase = await createClient();
  const { error } = await supabase.rpc('reject_coordinator_request', { p_request_id: requestId });
  if (error) return fail(error.message);

  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Set a user's access to exactly one role, reconciling BOTH membership models in a
 * single write. This is the sole writer behind the role-first "Edit access" modal;
 * every role switch and chip toggle re-runs it with the full desired state
 * (persist-on-the-spot), so it is naturally idempotent.
 *
 *   • admin       → `profiles.role='admin'` and NO rows in either model (admin
 *                   personas hold no spaces; both are cleared).
 *   • teacher     → `profiles.role='teacher'`, no coordinator rows, and
 *                   `subject_membership` reconciled to cartesian(schoolIds ×
 *                   subjectIds) at role='teacher'. Empty schools/subjects ⇒ no rows
 *                   ("teacher with no spaces" is expressible).
 *   • coordinator → `profiles.role='teacher'` (coordinator is NOT a global role —
 *                   see 0035/0012), no teacher rows, and `coordinator_subject`
 *                   reconciled to subjectIds (school-agnostic, all schools).
 *
 * The admin bit goes through `set_user_admin`, which raises on an illegal
 * last-active-admin demotion (the UI lock is belt-and-braces). Membership writes
 * go direct to the tables under their admin-gated RLS (`sm_admin_write` /
 * `cs_admin_write`). `membership_role` has no 'admin' value and `coordinator_subject`
 * has no school column, so neither write can escalate to org-admin or drift the
 * "all schools" guarantee. Admin-only here is a friendly first line; RLS is the
 * real backstop.
 */
export async function setUserAccess(
  userId: string,
  input: { role: AccessRole; schoolIds: string[]; subjectIds: string[] },
): Promise<UsersActionResult> {
  const guard = await requireAdmin();
  if (guard) return guard;
  if (!userId) return fail('Pick a person.');

  const { role, schoolIds, subjectIds } = input;
  const supabase = await createClient();

  // 1. Global admin bit. Enforces the last-active-admin invariant server-side.
  const { error: adminErr } = await supabase.rpc('set_user_admin', {
    p_user_id: userId,
    p_make_admin: role === 'admin',
  });
  if (adminErr) return fail(adminErr.message);

  // 2. Reconcile the two membership models to the chosen role.
  if (role === 'admin') {
    const clearMembership = await supabase.from('subject_membership').delete().eq('profile_id', userId);
    if (clearMembership.error) return fail(clearMembership.error.message);
    const clearCoord = await supabase.from('coordinator_subject').delete().eq('profile_id', userId);
    if (clearCoord.error) return fail(clearCoord.error.message);
  } else if (role === 'coordinator') {
    // Coordinator-ness lives only in coordinator_subject; clear every teacher row.
    const clearMembership = await supabase.from('subject_membership').delete().eq('profile_id', userId);
    if (clearMembership.error) return fail(clearMembership.error.message);
    const err = await reconcileCoordinatorSubjects(supabase, userId, subjectIds);
    if (err) return fail(err);
  } else {
    // Teacher: clear coordinator rows, then reconcile the teacher cartesian.
    const clearCoord = await supabase.from('coordinator_subject').delete().eq('profile_id', userId);
    if (clearCoord.error) return fail(clearCoord.error.message);

    if (schoolIds.length === 0 || subjectIds.length === 0) {
      // "Teacher with no spaces" — saveMembership rejects empty sets, so clear here.
      const clearMembership = await supabase.from('subject_membership').delete().eq('profile_id', userId);
      if (clearMembership.error) return fail(clearMembership.error.message);
    } else {
      // Reuse the Members-tab reconcile (diff desired cartesian vs existing).
      const res = await saveMembership({ profileId: userId, role: 'teacher', schoolIds, subjectIds });
      if (!res.ok) return fail(res.error ?? 'Something went wrong.');
    }
  }

  revalidatePath('/settings');
  return { ok: true };
}

/** Reconcile a user's coordinator_subject rows to exactly `subjectIds` (insert
 *  missing, delete deselected). Returns an error message, or null on success. */
async function reconcileCoordinatorSubjects(
  supabase: ServerClient,
  userId: string,
  subjectIds: string[],
): Promise<string | null> {
  const desired = new Set(subjectIds);

  const { data, error: readErr } = await supabase
    .from('coordinator_subject')
    .select('subject_id')
    .eq('profile_id', userId);
  if (readErr) return readErr.message;

  const existing = new Set(((data ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id));

  const toRemove = [...existing].filter((id) => !desired.has(id));
  const toInsert = [...desired].filter((id) => !existing.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('coordinator_subject')
      .delete()
      .eq('profile_id', userId)
      .in('subject_id', toRemove);
    if (error) return error.message;
  }
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('coordinator_subject')
      .insert(toInsert.map((subject_id) => ({ profile_id: userId, subject_id })));
    if (error) return error.message;
  }
  return null;
}
