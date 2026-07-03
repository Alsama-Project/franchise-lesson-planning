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
import { isAdmin, isMemberOf, getMyMemberships } from '@/lib/auth';
import { getCurriculumKeyCoords } from '@/lib/curriculumUtils';
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
    .eq('scope', input.scope);
  if (input.scope === 'class' && classId) dupQuery.eq('class_id', classId);
  if (input.scope === 'centre' && schoolId) dupQuery.eq('school_id', schoolId);
  // limit(1), not maybeSingle(): the class-scope unique index is deferred, so a
  // (rare) pre-existing duplicate must open the first match, not throw.
  const { data: existing } = await dupQuery.limit(1);
  const existingId = (existing as { id: string }[] | null)?.[0]?.id;
  if (existingId) return { ok: true, planId: existingId };

  const { data: inserted, error } = await supabase
    .from('lesson_plans')
    .insert({
      curriculum_lesson_id: input.lessonKey,
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
        .eq('scope', input.scope);
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
