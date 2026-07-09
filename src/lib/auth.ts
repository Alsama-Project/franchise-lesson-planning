// Server-side identity, role gates, and subject-membership helpers.
//
// The permission boundary is the (centre, subject) shared space, modelled by the
// `subject_membership` table. A person can be a member (role 'teacher') or a
// coordinator (role 'coordinator') of any number of spaces; the global
// `profiles.role = 'admin'` is org-wide. All reads go through the auth'd,
// cookie-bound client, so RLS scopes them. Membership/coordinator checks delegate
// to the security-definer SQL helpers (`is_member_of_subject`,
// `is_coordinator_of_subject`) so they read regardless of the caller's own row
// visibility — keep these names in sync with the migration.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Global role on `profiles.role`. Coordinator-ness now lives in subject_membership. */
export type AppRole = 'teacher' | 'coordinator' | 'admin';

/** Per-space role on a `subject_membership` row. */
export type MembershipRole = 'teacher' | 'coordinator';

export interface CurrentProfile {
  id: string;
  fullName: string | null;
  role: AppRole;
  email: string | null;
}

export interface Membership {
  id: string;
  schoolId: string;
  subjectId: string;
  role: MembershipRole;
  schoolName: string | null;
  subjectName: string | null;
}

/**
 * The signed-in user's profile (id, display name, global role), or null when not
 * authenticated. RLS lets a user read their own profile row.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  // database.types.ts is still a placeholder (untyped client) — narrow by hand.
  const row = data as { id: string; full_name: string | null; role: AppRole } | null;
  if (!row) return null;

  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role ?? 'teacher',
    email: user.email ?? null,
  };
}

/** True when the signed-in user is a global admin. */
export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin';
}

/**
 * Gate a Server Component / Route Handler to admins. Redirects to `/` when the
 * caller is not an admin (or not signed in). Returns the profile for convenience.
 */
export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') redirect('/');
  return profile;
}

/**
 * Gate to any of the given global roles. Redirects to `/` when the caller's role
 * is not in the list (or they are not signed in).
 */
export async function requireRole(...roles: AppRole[]): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || !roles.includes(profile.role)) redirect('/');
  return profile;
}

/**
 * The caller's subject_membership rows, joined to their school + subject names —
 * the spaces they belong to. RLS (`sm_read`) returns the caller's own rows (and
 * their teammates', which we filter out by `profile_id`).
 */
export async function getMyMemberships(): Promise<Membership[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('subject_membership')
    .select('id, school_id, subject_id, role, schools ( name ), subjects ( name )')
    .eq('profile_id', user.id);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    school_id: string;
    subject_id: string;
    role: MembershipRole;
    schools: { name: string } | null;
    subjects: { name: string } | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    schoolId: r.school_id,
    subjectId: r.subject_id,
    role: r.role,
    schoolName: r.schools?.name ?? null,
    subjectName: r.subjects?.name ?? null,
  }));
}

/**
 * The subject ids the caller COORDINATES — read from `coordinator_subject`, the
 * school-agnostic source of truth for coordinator-ness (migration 0040; legacy
 * per-school `subject_membership` coordinator rows were backfilled here and removed
 * in 0041). This is the SAME source the `lp_select`/`lp_write` RLS policies and
 * `is_coordinator_of_subject` read, so board routing, the review queue, and RLS all
 * agree on "who is a coordinator." RLS (`cs_self_read`) scopes the read to the
 * caller's own rows. Returns an empty set when signed out or coordinating nothing.
 */
export async function getMyCoordinatedSubjectIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('coordinator_subject')
    .select('subject_id')
    .eq('profile_id', user.id);

  return new Set(((data ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id));
}

/** True when the caller is a member of the (school, subject) space. */
export async function isMemberOf(schoolId: string, subjectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_member_of_subject', {
    p_school: schoolId,
    p_subject: subjectId,
  });
  if (error) return false;
  return data === true;
}

/** True when the caller is a coordinator of the (school, subject) space. */
export async function isCoordinatorOf(schoolId: string, subjectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_coordinator_of_subject', {
    p_school: schoolId,
    p_subject: subjectId,
  });
  if (error) return false;
  return data === true;
}
