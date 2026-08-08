'use client';

// Per-exercise regenerate, applied to the LIVE editor.
//
// The seed-once document editor never re-reads its `value` prop, so a recompiled
// document placed in React state is invisible to it — the next keystroke would
// overwrite it. Per-exercise regenerate therefore splices new nodes straight into
// the running editor via `editor.commands`; the editor's own `onUpdate` then fires
// once, lifting the change through `onChange` to the existing debounce. One writer,
// unchanged.
//
// The splice replaces EXACTLY one exercise's node range (every top-level node
// carrying its `exerciseId`, contiguous or not) and touches nothing else. Teacher
// content between those nodes has no id, is not removed, and survives adjacent to the
// regenerated content. See `planExerciseSplice` for the range/insert semantics.

import type { Editor, JSONContent } from '@tiptap/core';
import type { WorksheetDoc } from '@/types/lesson';
import type { ImageSlot } from '@/types/worksheet-exercise';
import {
  exerciseNodes,
  fillImageSlots,
  layoutExercisePictures,
  failedExercisePlaceholder,
  planExerciseSplice,
  tagCompiled,
} from '@/lib/ai/worksheet-assemble';
import { SCAFFOLD_LOCK_BYPASS } from './nodes/ScaffoldHeadingLock';

/** What a regenerate produced for one exercise, ready to splice. */
export interface ExerciseRegenPayload {
  /** The fresh body, or null when the regenerate failed. */
  bodyDoc: WorksheetDoc | null;
  /** The row's image slots (marker paragraphs resolve to image nodes where ready). */
  imageSlots: ImageSlot[];
  /** The exercise's scaffold anchor, used only when its nodes were deleted. */
  anchor: string | null;
  /** True when generation failed — a visible, retryable placeholder is spliced. */
  failed: boolean;
}

/**
 * Build the tagged top-level nodes for one exercise: its resolved body (images
 * filled), or a single failed placeholder. Every node is stamped with `wsCompiled`
 * + the `exerciseId` so a later regenerate finds it again. `failedText` is the
 * content-language string for the placeholder.
 */
export function buildExerciseNodes(
  exerciseId: string,
  payload: ExerciseRegenPayload,
  failedText: string,
): JSONContent[] {
  const raw =
    payload.failed || !payload.bodyDoc
      ? failedExercisePlaceholder(failedText)
      : fillImageSlots(layoutExercisePictures(exerciseNodes(payload.bodyDoc)), payload.imageSlots);
  return raw.map((n) => tagCompiled(n, exerciseId)) as JSONContent[];
}

/**
 * Splice one exercise's regenerated nodes into the live editor, replacing its
 * existing range in place. Returns true on success; false if the new nodes could not
 * be parsed against the schema (the document is left untouched). The transaction is a
 * single `chain().run()`, so `onUpdate` fires exactly once.
 */
export function applyExerciseSplice(
  editor: Editor,
  exerciseId: string,
  nodes: JSONContent[],
  anchor: string | null,
): boolean {
  return editor
    .chain()
    .command(({ tr, state, dispatch }) => {
      // A programmatic write — never the teacher editing a scaffold heading — so the
      // heading lock must never reject it.
      tr.setMeta(SCAFFOLD_LOCK_BYPASS, true);
      // Top-level node boundaries: positions[i] is the doc position just before the
      // i-th top-level child; positions[i+1] just after it.
      const positions: number[] = [0];
      const topNodes: unknown[] = [];
      state.doc.forEach((node) => {
        topNodes.push(node.toJSON());
        positions.push(positions[positions.length - 1] + node.nodeSize);
      });

      const plan = planExerciseSplice(topNodes, exerciseId, anchor);

      let pmNodes;
      try {
        pmNodes = nodes.map((json) => state.schema.nodeFromJSON(json));
      } catch {
        return false; // invalid content — abort, leaving the document untouched
      }

      if (!dispatch) return true;

      const insertPos = positions[plan.insertIndex];
      // Delete removed ranges high→low so each range's original coordinates stay
      // valid until it is deleted; then map the insert position across the deletions.
      const ranges = plan.removeIndices
        .map((i) => ({ from: positions[i], to: positions[i + 1] }))
        .sort((a, b) => b.from - a.from);
      for (const r of ranges) tr.delete(r.from, r.to);
      tr.insert(tr.mapping.map(insertPos, -1), pmNodes);
      return true;
    })
    .run();
}
