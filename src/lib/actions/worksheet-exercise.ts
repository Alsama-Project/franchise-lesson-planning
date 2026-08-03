'use server';

// WS2-owned persistence for the worksheet-exercise pane.
//
// The three generation endpoints (WS1: /plan, /exercise; WS3: /image) and the
// compile action are NOT edited here — this module only READS the rows those
// endpoints write, and writes back the two things the pane owns and no endpoint
// does:
//   • the per-slot image state (`storage_path` / `status`) after /api/worksheet/image
//     returns — the route deliberately never writes it back (WS3 contract rule 1);
//   • a card's teacher edit (`body_doc` + `status:'edited'`).
//
// Everything runs through the auth'd, RLS-scoped server client — never the
// service-role key. `worksheet_exercise`'s RLS (migration 0067) permits SELECT /
// UPDATE for any authenticated user who can see the parent plan, so authorisation
// rides on RLS, not on a status guard here.
//
// NEVER call revalidatePath from this module: the pane autosaves the compiled v3
// jsonb through the editor's ungated debounce, and a revalidate would re-render the
// force-dynamic editor route and clobber the live buffer (the same caret-reset
// hazard documented on saveWorksheet).

import { createClient } from '@/lib/supabase/server';
import type { ImageSlot, WorksheetExercise } from '@/types/worksheet-exercise';
import type { WorksheetDoc } from '@/types/lesson';

export interface WorksheetExerciseResult {
  ok: boolean;
  error?: string;
}

/**
 * Load a plan's worksheet exercise rows in `position` order — the source of
 * truth the card surface renders. `/api/worksheet/plan` returns specs WITHOUT
 * row ids, so the pane calls this immediately after a replan to recover the
 * persisted rows (and their `id`s) to drive `/exercise`; it is also the
 * mount-time read that decides the `rows.length === 0` branch.
 */
export async function loadWorksheetExercises(
  lessonPlanId: string,
): Promise<WorksheetExercise[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('worksheet_exercise')
    .select('*')
    .eq('lesson_plan_id', lessonPlanId)
    .order('position', { ascending: true });
  if (error || !data) return [];
  return data as WorksheetExercise[];
}

/**
 * Persist a row's `image_slots` after an image request settles. The pane owns the
 * slot state machine (WS3 contract rule 1): it writes `storage_path` + `status`
 * onto the matching slot and passes the WHOLE array back in its existing order —
 * slot order is load-bearing for the per-slot cap (rule 2), so it is never
 * reordered here. The route already validated the slots against the persisted
 * row, so this is a straight column patch.
 */
export async function saveExerciseImageSlots(
  exerciseId: string,
  imageSlots: ImageSlot[],
): Promise<WorksheetExerciseResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('worksheet_exercise')
    .update({ image_slots: imageSlots })
    .eq('id', exerciseId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Exercise not found or not permitted.' };
  return { ok: true };
}

/**
 * Persist a teacher's inline edit of one card: the new `body_doc` (the tiptap
 * fragment the card renders and that `compileWorksheet` reads) and `status:'edited'`.
 * `body_md` is deliberately left untouched — it is the generator's markdown source
 * and image-slot origin; the bank write-back that consumes it (0070/0071) is not on
 * this branch, and `compileWorksheet` reads `body_doc`, so the edited content is the
 * one that renders and exports. Origin and edit are separate facts, so `origin` is
 * never changed here.
 */
export async function saveExerciseEdit(
  exerciseId: string,
  bodyDoc: WorksheetDoc,
): Promise<WorksheetExerciseResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('worksheet_exercise')
    .update({ body_doc: bodyDoc, status: 'edited' })
    .eq('id', exerciseId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Exercise not found or not permitted.' };
  return { ok: true };
}
