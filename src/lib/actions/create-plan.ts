'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_BLOCKS } from '@/lib/blocks';

export interface CreatePlanInput {
  classId: string;
  /** A curriculum.json key, e.g. "0.S1.K1.H3". */
  curriculumLessonId: string;
  /** The slot's date, `YYYY-MM-DD`. */
  lessonDate: string;
  /** The selected curriculum lesson's period number (1–5), or null. */
  period: number | null;
}

/** Returned only on failure; success and the duplicate case both redirect. */
export interface CreatePlanError {
  error: string;
}

/** Postgres unique-violation code, raised by the (class_id, lesson_date) constraint. */
const UNIQUE_VIOLATION = '23505';

/**
 * Create a lesson plan for a class on a date and land in its editor. Runs through
 * the auth'd client so RLS enforces that the teacher owns/ is assigned to the
 * class and that `created_by` is the session user. The new row starts
 * `in_progress` with the default block scaffold and an empty objective.
 *
 * On success (or when the row already exists for that class/date) this redirects
 * to `/plan/{id}` and never returns; it only returns a value on a real error.
 */
export async function createPlan(
  input: CreatePlanInput,
): Promise<CreatePlanError> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('lesson_plans')
    .insert({
      class_id: input.classId,
      curriculum_lesson_id: input.curriculumLessonId,
      lesson_date: input.lessonDate,
      period: input.period,
      status: 'in_progress',
      smartt_objective: '',
      blocks: DEFAULT_BLOCKS,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // A plan already exists for this (class_id, lesson_date): open it rather than
    // erroring (e.g. another tab created it, or a double-submit).
    if (error.code === UNIQUE_VIOLATION) {
      const { data: existing } = await supabase
        .from('lesson_plans')
        .select('id')
        .eq('class_id', input.classId)
        .eq('lesson_date', input.lessonDate)
        .maybeSingle();
      if (existing?.id) redirect(`/plan/${existing.id}`);
    }
    return { error: error.message };
  }

  if (!data?.id) {
    // No row and no error means RLS blocked the insert (not the teacher's class).
    return { error: 'You can only create plans for your own classes.' };
  }

  redirect(`/plan/${data.id}`);
}
