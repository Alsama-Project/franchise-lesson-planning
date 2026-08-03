// Thin client-side callers for the WS1/WS3 worksheet endpoints.
//
// These wrap `fetch` to the three routes and narrow their real response shapes
// (read from source, not a doc): the pane never talks to the routes any other
// way. No route code is imported or duplicated here — only its wire contract.
//
//   POST /api/worksheet/plan     { lesson_plan_id }            -> { specs }
//   POST /api/worksheet/exercise { exercise_id }               -> { exercise }
//   POST /api/worksheet/image    { slot_id, brief, lesson_plan_id, subject_id, regenerate? }
//                                                              -> { slot_id, storage_path }
//                                    | { slot_id, storage_path: null, refusal: 'cap_reached' }  (200)
//
// Same-origin fetch sends the auth cookie automatically, so the routes run as the
// signed-in user under RLS.

import type { ExerciseSpec, WorksheetExercise } from '@/types/worksheet-exercise';

/** A route error surfaced to the caller (HTTP !2xx, or a thrown/parse failure). */
export interface GenerateError {
  ok: false;
  /** HTTP status when the response arrived; 0 for a network/parse failure. */
  status: number;
  error: string;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Best-effort error message from a non-2xx response. */
async function errorFrom(res: Response): Promise<GenerateError> {
  let message = `Request failed (${res.status}).`;
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === 'string' && data.error.trim()) message = data.error;
  } catch {
    /* non-JSON body — keep the generic message */
  }
  return { ok: false, status: res.status, error: message };
}

export type PlanResult = { ok: true; specs: ExerciseSpec[] } | GenerateError;

/** Replan a plan's worksheet. DESTRUCTIVE server-side: replaces every existing
 *  `worksheet_exercise` row for the plan with fresh skeletons. */
export async function requestPlan(lessonPlanId: string): Promise<PlanResult> {
  try {
    const res = await postJson('/api/worksheet/plan', { lesson_plan_id: lessonPlanId });
    if (!res.ok) return errorFrom(res);
    const data = (await res.json()) as { specs?: ExerciseSpec[] };
    return { ok: true, specs: Array.isArray(data.specs) ? data.specs : [] };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Network error.' };
  }
}

export type ExerciseResult = { ok: true; exercise: WorksheetExercise } | GenerateError;

/** Generate (or regenerate) one exercise's content into its existing row. The row
 *  MUST already be persisted (a skeleton from /plan) — the route reads its spec. */
export async function requestExercise(exerciseId: string): Promise<ExerciseResult> {
  try {
    const res = await postJson('/api/worksheet/exercise', { exercise_id: exerciseId });
    if (!res.ok) return errorFrom(res);
    const data = (await res.json()) as { exercise?: WorksheetExercise };
    if (!data.exercise) return { ok: false, status: res.status, error: 'No exercise returned.' };
    return { ok: true, exercise: data.exercise };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Network error.' };
  }
}

/** A cap refusal is a NORMAL 200 outcome, not an error: the slot keeps its
 *  `[Picture: …]` token, gets no picture, and shows no "Try again". */
export type ImageResult =
  | { ok: true; slot_id: string; storage_path: string }
  | { ok: true; slot_id: string; storage_path: null; refusal: 'cap_reached' }
  | GenerateError;

export interface ImageRequest {
  slot_id: string;
  brief: string;
  lesson_plan_id: string;
  subject_id: string;
  regenerate?: boolean;
}

/** Generate (or reuse) one slot's image. Returns a `storage_path` (a path, never a
 *  signed URL — it is served through a re-signing route), a cap refusal, or an error. */
export async function requestImage(req: ImageRequest): Promise<ImageResult> {
  try {
    const res = await postJson('/api/worksheet/image', req);
    if (!res.ok) return errorFrom(res);
    const data = (await res.json()) as {
      slot_id?: string;
      storage_path?: string | null;
      refusal?: string;
    };
    const slotId = data.slot_id ?? req.slot_id;
    if (data.refusal === 'cap_reached' || data.storage_path == null) {
      return { ok: true, slot_id: slotId, storage_path: null, refusal: 'cap_reached' };
    }
    return { ok: true, slot_id: slotId, storage_path: data.storage_path };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Network error.' };
  }
}
