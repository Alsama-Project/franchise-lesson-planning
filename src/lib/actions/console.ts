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
import { MIN_YEAR, MAX_YEAR } from '@/lib/matrix';
import { isValidISODate, mondayOf } from '@/lib/week';
import type { TermRow } from '@/lib/console';

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

/** Tuple-uniqueness check against (school, subject, year) — a class is now
 *  identified by that tuple alone (migration 0018 dropped the group). */
async function classTupleTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  t: { schoolId: string; subjectId: string; year: number },
  excludeId?: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('classes')
    .select('id')
    .eq('school_id', t.schoolId)
    .eq('subject_id', t.subjectId)
    .eq('year', t.year);
  const rows = (data ?? []) as Array<{ id: string }>;
  return rows.some((r) => r.id !== excludeId);
}

interface ClassInput {
  schoolId: string;
  subjectId: string;
  year: number;
}

function validateClassInput(input: ClassInput): string | null {
  if (!input.schoolId) return 'Choose a centre.';
  if (!input.subjectId) return 'Choose a subject.';
  if (!Number.isInteger(input.year) || input.year < MIN_YEAR || input.year > MAX_YEAR) {
    return 'Choose a year.';
  }
  return null;
}

export async function createClass(input: ClassInput): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const validationError = validateClassInput(input);
  if (validationError) return fail(validationError);

  const supabase = await createClient();
  const taken = await classTupleTaken(supabase, input);
  if (taken) return fail('That centre · subject · year already exists.');

  const { error } = await supabase.from('classes').insert({
    school_id: input.schoolId,
    subject_id: input.subjectId,
    year: input.year,
  });
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

export async function updateClass(input: ClassInput & { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const validationError = validateClassInput(input);
  if (validationError) return fail(validationError);

  const supabase = await createClient();
  const taken = await classTupleTaken(supabase, input, input.id);
  if (taken) return fail('That centre · subject · year already exists.');

  const { error } = await supabase
    .from('classes')
    .update({
      school_id: input.schoolId,
      subject_id: input.subjectId,
      year: input.year,
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

/**
 * A batched diff of class ticks from the Classes-tab matrix, applied in one pass
 * with a single revalidate — the same declarative shape as Profile's
 * `set_my_classes` (the client computes the diff; the server applies it).
 *
 * The client resolves each changed cell to exactly one of three ops:
 *   • `create`  — a ticked cell with no class → insert (school, subject, year).
 *   • `restore` — a ticked cell whose only class is ARCHIVED → un-archive it, NOT
 *                 create. The active-rows-only unique index means a create would
 *                 duplicate the tuple and orphan the archived row's plans/teachers.
 *   • `archive` — an unticked cell whose active class → soft-archive (reversible,
 *                 non-cascading; plans and assignments are left intact).
 * The three op sets touch disjoint (school, subject, year) slots, so their order
 * is immaterial to the active-tuple unique index. Every write is admin-gated here
 * and by RLS (classes_admin_insert / classes_admin_update); no service-role key.
 */
export interface ClassMatrixDiff {
  create: Array<{ schoolId: string; subjectId: string; year: number }>;
  restore: string[];
  archive: string[];
}

export async function saveClassMatrix(input: ClassMatrixDiff): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();

  // Archive first, then restore, then create — disjoint slots, so ordering is a
  // belt-and-braces against the active-tuple unique index rather than a necessity.
  if (input.archive.length > 0) {
    const { error } = await supabase
      .from('classes')
      .update({ archived_at: new Date().toISOString() })
      .in('id', input.archive);
    if (error) return fail(error.message);
  }

  if (input.restore.length > 0) {
    const { error } = await supabase
      .from('classes')
      .update({ archived_at: null })
      .in('id', input.restore);
    if (error) return fail(error.message);
  }

  for (const c of input.create) {
    const validationError = validateClassInput(c);
    if (validationError) return fail(validationError);
    const taken = await classTupleTaken(supabase, c);
    if (taken) continue; // an active class already fills this slot — nothing to do.
    const { error } = await supabase.from('classes').insert({
      school_id: c.schoolId,
      subject_id: c.subjectId,
      year: c.year,
    });
    if (error) return fail(error.message);
  }

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
 * Coordinator (or admin): remove a teacher from a coordinated subject. In the
 * school-agnostic model a coordinator owns their subject across every centre, so
 * removal deletes ALL of that teacher's `subject_membership` rows in the subject
 * (passed as `membershipIds`). RLS (`sm_coord_write`) restricts a coordinator to
 * rows within a subject they coordinate — any id outside that is rejected by the
 * database, so no extra server check is needed here.
 */
export async function coordRemoveMember(input: { membershipIds: string[] }): Promise<ConsoleResult> {
  const profile = await getCurrentProfile();
  if (!profile) return fail('You must be signed in.');
  if (input.membershipIds.length === 0) return ok();

  const supabase = await createClient();
  const { error } = await supabase
    .from('subject_membership')
    .delete()
    .in('id', input.membershipIds);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}

// Coordinator promotion is intentionally NOT a coordinator-facing action anymore:
// under the role-first model a coordinator manages their subject across ALL schools
// (`coordinator_subject`), so minting one is an org-level grant that lives only in
// the admin "Edit access" modal (setUserAccess). A coordinator can still remove a
// teacher from their space (coordRemoveMember above).

// ── Term calendar (admin) ─────────────────────────────────────────────────────
// Autosave-on-settle writes for the Option B timeline. The UI mutates optimistically
// and calls these only when an interaction settles (pointer-up after a move/resize,
// a stepper click, a debounced date change) — never on every pointermove tick. Each
// write snaps the start to a Monday and clamps weeks to 1–40 so a malformed payload
// (or one bypassing the UI) can't persist an off-grid term; the `term` CHECKs are the
// final backstop. Admin-only via `requireAdmin` + the `term_*` RLS policies.

const MIN_WEEKS = 1;
const MAX_WEEKS = 40;

function clampWeeks(n: number): number {
  if (!Number.isFinite(n)) return MIN_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.trunc(n)));
}

/** Keep only valid, de-duplicated curriculum years (0–6). */
function cleanYears(years: number[]): number[] {
  return [...new Set(years)].filter((y) => Number.isInteger(y) && y >= 0 && y <= 6).sort((a, b) => a - b);
}

/** De-duplicate the centre id set (RLS + FK reject any id the admin may not touch). */
function cleanSchoolIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
}

/**
 * Replace a term's centre scope (`term_school`) with exactly `schoolIds` —
 * delete-then-insert inside the caller's admin-gated, RLS-scoped transaction-lite
 * sequence. A cascade on term delete means deleteTerm needs no equivalent.
 */
async function writeTermSchools(
  supabase: Awaited<ReturnType<typeof createClient>>,
  termId: string,
  schoolIds: string[],
): Promise<string | null> {
  const { error: delErr } = await supabase.from('term_school').delete().eq('term_id', termId);
  if (delErr) return delErr.message;
  if (schoolIds.length === 0) return null;
  const rows = schoolIds.map((school_id) => ({ term_id: termId, school_id }));
  const { error } = await supabase.from('term_school').insert(rows);
  return error ? error.message : null;
}

/** Replace a term's year scope (`term_year`) with exactly `years`. */
async function writeTermYears(
  supabase: Awaited<ReturnType<typeof createClient>>,
  termId: string,
  years: number[],
): Promise<string | null> {
  const { error: delErr } = await supabase.from('term_year').delete().eq('term_id', termId);
  if (delErr) return delErr.message;
  if (years.length === 0) return null;
  const rows = years.map((year) => ({ term_id: termId, year }));
  const { error } = await supabase.from('term_year').insert(rows);
  return error ? error.message : null;
}

export interface TermMutationResult extends ConsoleResult {
  term?: TermRow;
}

export async function createTerm(input: {
  name: string;
  startsOn: string;
  numWeeks: number;
  /** Centre scope for the new term; defaults to empty (produces no teaching weeks). */
  schoolIds?: string[];
  /** Year scope for the new term; defaults to empty (produces no teaching weeks). */
  years?: number[];
}): Promise<TermMutationResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  if (!isValidISODate(input.startsOn)) return fail('Pick a valid start date.');
  const starts_on = mondayOf(input.startsOn);
  const name = input.name.trim() || 'New term';
  const num_weeks = clampWeeks(input.numWeeks);
  const schoolIds = cleanSchoolIds(input.schoolIds ?? []);
  const years = cleanYears(input.years ?? []);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('term')
    .insert({ name, starts_on, num_weeks })
    .select('id, name, starts_on, num_weeks')
    .single();
  if (error) return fail(error.message);

  const row = data as { id: string; name: string; starts_on: string; num_weeks: number };

  // Write the scope sets (no-op inserts when empty). A failure here leaves the term
  // with empty scope — the UI's amber "produces no teaching weeks" warning surfaces it.
  const schoolErr = await writeTermSchools(supabase, row.id, schoolIds);
  if (schoolErr) return fail(schoolErr);
  const yearErr = await writeTermYears(supabase, row.id, years);
  if (yearErr) return fail(yearErr);

  revalidateConsole();
  return {
    ok: true,
    term: {
      id: row.id,
      name: row.name,
      startsOn: row.starts_on,
      numWeeks: row.num_weeks,
      schoolIds,
      years,
    },
  };
}

export async function updateTerm(input: {
  id: string;
  name?: string;
  startsOn?: string;
  numWeeks?: number;
  /** When provided, replaces the term's centre scope exactly (delete-then-insert). */
  schoolIds?: string[];
  /** When provided, replaces the term's year scope exactly (delete-then-insert). */
  years?: number[];
}): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const patch: { name?: string; starts_on?: string; num_weeks?: number } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return fail('Enter a term name.');
    patch.name = name;
  }
  if (input.startsOn !== undefined) {
    if (!isValidISODate(input.startsOn)) return fail('Pick a valid start date.');
    patch.starts_on = mondayOf(input.startsOn);
  }
  if (input.numWeeks !== undefined) {
    patch.num_weeks = clampWeeks(input.numWeeks);
  }

  const supabase = await createClient();

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('term').update(patch).eq('id', input.id);
    if (error) return fail(error.message);
  }

  if (input.schoolIds !== undefined) {
    const schoolErr = await writeTermSchools(supabase, input.id, cleanSchoolIds(input.schoolIds));
    if (schoolErr) return fail(schoolErr);
  }
  if (input.years !== undefined) {
    const yearErr = await writeTermYears(supabase, input.id, cleanYears(input.years));
    if (yearErr) return fail(yearErr);
  }

  revalidateConsole();
  return ok();
}

export async function deleteTerm(input: { id: string }): Promise<ConsoleResult> {
  const guard = await requireAdmin();
  if (isFail(guard)) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('term').delete().eq('id', input.id);
  if (error) return fail(error.message);
  revalidateConsole();
  return ok();
}
