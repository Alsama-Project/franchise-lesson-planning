'use client';

// The worksheet-generation state machine for the card surface.
//
// Orchestration (base spec §7, GO §2 — /plan returns specs WITHOUT ids, so rows
// load in between):
//
//   Generate / Regenerate all
//     → POST /plan (DESTRUCTIVE: replaces every row with skeletons) → specs
//     → loadWorksheetExercises() to recover the persisted rows + their ids
//     → skeletons for every spec at its estimated height; the page HOLDS
//     → POST /exercise per row (rows persist their own image_slots + slot ids)
//     → POST /image per slot, flattened by position then array order
//     → buffer everything → ONE atomic reveal
//
// Nothing is revealed until everything has settled: no streaming, no per-exercise
// reveal, no revealing text before pictures land. Half-written exercises appearing
// and reflowing is the exact failure this prevents.
//
// A per-card Regenerate is scoped: only that card returns to a skeleton (at its
// current height, handled by the view); every other card stays live. It calls
// /exercise for that one row, never /plan.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExerciseSpec, ImageSlot, WorksheetExercise } from '@/types/worksheet-exercise';
import type { WorksheetV3 } from '@/types/lesson';
import {
  loadWorksheetExercises,
  saveExerciseImageSlots,
} from '@/lib/actions/worksheet-exercise';
import { compileWorksheet } from '@/lib/actions/worksheet-compile';
import { requestExercise, requestImage, requestPlan } from '@/lib/worksheet/generate-client';
import type { ExerciseRegenPayload } from '../doc/exerciseSplice';
import { IMAGE_CAP, drawableSlots, flattenSlots, type FlatSlotRef } from './slots';

// Re-exported so existing consumers keep importing these from the hook module.
export { IMAGE_CAP, drawableSlots, flattenSlots };
export type { FlatSlotRef };

/**
 * The real, currently-running stage of a full-sheet generation — what to SAY instead of
 * a timer or a spinner. Each value is set by `generateAll` at the actual transition, so
 * the copy tracks the work: `planning` while the one /plan call runs (no count — it is a
 * single opaque request); `exercises` / `images` tick a genuine `index` of `total` as
 * their sequential loops advance; `compiling` while the document is assembled. `null`
 * whenever `filling` is false. The images stage only ever appears if a picture is actually
 * drawn (its loop is what sets it), so a sheet with no images never shows it.
 */
export type FillStage =
  | { phase: 'planning' }
  | { phase: 'exercises'; index: number; total: number }
  | { phase: 'images'; index: number; total: number }
  | { phase: 'compiling' };

/** The real stage of a single-exercise regenerate (its own shorter copy set). `exercise`
 *  while its body is re-written; `image` only if it actually has a picture to redraw. */
export type RegenPhase = 'exercise' | 'image';

export interface GenerationState {
  /** The live rows the surface renders. */
  exercises: WorksheetExercise[];
  /** Full-sheet generation in flight → render every planned position as a skeleton. */
  filling: boolean;
  /** The real stage of the in-flight full generation (drives the header copy). Null when
   *  not filling. */
  stage: FillStage | null;
  /** Skeleton heights while `filling` (from the plan's specs). Null when idle. */
  fillSpecs: ExerciseSpec[] | null;
  /** Ids of cards mid per-card regeneration (skeleton at current height; others live). */
  regenerating: Set<string>;
  /** A top-level failure of the plan step (the whole sheet, not one card). */
  error: string | null;
  /** True once an image request came back 503 — generation is disabled this session. */
  imagesDisabled: boolean;
}

export interface GenerationApi extends GenerationState {
  /** Generate (no rows) or Regenerate all (rows exist). Both call /plan and, on
   *  completion, rebuild the WHOLE document into the live editor via `onCompiled`. */
  generateAll: () => Promise<void>;
  /**
   * Regenerate ONE exercise via /exercise (+ its images). Never /plan, never
   * destructive, and NEVER a full rebuild: it returns the exercise's fresh body for
   * the caller to splice into the live document in place. An optional `instruction`
   * steers the regeneration against the current body (the adjust pattern); omitted
   * regenerates plainly. Returns null only if the exercise vanished from state
   * mid-flight; a generation failure returns a payload with `failed: true` (a visible,
   * retryable placeholder is spliced).
   *
   * `onStage` is called at each real transition (`exercise` → `image`) so the caller can
   * show the regenerate's own short copy set; `image` fires ONLY when the exercise has a
   * picture that will actually be drawn.
   */
  regenerateExercise: (
    exerciseId: string,
    instruction?: string,
    onStage?: (phase: RegenPhase) => void,
  ) => Promise<ExerciseRegenPayload | null>;
}

/** Condense a route error into a short, safe slot `error`: single line, length-capped,
 *  with anything key-shaped redacted. Never store a full stack trace or a credential —
 *  the route's message is a one-line reason (e.g. an OpenAI 400), but redact defensively. */
function slotErrorText(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  const redacted = oneLine.replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, '[redacted]');
  return redacted.length > 300 ? `${redacted.slice(0, 299)}…` : redacted;
}

/** Overwrite one slot on a row (by slot_id), preserving array order (cap-critical). */
function patchSlot(row: WorksheetExercise, slotId: string, patch: Partial<ImageSlot>): WorksheetExercise {
  const slots = (Array.isArray(row.image_slots) ? row.image_slots : []).map((s) =>
    s.slot_id === slotId ? { ...s, ...patch } : s,
  );
  return { ...row, image_slots: slots };
}

export function useWorksheetGeneration({
  lessonPlanId,
  subjectId,
  initialExercises,
  onCompiled,
}: {
  lessonPlanId: string;
  subjectId: string | null;
  initialExercises: WorksheetExercise[];
  /** Called with the compiled v3 doc after any change, so the parent can setWorksheet
   *  and let the existing debounce autosave the jsonb (keeps print/PDF/coordinator
   *  view working off the column). */
  onCompiled: (doc: WorksheetV3) => void;
}): GenerationApi {
  const [exercises, setExercises] = useState<WorksheetExercise[]>(initialExercises);
  const [filling, setFilling] = useState(false);
  const [stage, setStage] = useState<FillStage | null>(null);
  const [fillSpecs, setFillSpecs] = useState<ExerciseSpec[] | null>(null);
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [imagesDisabled, setImagesDisabled] = useState(false);

  // Keep the compile callback current without re-binding the generation callbacks.
  const onCompiledRef = useRef(onCompiled);
  useEffect(() => {
    onCompiledRef.current = onCompiled;
  }, [onCompiled]);

  const compileAndPersist = useCallback(async () => {
    try {
      const doc = await compileWorksheet(lessonPlanId);
      onCompiledRef.current(doc);
    } catch {
      /* compile is best-effort export sync; a failure never blocks the pane */
    }
  }, [lessonPlanId]);

  /**
   * Generate images for a set of rows, in whole-worksheet flattened order, updating
   * each slot and persisting the row's `image_slots`. Positional cap: a slot at
   * flattened index ≥ IMAGE_CAP is left untouched (the route would refuse it — its
   * refused render is derived positionally, not persisted). Returns the updated rows.
   */
  const fillImagesFor = useCallback(
    async (
      rows: WorksheetExercise[],
      allRowsInOrder: WorksheetExercise[],
      onProgress?: (index: number, total: number) => void,
    ): Promise<WorksheetExercise[]> => {
      if (!subjectId) return rows; // no subject → cannot steer the illustrator; keep tokens
      const byId = new Map(rows.map((r) => [r.id, r]));
      // The pictures that WILL be drawn (present, under the positional cap) — `total` is the
      // denominator the "picture n of total" copy ticks against, stable while `index` advances.
      const drawable = drawableSlots(rows, allRowsInOrder);
      const total = drawable.length;
      let drawn = 0;
      let disabled = false;
      for (const ref of drawable) {
        if (disabled) break;
        const row = byId.get(ref.exerciseId);
        const slot = row?.image_slots.find((s) => s.slot_id === ref.slotId);
        if (!row || !slot) continue; // defensive — drawableSlots already required both
        drawn += 1;
        onProgress?.(drawn, total); // announce "drawing picture n of total" before the call
        const res = await requestImage({
          slot_id: ref.slotId,
          brief: slot.brief,
          lesson_plan_id: lessonPlanId,
          subject_id: subjectId,
          regenerate: false,
        });
        if (res.ok && res.storage_path) {
          byId.set(row.id, patchSlot(byId.get(row.id)!, ref.slotId, { status: 'ready', storage_path: res.storage_path, error: undefined }));
        } else if (res.ok) {
          // cap_reached refusal — leave the slot as-is (pending token, no controls).
          continue;
        } else if (res.status === 503) {
          disabled = true; // images disabled this session — stop; remaining stay pending
        } else {
          byId.set(row.id, patchSlot(byId.get(row.id)!, ref.slotId, { status: 'failed', error: slotErrorText(res.error) }));
        }
      }
      if (disabled) setImagesDisabled(true);
      const updated = rows.map((r) => byId.get(r.id) ?? r);
      // Persist each touched row's slots (order preserved).
      await Promise.all(updated.map((r) => saveExerciseImageSlots(r.id, r.image_slots)));
      return updated;
    },
    [lessonPlanId, subjectId],
  );

  const generateAll = useCallback(async () => {
    setError(null);
    setFilling(true);
    setImagesDisabled(false);
    // The one /plan call is opaque from here (reads the curriculum, the teacher's intent
    // and works out placement server-side in a single request), so planning has no count.
    setStage({ phase: 'planning' });
    const plan = await requestPlan(lessonPlanId);
    if (!plan.ok) {
      setError(plan.error);
      setFilling(false);
      setFillSpecs(null);
      setStage(null);
      return;
    }
    setFillSpecs(plan.specs);
    // Recover the persisted skeleton rows (with ids) — /plan returns specs only.
    const skeletons = await loadWorksheetExercises(lessonPlanId);
    // Generate every exercise, buffered — nothing is shown until all settle. The count
    // ticks as this sequential loop advances (real progress, never a timer).
    const total = skeletons.length;
    const generated: WorksheetExercise[] = [];
    for (let i = 0; i < skeletons.length; i++) {
      setStage({ phase: 'exercises', index: i + 1, total });
      const res = await requestExercise(skeletons[i].id);
      generated.push(res.ok ? res.exercise : { ...skeletons[i], status: 'failed' });
    }
    // Then all images, in flattened order, still buffered. `fillImagesFor` sets the images
    // stage per picture — so it appears ONLY if a picture is actually drawn.
    const withImages = await fillImagesFor(generated, generated, (index, imageTotal) =>
      setStage({ phase: 'images', index, total: imageTotal }),
    );
    // ONE atomic reveal. Write the real document into the editor while the skeleton
    // overlay is STILL up (filling stays true), then drop the overlay — so the page
    // goes skeleton → finished content in one pass, never flashing empty in between.
    setStage({ phase: 'compiling' });
    setExercises(withImages);
    await compileAndPersist();
    setFilling(false);
    setFillSpecs(null);
    setStage(null);
  }, [lessonPlanId, fillImagesFor, compileAndPersist]);

  // Latest rows for reading a spec anchor without re-binding the callback each edit.
  const exercisesRef = useRef(exercises);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  const regenerateExercise = useCallback(
    async (
      exerciseId: string,
      instruction?: string,
      onStage?: (phase: RegenPhase) => void,
    ): Promise<ExerciseRegenPayload | null> => {
      setRegenerating((prev) => new Set(prev).add(exerciseId));
      onStage?.('exercise'); // "having another go" while the body is re-written
      const res = await requestExercise(exerciseId, instruction);
      setExercises((cur) => {
        const idx = cur.findIndex((e) => e.id === exerciseId);
        if (idx === -1) return cur;
        const updated = res.ok ? res.exercise : { ...cur[idx], status: 'failed' as const };
        const next = [...cur];
        next[idx] = updated;
        return next;
      });

      // The exercise's scaffold anchor — used only if the teacher had deleted its
      // nodes, so the splice knows where to place the fresh content.
      const specAnchor =
        exercisesRef.current.find((e) => e.id === exerciseId)?.generation?.spec?.template_anchor?.trim() || null;

      const clearBusy = () =>
        setRegenerating((prev) => {
          const next = new Set(prev);
          next.delete(exerciseId);
          return next;
        });

      if (!res.ok) {
        clearBusy();
        return { bodyDoc: null, imageSlots: [], anchor: specAnchor, failed: true };
      }

      // Images for this one row, indexed against the whole current worksheet. Re-read
      // from the DB so the flattened slot indices use the freshly-persisted slots.
      let merged = res.exercise;
      const current = await loadWorksheetExercises(lessonPlanId);
      const target = current.find((e) => e.id === exerciseId);
      if (target) {
        // Announce "drawing it again" only when a picture will actually be drawn — a slot
        // present and under the whole-sheet positional cap. No pictures → no stage.
        const willDraw = !!subjectId && drawableSlots([target], current).length > 0;
        if (willDraw) onStage?.('image');
        const withImages = await fillImagesFor([target], current);
        merged = withImages[0];
        setExercises((cur) => cur.map((e) => (e.id === exerciseId ? merged : e)));
      }
      clearBusy();

      return {
        bodyDoc: merged.body_doc,
        imageSlots: merged.image_slots ?? [],
        anchor: merged.generation?.spec?.template_anchor?.trim() || specAnchor,
        failed: merged.status === 'failed' || !merged.body_doc,
      };
    },
    [lessonPlanId, subjectId, fillImagesFor],
  );

  return {
    exercises,
    filling,
    stage,
    fillSpecs,
    regenerating,
    error,
    imagesDisabled,
    generateAll,
    regenerateExercise,
  };
}
