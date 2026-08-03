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
import type { WorksheetDoc, WorksheetV3 } from '@/types/lesson';
import {
  loadWorksheetExercises,
  saveExerciseEdit,
  saveExerciseImageSlots,
} from '@/lib/actions/worksheet-exercise';
import { compileWorksheet } from '@/lib/actions/worksheet-compile';
import { requestExercise, requestImage, requestPlan } from '@/lib/worksheet/generate-client';

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
  /** Generate (no rows) or Regenerate all (rows exist). Both call /plan. */
  generateAll: () => Promise<void>;
  /** Regenerate one card via /exercise (+ its images). Never /plan, never destructive. */
  regenerateCard: (exerciseId: string) => Promise<void>;
  /** Retry a failed card (same path as regenerate). */
  retryCard: (exerciseId: string) => Promise<void>;
  /** (Re)generate one image slot. `regenerate` bypasses the cache. */
  generateSlot: (exerciseId: string, slotId: string, regenerate: boolean) => Promise<void>;
  /** Persist a teacher edit of one card (body_doc + status:'edited') and recompile. */
  applyEdit: (exerciseId: string, bodyDoc: WorksheetDoc) => Promise<void>;
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
          byId.set(row.id, patchSlot(byId.get(row.id)!, ref.slotId, { status: 'ready', storage_path: res.storage_path }));
        } else if (res.ok) {
          // cap_reached refusal — leave the slot as-is (pending token, no controls).
          continue;
        } else if (res.status === 503) {
          disabled = true; // images disabled this session — stop; remaining stay pending
        } else {
          byId.set(row.id, patchSlot(byId.get(row.id)!, ref.slotId, { status: 'failed' }));
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

  const regenerateCard = useCallback(
    async (exerciseId: string) => {
      setRegenerating((prev) => new Set(prev).add(exerciseId));
      const res = await requestExercise(exerciseId);
      setExercises((cur) => {
        const idx = cur.findIndex((e) => e.id === exerciseId);
        if (idx === -1) return cur;
        const updated = res.ok ? res.exercise : { ...cur[idx], status: 'failed' as const };
        const next = [...cur];
        next[idx] = updated;
        return next;
      });
      // Images for this one row, indexed against the whole current worksheet. Re-read
      // from the DB so the flattened slot indices use the freshly-persisted slots.
      const current = await loadWorksheetExercises(lessonPlanId);
      const target = current.find((e) => e.id === exerciseId);
      if (target) {
        const withImages = await fillImagesFor([target], current);
        const merged = withImages[0];
        setExercises((cur) => cur.map((e) => (e.id === exerciseId ? merged : e)));
      }
      setRegenerating((prev) => {
        const next = new Set(prev);
        next.delete(exerciseId);
        return next;
      });
      await compileAndPersist();
    },
    [lessonPlanId, fillImagesFor, compileAndPersist],
  );

  const retryCard = regenerateCard;

  const generateSlot = useCallback(
    async (exerciseId: string, slotId: string, regenerate: boolean) => {
      const row = exercises.find((e) => e.id === exerciseId);
      const slot = row?.image_slots.find((s) => s.slot_id === slotId);
      if (!row || !slot || !subjectId) return;
      const res = await requestImage({
        slot_id: slotId,
        brief: slot.brief,
        lesson_plan_id: lessonPlanId,
        subject_id: subjectId,
        regenerate,
      });
      let updated = row;
      if (res.ok && res.storage_path) {
        updated = patchSlot(row, slotId, { status: 'ready', storage_path: res.storage_path });
      } else if (res.ok) {
        return; // cap refusal — no change
      } else if (res.status === 503) {
        setImagesDisabled(true);
        return;
      } else {
        updated = patchSlot(row, slotId, { status: 'failed' });
      }
      setExercises((cur) => cur.map((e) => (e.id === exerciseId ? updated : e)));
      await saveExerciseImageSlots(exerciseId, updated.image_slots);
      await compileAndPersist();
    },
    [exercises, lessonPlanId, subjectId, compileAndPersist],
  );

  const applyEdit = useCallback(
    async (exerciseId: string, bodyDoc: WorksheetDoc) => {
      const res = await saveExerciseEdit(exerciseId, bodyDoc);
      if (!res.ok) return;
      setExercises((cur) =>
        cur.map((e) => (e.id === exerciseId ? { ...e, body_doc: bodyDoc, status: 'edited' } : e)),
      );
      await compileAndPersist();
    },
    [compileAndPersist],
  );

  return {
    exercises,
    filling,
    fillSpecs,
    regenerating,
    error,
    imagesDisabled,
    generateAll,
    regenerateCard,
    retryCard,
    generateSlot,
    applyEdit,
  };
}
