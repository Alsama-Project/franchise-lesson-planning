'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { hasObjectiveContent } from '@/lib/editor/objective';
import { isAdmin, isCoordinatorOf } from '@/lib/auth';
import type { Block, PlanStatus } from '@/types/lesson';

export interface SavePlanInput {
  id: string;
  /** The full objective string, stem included (use composeObjective on the client). */
  smartt_objective: string | null;
  blocks: Block[];
  /**
   * The AI objective-check result (an `ObjectiveCheckResult`). Optional: only
   * sent when the teacher has run a check. Stored verbatim in the unenforced
   * `smartt_check` JSONB column.
   */
  smartt_check?: unknown;
  /** Required-materials chips. Optional; persisted to `required_materials`. */
  required_materials?: string[];
  /**
   * The student worksheet as a tiptap JSON document. Optional: only sent once
   * the teacher has edited the worksheet. Stored verbatim in the unenforced
   * `worksheet` JSONB column.
   */
  worksheet?: unknown;
}

/** Build the column patch, including the optional JSONB columns only when sent. */
function buildPatch(input: SavePlanInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    smartt_objective: input.smartt_objective || null,
    blocks: input.blocks,
  };
  if (input.smartt_check !== undefined) patch.smartt_check = input.smartt_check;
  if (input.required_materials !== undefined) patch.required_materials = input.required_materials;
  if (input.worksheet !== undefined) patch.worksheet = input.worksheet;
  return patch;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Server timestamp of the write, for the "Saved" indicator. */
  updated_at?: string;
}

/**
 * Autosave the editable lesson-plan state (objective + blocks) via the auth'd
 * client. RLS guarantees a teacher can only write a plan they created or are
 * assigned to. The `updated_at` trigger stamps the row.
 */
export async function saveLessonPlan(input: SavePlanInput): Promise<ActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lesson_plans')
    .update(buildPatch(input))
    .eq('id', input.id)
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not permitted.' };

  return { ok: true, updated_at: data.updated_at };
}

/**
 * Set a plan's workflow status directly — the write behind the Weekly Overview's
 * Status (kanban) board, where dragging a card between columns moves the plan to
 * the target column's status. Touches only `status`; RLS scopes the write to a
 * plan the teacher created or is assigned to. Revalidates the overview so a
 * refresh reflects the persisted status (the board also moves the card
 * optimistically and reverts on `{ ok: false }`).
 */
export async function setPlanStatus(
  planId: string,
  status: PlanStatus,
): Promise<ActionResult> {
  const supabase = await createClient();

  // Approval is coordinator-only. The `approved` / `needs_review` transitions are
  // restricted to a coordinator of the plan's (centre, subject) space (or an
  // admin). This mirrors the DB trigger `enforce_approval_role` — belt-and-braces,
  // and it lets us return a friendly error instead of a raw DB exception. The
  // teacher transitions (`in_progress` / `submitted`) are unrestricted here (RLS
  // still scopes them to a plan in a space the caller belongs to).
  if (status === 'approved' || status === 'needs_review') {
    const { data: planRow } = await supabase
      .from('lesson_plans')
      .select('classes ( school_id, subject_id )')
      .eq('id', planId)
      .maybeSingle();

    const cls = (planRow as { classes: { school_id: string; subject_id: string } | null } | null)
      ?.classes;
    if (!cls) return { ok: false, error: 'Plan not found or not permitted.' };

    const allowed = (await isCoordinatorOf(cls.school_id, cls.subject_id)) || (await isAdmin());
    if (!allowed) {
      return { ok: false, error: 'Only a coordinator of this subject can change approval status.' };
    }
  }

  const { data, error } = await supabase
    .from('lesson_plans')
    .update({ status })
    .eq('id', planId)
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not permitted.' };

  revalidatePath('/');
  return { ok: true, updated_at: data.updated_at };
}

/**
 * Revert a submitted plan back to `in_progress` so the teacher can keep editing,
 * clearing `submitted_at`. Touches only the workflow columns; RLS still scopes
 * the write to a plan the teacher owns or is assigned to. (An approved plan is
 * not reverted from the editor — the control is display-only in that state.)
 */
export async function unsubmitLessonPlan(input: { id: string }): Promise<ActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lesson_plans')
    .update({ status: 'in_progress', submitted_at: null })
    .eq('id', input.id)
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not permitted.' };

  return { ok: true, updated_at: data.updated_at };
}

/**
 * Submit a plan for coordinator approval: persists the latest objective + blocks,
 * then sets status to `submitted` and stamps `submitted_at`. Guarded by a
 * non-empty objective (beyond the enforced stem).
 */
export async function submitLessonPlan(input: SavePlanInput): Promise<ActionResult> {
  if (!hasObjectiveContent(input.smartt_objective)) {
    return { ok: false, error: 'Add a SMARTT objective before submitting.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lesson_plans')
    .update({
      ...buildPatch(input),
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not permitted.' };

  return { ok: true, updated_at: data.updated_at };
}
