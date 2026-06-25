'use server';

// Mutations for the settings console. Every write goes through the auth'd,
// cookie-bound client, so RLS is the real backstop: admins write org structure
// and any membership (sm_admin_write); coordinators write only within their own
// (centre, subject) space (sm_coord_write). The server-side role checks here are
// a friendly first line — a non-admin physically cannot write these rows even if
// a check were bypassed. The service-role key is never used on this path.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import type { MembershipRole } from '@/lib/auth';

export interface ConsoleResult {
  ok: boolean;
  error?: string;
}

function ok(): ConsoleResult {
  return { ok: true };
}
function fail(error: string): ConsoleResult {
  return { ok: false, error };
}

async function requireAdmin(): Promise<{ id: string } | ConsoleResult> {
  const profile = await getCurrentProfile();
  if (!profile) return fail('You must be signed in.');
  if (profile.role !== 'admin') return fail('Admins only.');
  return { id: profile.id };
}

function isFail(x: { id: string } | ConsoleResult): x is ConsoleResult {
  return 'ok' in x;
}

function revalidateConsole() {
  revalidatePath('/settings');
  revalidatePath('/');
}

// ── Centres ───────────────────────────────────────────────────────────────────

export async function createCentre(input: { name: string; region?: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const name = input.name.trim();
  if (!name) return fail('Enter a centre name.');
  const region = input.region?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from('schools').insert({ name, region });
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function renameCentre(input: { id: string; name: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const name = input.name.trim();
  if (!name) return fail('Enter a centre name.');

  const supabase = await createClient();
  const { error } = await supabase.from('schools').update({ name }).eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function archiveCentre(input: { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();
  // Hard block: a centre with any non-archived class can't be archived.
  const { count } = await supabase
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', input.id)
    .is('archived_at', null);
  if ((count ?? 0) > 0) {
    return fail(
      `${count} ${count === 1 ? 'class' : 'classes'} still reference this centre. Reassign or archive those classes first.`,
    );
  }

  const { error } = await supabase
    .from('schools')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function restoreCentre(input: { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('schools').update({ archived_at: null }).eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

// ── Subjects ──────────────────────────────────────────────────────────────────

/** Case-insensitive code-uniqueness check, optionally excluding one subject id. */
async function codeTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
  excludeId?: string,
): Promise<string | null> {
  const { data } = await supabase.from('subjects').select('id, name, code').ilike('code', code);
  const rows = (data ?? []) as Array<{ id: string; name: string; code: string }>;
  const clash = rows.find((r) => r.id !== excludeId);
  return clash ? clash.name : null;
}

/**
 * Derive a subject's curriculum-match code from its name. `code` is the join key
 * to `curriculum_lesson.subject_code`, so it is system-managed (never user input)
 * and follows the seeded convention — a lowercase slug ('English' → 'english').
 * Returns '' when the name has no Latin letters/digits to slug (caller rejects).
 */
function deriveSubjectCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function createSubject(input: { name: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const name = input.name.trim();
  if (!name) return fail('Enter a subject name.');

  // Code is derived, not entered — it must match the curriculum source's
  // subject_code (see deriveSubjectCode). Reject names that yield no usable code.
  const code = deriveSubjectCode(name);
  if (!code) return fail('Enter a subject name with Latin letters or numbers.');

  const supabase = await createClient();
  const clashName = await codeTaken(supabase, code);
  if (clashName) {
    return fail(`That name maps to code "${code}", already used by ${clashName}. Choose a different name.`);
  }

  const { error } = await supabase.from('subjects').insert({ name, code });
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function updateSubject(input: {
  id: string;
  name: string;
}): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const name = input.name.trim();
  if (!name) return fail('Enter a subject name.');

  // Only the display name is editable. `code` is immutable after creation —
  // recomputing it from a renamed subject would orphan that subject's
  // curriculum_lesson rows (matched by subject_code), silently breaking
  // curriculum lookups. So we never touch code here.
  const supabase = await createClient();
  const { error } = await supabase.from('subjects').update({ name }).eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function archiveSubject(input: { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();
  const { count } = await supabase
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', input.id)
    .is('archived_at', null);
  if ((count ?? 0) > 0) {
    return fail(
      `${count} ${count === 1 ? 'class' : 'classes'} still reference this subject. Reassign or archive those classes first.`,
    );
  }

  const { error } = await supabase
    .from('subjects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function restoreSubject(input: { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('subjects').update({ archived_at: null }).eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

// ── Classes ─────────────────────────────────────────────────────────────────

/** Tuple-uniqueness check against (school, subject, year, group_label). */
async function classTupleTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  t: { schoolId: string; subjectId: string; year: number; groupLabel: string },
  excludeId?: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('classes')
    .select('id')
    .eq('school_id', t.schoolId)
    .eq('subject_id', t.subjectId)
    .eq('year', t.year)
    .eq('group_label', t.groupLabel);
  const rows = (data ?? []) as Array<{ id: string }>;
  return rows.some((r) => r.id !== excludeId);
}

interface ClassInput {
  schoolId: string;
  subjectId: string;
  year: number;
  groupLabel: string;
}

function validateClassInput(input: ClassInput): string | null {
  if (!input.schoolId) return 'Choose a centre.';
  if (!input.subjectId) return 'Choose a subject.';
  if (!Number.isInteger(input.year) || input.year < 0 || input.year > 6) return 'Choose a year.';
  if (!input.groupLabel.trim()) return 'Enter a group.';
  return null;
}

export async function createClass(input: ClassInput): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const groupLabel = input.groupLabel.trim();
  const validationError = validateClassInput({ ...input, groupLabel });
  if (validationError) return fail(validationError);

  const supabase = await createClient();
  const taken = await classTupleTaken(supabase, { ...input, groupLabel });
  if (taken) return fail('That centre · subject · year · group already exists.');

  const { error } = await supabase.from('classes').insert({
    school_id: input.schoolId,
    subject_id: input.subjectId,
    year: input.year,
    group_label: groupLabel,
  });
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function updateClass(input: ClassInput & { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const groupLabel = input.groupLabel.trim();
  const validationError = validateClassInput({ ...input, groupLabel });
  if (validationError) return fail(validationError);

  const supabase = await createClient();
  const taken = await classTupleTaken(supabase, { ...input, groupLabel }, input.id);
  if (taken) return fail('That centre · subject · year · group already exists.');

  const { error } = await supabase
    .from('classes')
    .update({
      school_id: input.schoolId,
      subject_id: input.subjectId,
      year: input.year,
      group_label: groupLabel,
    })
    .eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function archiveClass(input: { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  // Soft archive — plans are intentionally left untouched.
  const supabase = await createClient();
  const { error } = await supabase
    .from('classes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function restoreClass(input: { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('classes').update({ archived_at: null }).eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

// ── Members & roles ───────────────────────────────────────────────────────────

export interface SaveMembershipInput {
  profileId: string;
  role: MembershipRole;
  schoolIds: string[];
  subjectIds: string[];
}

/**
 * Admin: set a person's permissions to exactly the (school × subject) pairs at
 * the chosen role. Upserts the desired set (updating role on existing rows) and
 * removes any of that person's memberships not in the new set. Class/home-class
 * assignment is intentionally out of scope here (display-only, v1 defer).
 */
export async function saveMembership(input: SaveMembershipInput): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  if (!input.profileId) return fail('Pick a person.');
  if (input.schoolIds.length === 0) return fail('Choose at least one centre.');
  if (input.subjectIds.length === 0) return fail('Choose at least one subject.');

  const supabase = await createClient();

  // Desired (school, subject) pairs.
  const desired = new Set<string>();
  const rows: Array<{ profile_id: string; school_id: string; subject_id: string; role: MembershipRole }> = [];
  for (const schoolId of input.schoolIds) {
    for (const subjectId of input.subjectIds) {
      desired.add(`${schoolId}:${subjectId}`);
      rows.push({ profile_id: input.profileId, school_id: schoolId, subject_id: subjectId, role: input.role });
    }
  }

  // Existing memberships for this person.
  const { data: existing } = await supabase
    .from('subject_membership')
    .select('id, school_id, subject_id')
    .eq('profile_id', input.profileId);
  const existingRows = (existing ?? []) as Array<{ id: string; school_id: string; subject_id: string }>;

  // Remove memberships no longer wanted.
  const toRemove = existingRows
    .filter((r) => !desired.has(`${r.school_id}:${r.subject_id}`))
    .map((r) => r.id);
  if (toRemove.length > 0) {
    const { error } = await supabase.from('subject_membership').delete().in('id', toRemove);
    if (error) return fail(error.message);
  }

  // Upsert the desired set (sets/updates role on the unique key).
  const { error } = await supabase
    .from('subject_membership')
    .upsert(rows, { onConflict: 'profile_id,school_id,subject_id' });
  if (error) return fail(error.message);

  revalidateConsole();
  return ok();
}

/** Admin: remove a single membership row. */
export async function removeMembership(input: { membershipId: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('subject_membership').delete().eq('id', input.membershipId);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

/**
 * Coordinator (or admin): remove a member from a space. RLS (sm_coord_write)
 * restricts a coordinator to their own (centre, subject) — a write outside it is
 * rejected by the database, so no extra server check is needed here.
 */
export async function coordRemoveMember(input: { membershipId: string }): Promise<ConsoleResult> {
  const profile = await getCurrentProfile();
  if (!profile) return fail('You must be signed in.');

  const supabase = await createClient();
  const { error } = await supabase.from('subject_membership').delete().eq('id', input.membershipId);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

/** Coordinator (or admin): promote a teacher to coordinator of the space. */
export async function coordPromoteMember(input: { membershipId: string }): Promise<ConsoleResult> {
  const profile = await getCurrentProfile();
  if (!profile) return fail('You must be signed in.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('subject_membership')
    .update({ role: 'coordinator' })
    .eq('id', input.membershipId);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}
