'use server';

// Soft-delete ("recycle bin") server actions for lesson plans. Every write goes
// through a SECURITY DEFINER RPC (migration 0048) that carries the whole gate:
//   • trash   — teacher may trash their OWN `in_progress` plan; a coordinator/admin
//               of the plan's space may trash any status.
//   • restore — clears the trash flag; fails with 23505 if the freed slot was
//               re-planned (surfaced here as a friendly "already re-planned" note).
//   • purge   — permanent hard delete from the bin.
// The auth'd client invokes the RPC; the DB function re-checks identity/role, so
// there is no service-role key and no app-side authority beyond calling the gate.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getPlanCurriculumLabels, planCurriculumLabelKey } from '@/lib/curriculumUtils';
import type { PlanScope, PlanStatus } from '@/types/lesson';

export interface TrashActionResult {
  ok: boolean;
  error?: string;
}

/** Move a lesson plan to the recycle bin. */
export async function trashLessonPlan(planId: string): Promise<TrashActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('trash_lesson_plan', { p_id: planId });
  if (error) return { ok: false, error: error.message };

  // The board reads plans server-side; drop the trashed card on return.
  revalidatePath('/');
  revalidatePath('/trash');
  return { ok: true };
}

/** Restore a lesson plan from the recycle bin back onto the board. */
export async function restoreLessonPlan(planId: string): Promise<TrashActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_lesson_plan', { p_id: planId });
  if (error) {
    // The trash-aware unique index fires when the slot was re-planned while trashed.
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'This slot has already been re-planned, so the lesson can’t be restored.',
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/');
  revalidatePath('/trash');
  return { ok: true };
}

/** Permanently delete a trashed lesson plan (hard delete). */
export async function purgeLessonPlan(planId: string): Promise<TrashActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('purge_lesson_plan', { p_id: planId });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/trash');
  return { ok: true };
}

/** One trashed lesson, shaped for the recycle-bin list. */
export interface TrashedLesson {
  id: string;
  /** Display title, e.g. "Year 5" (the band label). */
  title: string;
  /** Subject · topic subtitle (topic = curriculum daily outcome / focus area). */
  subtitle: string;
  scope: PlanScope;
  status: PlanStatus;
  /** When it was trashed (ISO) — for the "deleted N ago" line and sort. */
  deletedAt: string | null;
}

interface TrashRow {
  id: string;
  year: number | null;
  scope: PlanScope;
  status: PlanStatus;
  subject_id: string | null;
  curriculum_lesson_id: string;
  curriculum_version_id: string | null;
  deleted_at: string | null;
}

/**
 * The signed-in teacher's OWN trashed lessons, most-recently-deleted first. The bin
 * is per-teacher: it lists only the caller's rows (RLS still permits reading them —
 * `lp_member_all` covers created_by = me — and the query pins `created_by`).
 */
export async function listTrashedLessons(): Promise<TrashedLesson[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('lesson_plans')
    .select('id, year, scope, status, subject_id, curriculum_lesson_id, curriculum_version_id, deleted_at')
    .eq('created_by', user.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error || !data) return [];
  const rows = data as TrashRow[];
  if (rows.length === 0) return [];

  // Resolve subject names in one round-trip.
  const subjectIds = [...new Set(rows.map((r) => r.subject_id).filter((id): id is string => !!id))];
  const subjectNames = new Map<string, string>();
  if (subjectIds.length > 0) {
    const { data: subjects } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
    for (const s of (subjects ?? []) as Array<{ id: string; name: string }>) {
      subjectNames.set(s.id, s.name);
    }
  }

  // Resolve a topic per plan, PINNED to the plan's stamped curriculum version so a
  // trashed historical plan reads the same curriculum it renders when restored/opened
  // (a re-authored subject must not relabel it). Falls back to the active version for
  // legacy/unstamped plans; keyed by (lesson_key, version).
  const labels = await getPlanCurriculumLabels(
    rows
      .filter((r) => r.curriculum_lesson_id)
      .map((r) => ({ lessonKey: r.curriculum_lesson_id, versionId: r.curriculum_version_id })),
  );

  return rows.map((r) => {
    const subject = r.subject_id ? subjectNames.get(r.subject_id) ?? null : null;
    const label = labels.get(planCurriculumLabelKey(r.curriculum_lesson_id, r.curriculum_version_id));
    const topic = (label ? label.dailyOutcome || label.focusArea : '') || r.curriculum_lesson_id;
    const subtitle = [subject, topic].filter(Boolean).join(' · ') || 'Untitled lesson';
    return {
      id: r.id,
      title: r.year != null ? `Year ${r.year}` : 'Lesson',
      subtitle,
      scope: r.scope,
      status: r.status,
      deletedAt: r.deleted_at,
    };
  });
}
