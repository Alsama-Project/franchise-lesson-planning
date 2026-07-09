'use server';

// Server action behind the board's scope chooser: create a lesson plan at a
// chosen scope (class / centre / org) for a curriculum slot, then route into the
// 5-step wizard. Replaces the old "+ Lesson" picker + its (class, date) creation.
//
// All writes go through the auth'd, RLS-scoped client. The plan's subject/year are
// derived server-side from the slot's `lesson_key` (the locked curriculum key), so
// client input can't widen what gets written; membership is verified as defence in
// depth on top of RLS.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isMemberOf, getMyMemberships, getMyCoordinatedSubjectIds } from '@/lib/auth';
import { getCurriculumKeyCoords, getActiveCurriculumVersionId } from '@/lib/curriculumUtils';
import { DEFAULT_BLOCKS } from '@/lib/blocks';
import type { PlanScope } from '@/types/lesson';

export interface CreateScopedPlanInput {
  /** The curriculum slot's `lesson_key` (written into `curriculum_lesson_id`). */
  lessonKey: string;
  /** Which scope to create the plan at. */
  scope: PlanScope;
  /** Required for `class` scope — the class group the plan is for. */
  classId?: string;
  /**
   * For `centre` scope — the centre (school) to create the plan against. The board
   * is user-wide and can span centres, so the slot names its own centre; without it
   * the action would fall back to the caller's first membership for the subject and
   * silently mis-attribute the plan when the user teaches the subject at >1 centre.
   * Verified against the caller's membership as defence in depth on top of RLS.
   */
  schoolId?: string;
  /**
   * The Mon–Fri column (1..5) to place the plan on. Defaults to the lesson's
   * curriculum period (clamped) for callers that don't choose a day.
   */
  weekday?: number;
  /**
   * The day-ordinal position to write (next in the chosen day's stack). The board
   * re-derives the displayed "Period N" from the sorted stack, so this is a sort
   * hint; defaults to the curriculum period.
   */
  period?: number;
}

export type CreateScopedPlanResult =
  | { ok: true; planId: string }
  | { ok: false; error: string };

/** Resolve the subject's uuid from its code (subjects are read-only reference data). */
async function resolveSubjectId(subjectCode: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('id')
    .eq('code', subjectCode)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Create a plan for a curriculum slot at the chosen scope. Enforces "open, don't
 * duplicate": if a plan already exists at the same scope for this slot, its id is
 * returned (the caller routes to it) rather than inserting a second one. A racing
 * unique violation is caught as a backstop and resolved to the existing row.
 */
export async function createScopedPlan(
  input: CreateScopedPlanInput,
): Promise<CreateScopedPlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const coords = await getCurriculumKeyCoords(input.lessonKey);
  if (!coords) return { ok: false, error: 'That curriculum lesson no longer exists.' };

  // Scope columns resolved per scope. subject_id/year come from the curriculum key
  // (the locked source of truth); school_id/class_id depend on the scope.
  let classId: string | null = null;
  let schoolId: string | null = null;
  let subjectId: string | null = null;
  const year = coords.year;
  // Day placement: the chosen Mon–Fri column and day-ordinal, defaulting to the
  // lesson's curriculum period (clamped to 1..5) when the caller doesn't choose.
  const weekday = Math.min(5, Math.max(1, Math.trunc(input.weekday ?? coords.period)));
  const period = input.period ?? coords.period;

  if (input.scope === 'class') {
    if (!input.classId) return { ok: false, error: 'Pick a class to plan for.' };
    const { data: cls } = await supabase
      .from('classes')
      .select('id, school_id, subject_id')
      .eq('id', input.classId)
      .maybeSingle();
    const row = cls as { id: string; school_id: string; subject_id: string } | null;
    if (!row) return { ok: false, error: 'Class not found.' };

    const allowed = (await isMemberOf(row.school_id, row.subject_id)) || (await isAdmin());
    if (!allowed) return { ok: false, error: 'You are not a member of this class.' };

    classId = row.id;
    schoolId = row.school_id;
    subjectId = row.subject_id;
  } else {
    // centre / org both need the subject; centre additionally pins a school.
    subjectId = await resolveSubjectId(coords.subjectCode);
    if (!subjectId) return { ok: false, error: 'Subject not found for this lesson.' };

    if (input.scope === 'centre') {
      // Prefer the centre the slot named (the user-wide board spans centres); fall
      // back to the caller's membership for this subject only when none was passed.
      const memberships = await getMyMemberships();
      const space = input.schoolId
        ? memberships.find((m) => m.subjectId === subjectId && m.schoolId === input.schoolId)
        : memberships.find((m) => m.subjectId === subjectId);
      if (!space) {
        return { ok: false, error: 'You are not a member of a centre for this subject.' };
      }
      schoolId = space.schoolId;
      const allowed = (await isMemberOf(schoolId, subjectId)) || (await isAdmin());
      if (!allowed) return { ok: false, error: 'You are not a member of this centre.' };
    } else {
      // org: spans every centre — any member of the subject (or an admin) may create.
      const memberships = await getMyMemberships();
      const isMember = memberships.some((m) => m.subjectId === subjectId);
      if (!isMember && !(await isAdmin())) {
        return { ok: false, error: 'You are not a member of this subject.' };
      }
    }
  }

  // Open, don't duplicate — but only the caller's OWN plan. A lesson plan is a
  // per-teacher artefact: the lookup MUST be scoped to `created_by = me`, else the
  // first teacher to open a slot owns the only row and every other teacher at the
  // same scope is routed into it (content bleed) and later locked out of it (the
  // edit gate keys on `created_by == auth.uid()`). Matches the per-teacher unique
  // indexes in migration 0028.
  const dupQuery = supabase
    .from('lesson_plans')
    .select('id')
    .eq('created_by', user.id)
    .eq('curriculum_lesson_id', input.lessonKey)
    .eq('scope', input.scope)
    // A trashed plan for this slot must NOT be reopened — re-planning a trashed
    // lesson creates a fresh row (the trash-aware unique index frees the slot, 0048).
    .is('deleted_at', null);
  if (input.scope === 'class' && classId) dupQuery.eq('class_id', classId);
  if (input.scope === 'centre' && schoolId) dupQuery.eq('school_id', schoolId);
  // limit(1), not maybeSingle(): the class-scope unique index is deferred, so a
  // (rare) pre-existing duplicate must open the first match, not throw.
  const { data: existing } = await dupQuery.limit(1);
  const existingId = (existing as { id: string }[] | null)?.[0]?.id;
  if (existingId) return { ok: true, planId: existingId };

  // Stamp the plan with the subject's ACTIVE curriculum version so it stays pinned to
  // the curriculum it was authored under, even after a later re-author publishes a new
  // version. Null when the subject has no curriculum version yet (resolution then falls
  // back to the active version at read time).
  const curriculumVersionId = await getActiveCurriculumVersionId(coords.subjectCode);

  const { data: inserted, error } = await supabase
    .from('lesson_plans')
    .insert({
      curriculum_lesson_id: input.lessonKey,
      curriculum_version_id: curriculumVersionId,
      scope: input.scope,
      class_id: classId,
      school_id: schoolId,
      subject_id: subjectId,
      year,
      weekday,
      period,
      lesson_date: null,
      status: 'in_progress',
      blocks: DEFAULT_BLOCKS,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Lost a race on a unique constraint — resolve the now-existing row and open it.
    // Same owner scoping as the dedup lookup: the per-teacher unique indexes (0028)
    // fire only on the caller's own duplicate, so we resolve back to THAT row, never
    // a colleague's.
    if (error.code === '23505') {
      const raceQuery = supabase
        .from('lesson_plans')
        .select('id')
        .eq('created_by', user.id)
        .eq('curriculum_lesson_id', input.lessonKey)
        .eq('scope', input.scope)
        // Same as the dedup lookup: never resolve a race back into a trashed row.
        .is('deleted_at', null);
      if (input.scope === 'class' && classId) raceQuery.eq('class_id', classId);
      if (input.scope === 'centre' && schoolId) raceQuery.eq('school_id', schoolId);
      const { data: raced } = await raceQuery.limit(1);
      const racedId = (raced as { id: string }[] | null)?.[0]?.id;
      if (racedId) return { ok: true, planId: racedId };
    }
    return { ok: false, error: error.message };
  }

  if (!inserted) return { ok: false, error: 'Could not create the plan.' };

  // The board reads plans server-side; revalidate so the new card appears (and
  // leaves "Not started") on return without a manual refresh.
  revalidatePath('/');
  return { ok: true, planId: (inserted as { id: string }).id };
}

// ── Teacher creation: always bind to the teacher's own class ──────────────────
// A teacher must NEVER create a `class_id=null` / `scope='centre'` plan: a centre
// plan is read-only to a teacher (only coordinators/admins own centre-wide plans),
// so a teacher who lands on one can't edit or resubmit it. Every plan a teacher
// creates binds to one of THEIR classes for the slot's (subject, year, centre):
//   • exactly one eligible class → auto-bind (scope='class');
//   • several                    → the teacher picks one before the plan exists;
//   • none                       → creation is blocked with a clear message.
// The class is resolved BEFORE insert, so no orphan centre plan is ever produced.

/** One of the teacher's classes eligible to plan a given slot. */
export interface EligibleClass {
  id: string;
  year: number;
  literacy: 'literate' | 'illiterate' | 'mixed';
}

export interface CreateTeacherPlanInput {
  /** The curriculum slot's `lesson_key`. */
  lessonKey: string;
  /** The Mon–Fri column (1..5) to place the plan on. */
  weekday?: number;
  /** The day-ordinal sort hint to write. */
  period?: number;
  /** Set once the teacher has picked a class from the multi-class picker. */
  classId?: string;
}

export type CreateTeacherPlanResult =
  | { ok: true; planId: string }
  /** The teacher teaches several classes for this slot — pick one, then re-call. */
  | { ok: false; reason: 'pick'; classes: EligibleClass[] }
  /** The teacher teaches no class for this slot — creation is blocked. */
  | { ok: false; reason: 'none'; subjectName: string; year: number }
  | { ok: false; reason: 'error'; error: string };

/** Raw `classes` join shape (untyped client — narrowed by hand). */
interface RawEligibleClass {
  id: string;
  year: number;
  literacy: EligibleClass['literacy'];
  school_id: string;
  subject_id: string;
  archived_at: string | null;
}

/**
 * Create a lesson plan for a curriculum slot, bound to the teacher's own class.
 * Resolves the caller's eligible classes for the slot's (centre, subject, year)
 * and either auto-binds (one), asks the caller to pick (several), or blocks (none).
 * Never produces a `class_id=null` / `scope='centre'` plan.
 */
export async function createTeacherPlan(
  input: CreateTeacherPlanInput,
): Promise<CreateTeacherPlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'error', error: 'Not signed in.' };

  const coords = await getCurriculumKeyCoords(input.lessonKey);
  if (!coords) {
    return { ok: false, reason: 'error', error: 'That curriculum lesson no longer exists.' };
  }

  // Subject id + display name from the slot's locked subject code.
  const { data: subj } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('code', coords.subjectCode)
    .maybeSingle();
  const subject = subj as { id: string; name: string } | null;
  if (!subject) return { ok: false, reason: 'error', error: 'Subject not found for this lesson.' };

  // The caller's own active classes for this slot's (subject, year), across ANY
  // centre — centre is provenance now, not a scope, so a teacher's class at any of
  // their centres is eligible. RLS (`class_teachers_select_own`) scopes the read to
  // the caller's assignments. The chosen class's own school_id becomes the plan's
  // provenance centre (via createScopedPlan's class branch).
  const { data: ctRows } = await supabase
    .from('class_teachers')
    .select('classes ( id, year, literacy, school_id, subject_id, archived_at )')
    .eq('teacher_id', user.id);

  const eligible: EligibleClass[] = ((ctRows ?? []) as unknown as Array<{
    classes: RawEligibleClass | null;
  }>)
    .map((r) => r.classes)
    .filter(
      (c): c is RawEligibleClass =>
        !!c &&
        !c.archived_at &&
        c.subject_id === subject.id &&
        c.year === coords.year,
    )
    .map((c) => ({ id: c.id, year: c.year, literacy: c.literacy }));

  // The teacher has already picked from the multi-class picker — honour it, but
  // only if it is genuinely one of their eligible classes for this slot.
  if (input.classId) {
    if (!eligible.some((c) => c.id === input.classId)) {
      return { ok: false, reason: 'error', error: 'That class is no longer available.' };
    }
    return finishAsClassPlan(input, input.classId);
  }

  if (eligible.length === 0) {
    return { ok: false, reason: 'none', subjectName: subject.name, year: coords.year };
  }
  if (eligible.length === 1) {
    return finishAsClassPlan(input, eligible[0].id);
  }
  return { ok: false, reason: 'pick', classes: eligible };
}

// ── Coordinator creation: born approved, subject-wide, no class binding ───────
// A coordinator authoring in a subject they coordinate IS the approval authority,
// so there is no review to do: the plan is created directly as `approved` (Save,
// not Submit) and never passes through `submitted`, so it fires no review
// notification and never enters anyone's review queue. Centre and class are
// provenance only under the subject-based model, and a coordinator is
// school-agnostic, so the plan is created class-less / centre-less (scope 'org',
// class_id = null, school_id = null) — fully visible + editable under `lp_select`.
// The born-approved status is permitted at INSERT by the guard trigger (0058) only
// because the author coordinates the plan's subject.

export interface CreateCoordinatorPlanInput {
  /** The curriculum slot's `lesson_key`. */
  lessonKey: string;
  /** The Mon–Fri column (1..5) to place the plan on. */
  weekday?: number;
  /** The day-ordinal sort hint to write. */
  period?: number;
}

export type CreateCoordinatorPlanResult =
  | { ok: true; planId: string }
  | { ok: false; error: string };

/**
 * Create a coordinator-authored plan for a curriculum slot, born `approved`. Guards
 * that the caller actually coordinates the slot's subject (or is admin) — the same
 * source of truth (`coordinator_subject`) the RLS policies read. Enforces
 * "open, don't duplicate" against the caller's OWN org-scoped plan for the slot.
 */
export async function createCoordinatorPlan(
  input: CreateCoordinatorPlanInput,
): Promise<CreateCoordinatorPlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const coords = await getCurriculumKeyCoords(input.lessonKey);
  if (!coords) return { ok: false, error: 'That curriculum lesson no longer exists.' };

  const subjectId = await resolveSubjectId(coords.subjectCode);
  if (!subjectId) return { ok: false, error: 'Subject not found for this lesson.' };

  // Only a coordinator of the subject (or an admin) may author a born-approved plan.
  // This mirrors the DB guard trigger (0058); the pre-check gives a friendly error.
  const coordinated = await getMyCoordinatedSubjectIds();
  if (!coordinated.has(subjectId) && !(await isAdmin())) {
    return { ok: false, error: 'You do not coordinate this subject.' };
  }

  const year = coords.year;
  const weekday = Math.min(5, Math.max(1, Math.trunc(input.weekday ?? coords.period)));
  const period = input.period ?? coords.period;

  // Open, don't duplicate — the caller's OWN org-scoped plan for this slot (matches
  // the per-teacher org unique index in 0028/0048).
  const { data: existing } = await supabase
    .from('lesson_plans')
    .select('id')
    .eq('created_by', user.id)
    .eq('curriculum_lesson_id', input.lessonKey)
    .eq('scope', 'org')
    .is('deleted_at', null)
    .limit(1);
  const existingId = (existing as { id: string }[] | null)?.[0]?.id;
  if (existingId) return { ok: true, planId: existingId };

  const curriculumVersionId = await getActiveCurriculumVersionId(coords.subjectCode);

  const { data: inserted, error } = await supabase
    .from('lesson_plans')
    .insert({
      curriculum_lesson_id: input.lessonKey,
      curriculum_version_id: curriculumVersionId,
      scope: 'org',
      class_id: null,
      school_id: null,
      subject_id: subjectId,
      year,
      weekday,
      period,
      lesson_date: null,
      // Born approved — never `submitted`, so no review notification and no queue
      // entry. The INSERT guard (0058) permits this only for a coordinator/admin.
      status: 'approved',
      blocks: DEFAULT_BLOCKS,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Lost a race on the org unique index — resolve the now-existing row and open it.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('lesson_plans')
        .select('id')
        .eq('created_by', user.id)
        .eq('curriculum_lesson_id', input.lessonKey)
        .eq('scope', 'org')
        .is('deleted_at', null)
        .limit(1);
      const racedId = (raced as { id: string }[] | null)?.[0]?.id;
      if (racedId) return { ok: true, planId: racedId };
    }
    return { ok: false, error: error.message };
  }

  if (!inserted) return { ok: false, error: 'Could not create the plan.' };

  revalidatePath('/');
  return { ok: true, planId: (inserted as { id: string }).id };
}

/** Delegate to the shared class-scope creation (dedup + insert + revalidate). */
async function finishAsClassPlan(
  input: CreateTeacherPlanInput,
  classId: string,
): Promise<CreateTeacherPlanResult> {
  const res = await createScopedPlan({
    lessonKey: input.lessonKey,
    scope: 'class',
    classId,
    weekday: input.weekday,
    period: input.period,
  });
  return res.ok
    ? { ok: true, planId: res.planId }
    : { ok: false, reason: 'error', error: res.error };
}
