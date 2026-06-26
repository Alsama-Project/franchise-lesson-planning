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
   * The student worksheet body — the versioned `Worksheet` envelope (an ordered
   * exercise-block list; see @/types/lesson). Optional: only sent once the
   * teacher has touched the worksheet. Stored verbatim in the unenforced
   * `worksheet` JSONB column and normalised on read via `parseWorksheet`.
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

  // Keep the board fresh so a returning teacher sees the card in the right place
  // (a new plan is created `in_progress`, so it has already left "Not started").
  revalidatePath('/');
  return { ok: true, updated_at: data.updated_at };
}

/** One card's new placement on the day-column board. */
export interface PlanPlacement {
  id: string;
  /** Mon–Fri column (1..5). */
  weekday: number;
  /** Day-ordinal position within that column (1..N). */
  period: number;
}

/**
 * Persist the new day-column placement of dragged cards — the write behind the
 * Calendar board's drag-to-reorder. Each update sets a plan's `weekday` + `period`
 * (its 1-based position in the day's stack). RLS scopes every write to a plan the
 * caller may edit, so the client only ever sends its OWN cards (shared centre/org
 * cards are not draggable and keep their creator's placement). A rejected write
 * (RLS or otherwise) fails the whole call so the board can revert optimistically.
 */
export async function reorderPlans(updates: PlanPlacement[]): Promise<ActionResult> {
  if (updates.length === 0) return { ok: true };

  const supabase = await createClient();

  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from('lesson_plans')
        .update({ weekday: u.weekday, period: u.period })
        .eq('id', u.id)
        .select('id')
        .maybeSingle(),
    ),
  );

  for (const res of results) {
    if (res.error) return { ok: false, error: res.error.message };
    if (!res.data) return { ok: false, error: 'A card could not be moved (not permitted).' };
  }

  revalidatePath('/');
  return { ok: true };
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
    const space = await resolvePlanSpace(supabase, planId);
    if (!space) return { ok: false, error: 'Plan not found or not permitted.' };
    if (!(await mayDecide(space))) {
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
 * Resolve a plan's (centre, subject) space the class-optional way: prefer the
 * plan's own scope columns, fall back to its class join (class-scoped rows). An
 * org plan has no single centre, so `schoolId` comes back null and only an admin
 * may decide on it. Mirrors the resolution in the `enforce_approval_role` trigger.
 */
async function resolvePlanSpace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<{ schoolId: string | null; subjectId: string | null } | null> {
  const { data } = await supabase
    .from('lesson_plans')
    .select('school_id, subject_id, classes ( school_id, subject_id )')
    .eq('id', planId)
    .maybeSingle();

  const row = data as {
    school_id: string | null;
    subject_id: string | null;
    classes: { school_id: string; subject_id: string } | null;
  } | null;
  if (!row) return null;

  return {
    schoolId: row.school_id ?? row.classes?.school_id ?? null,
    subjectId: row.subject_id ?? row.classes?.subject_id ?? null,
  };
}

/** True when the caller may decide approval for a plan's space (coordinator or admin). */
async function mayDecide(space: {
  schoolId: string | null;
  subjectId: string | null;
}): Promise<boolean> {
  return (
    (!!space.schoolId && !!space.subjectId && (await isCoordinatorOf(space.schoolId, space.subjectId))) ||
    (await isAdmin())
  );
}

/**
 * Whether the signed-in user may take a coordinator decision on this plan — a
 * coordinator of the plan's (centre, subject) space, or an admin. Drives whether
 * the review view shows the decision bar. Read-only; the real authorisation
 * boundary is RLS + the `enforce_approval_role` trigger.
 */
export async function canCoordinatePlan(planId: string): Promise<boolean> {
  const supabase = await createClient();
  const space = await resolvePlanSpace(supabase, planId);
  if (!space) return false;
  return mayDecide(space);
}

/** A coordinator decision on a submitted/decided plan. */
type PlanDecision = 'approve' | 'return' | 'reopen';

/**
 * Apply a coordinator decision to a plan, stamping the workflow timestamps to
 * match the teacher-side pattern (`submitted_at` on submit; `reviewed_at` is the
 * "coordinator decided" mark read by the notifications bell):
 *
 *   • approve → `approved`,      stamps `reviewed_at`.
 *   • return  → `needs_review`,  stamps `reviewed_at`.
 *   • reopen  → `in_progress`,   clears `submitted_at` + `reviewed_at` (clean draft).
 *
 * Authorisation rides on RLS + the `enforce_approval_role` trigger; the pre-check
 * mirrors them so the UI gets a friendly error rather than a raw DB exception.
 * Kept separate from the teacher `setPlanStatus` board-drag path on purpose.
 */
export async function decidePlan(planId: string, decision: PlanDecision): Promise<ActionResult> {
  const supabase = await createClient();

  const space = await resolvePlanSpace(supabase, planId);
  if (!space) return { ok: false, error: 'Plan not found or not permitted.' };
  if (!(await mayDecide(space))) {
    return { ok: false, error: 'Only a coordinator of this subject can change approval status.' };
  }

  const now = new Date().toISOString();
  const patch =
    decision === 'approve'
      ? { status: 'approved' as const, reviewed_at: now }
      : decision === 'return'
        ? { status: 'needs_review' as const, reviewed_at: now }
        : { status: 'in_progress' as const, submitted_at: null, reviewed_at: null };

  const { data, error } = await supabase
    .from('lesson_plans')
    .update(patch)
    .eq('id', planId)
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not permitted.' };

  revalidatePath('/');
  revalidatePath(`/plan/${planId}/view`);
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
 * Submit an already-persisted plan for approval BY ID — the write behind the
 * Status board's drag-to-submit. Unlike `submitLessonPlan` (the editor path),
 * the board carries no editor edits, so there is nothing to persist via
 * `buildPatch`: we validate the plan's STORED objective and, on pass, make the
 * same status/timestamp transition (`submitted` + `submitted_at`, clearing
 * `reviewed_at` so a resubmit re-enters the queue cleanly).
 *
 * Authorisation rides entirely on RLS (`lp_member_all`): the auth'd client both
 * reads the objective and writes the transition, so a teacher can only submit a
 * plan they created. No service-role client, no status-/membership-based
 * widening.
 */
export async function submitLessonPlanById(planId: string): Promise<ActionResult> {
  const supabase = await createClient();

  // Read the stored objective through the auth'd client (RLS scopes the read).
  const { data: existing, error: loadError } = await supabase
    .from('lesson_plans')
    .select('smartt_objective')
    .eq('id', planId)
    .maybeSingle();

  if (loadError) return { ok: false, error: loadError.message };
  if (!existing) return { ok: false, error: 'Plan not found or not permitted.' };

  if (!hasObjectiveContent((existing as { smartt_objective: string | null }).smartt_objective)) {
    return { ok: false, error: 'Add a SMARTT objective before submitting.' };
  }

  const { data, error } = await supabase
    .from('lesson_plans')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
    })
    .eq('id', planId)
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not permitted.' };

  revalidatePath('/');
  return { ok: true, updated_at: data.updated_at };
}

/**
 * Submit a plan for coordinator approval: persists the latest objective + blocks,
 * then sets status to `submitted` and stamps `submitted_at`. Guarded by a
 * non-empty objective (beyond the enforced stem).
 *
 * `reviewed_at` is cleared so a RESUBMISSION (from `needs_review`) re-enters the
 * review queue cleanly without carrying a stale "coordinator decided" mark. The
 * teacher-facing notification reads `status` (only `approved`/`needs_review`
 * surface there), so clearing this column on a submit does not disturb it.
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
      reviewed_at: null,
    })
    .eq('id', input.id)
    .select('updated_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not permitted.' };

  revalidatePath('/');
  return { ok: true, updated_at: data.updated_at };
}
