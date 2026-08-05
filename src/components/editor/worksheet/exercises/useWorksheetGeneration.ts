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

/** The per-slot picture cap. Mirrors the route's `WORKSHEET_IMAGE_CAP` default (8);
 *  the route is authoritative and refuses server-side, so this is only for the
 *  running count and the positional refused-state render. */
export const IMAGE_CAP = 8;

/** A slot with its whole-worksheet flattened index, for the positional cap/refusal. */
export interface FlatSlotRef {
  exerciseId: string;
  slotId: string;
  index: number;
}

/** Flatten every row's slots in whole-worksheet order (position, then array order). */
export function flattenSlots(rows: WorksheetExercise[]): FlatSlotRef[] {
  const flat: FlatSlotRef[] = [];
  for (const row of rows) {
    const slots = Array.isArray(row.image_slots) ? row.image_slots : [];
    for (const slot of slots) {
      flat.push({ exerciseId: row.id, slotId: slot.slot_id, index: flat.length });
    }
  }
  return flat;
}

export interface GenerationState {
  /** The live rows the surface renders. */
  exercises: WorksheetExercise[];
  /** Full-sheet generation in flight → render every planned position as a skeleton. */
  filling: boolean;
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
   */
  regenerateExercise: (exerciseId: string, instruction?: string) => Promise<ExerciseRegenPayload | null>;
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
    async (rows: WorksheetExercise[], allRowsInOrder: WorksheetExercise[]): Promise<WorksheetExercise[]> => {
      if (!subjectId) return rows; // no subject → cannot steer the illustrator; keep tokens
      const targetIds = new Set(rows.map((r) => r.id));
      const flat = flattenSlots(allRowsInOrder).filter((f) => targetIds.has(f.exerciseId));
      const byId = new Map(rows.map((r) => [r.id, r]));
      let disabled = false;
      for (const ref of flat) {
        if (disabled) break;
        if (ref.index >= IMAGE_CAP) continue; // positional refusal — server would 200 refuse
        const row = byId.get(ref.exerciseId);
        const slot = row?.image_slots.find((s) => s.slot_id === ref.slotId);
        if (!row || !slot) continue;
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
    const plan = await requestPlan(lessonPlanId);
    if (!plan.ok) {
      setError(plan.error);
      setFilling(false);
      setFillSpecs(null);
      return;
    }
    setFillSpecs(plan.specs);
    // Recover the persisted skeleton rows (with ids) — /plan returns specs only.
    const skeletons = await loadWorksheetExercises(lessonPlanId);
    // Generate every exercise, buffered — nothing is shown until all settle.
    const generated: WorksheetExercise[] = [];
    for (const row of skeletons) {
      const res = await requestExercise(row.id);
      generated.push(res.ok ? res.exercise : { ...row, status: 'failed' });
    }
    // Then all images, in flattened order, still buffered.
    const withImages = await fillImagesFor(generated, generated);
    // ONE atomic reveal.
    setExercises(withImages);
    setFilling(false);
    setFillSpecs(null);
    await compileAndPersist();
  }, [lessonPlanId, fillImagesFor, compileAndPersist]);

  // Latest rows for reading a spec anchor without re-binding the callback each edit.
  const exercisesRef = useRef(exercises);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  const regenerateExercise = useCallback(
    async (exerciseId: string, instruction?: string): Promise<ExerciseRegenPayload | null> => {
      setRegenerating((prev) => new Set(prev).add(exerciseId));
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
    [lessonPlanId, fillImagesFor],
  );

  return {
    exercises,
    filling,
    fillSpecs,
    regenerating,
    error,
    imagesDisabled,
    generateAll,
    regenerateExercise,
  };
}
