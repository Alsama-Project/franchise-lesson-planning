// Hand-authored domain types for the worksheet-generation spine.
//
// These mirror the `worksheet_exercise` table (migration 0067) whose JSONB
// columns Postgres cannot enforce: `generation` (the plan/exercise provenance),
// `image_slots` (the derived picture slots), and `body_doc` (the tiptap
// fragment). The database schema is the locked source of truth; keep these in
// sync with it by hand (`database.types.ts` is a placeholder stub in this repo,
// so the Supabase client is untyped and these types carry the shape).

import type { WorksheetDoc } from './lesson';

/**
 * A single planned exercise, produced by `POST /api/worksheet/plan` and stored
 * verbatim on the skeleton row's `generation.spec`. This is the contract the
 * planner emits and the per-exercise generator reads back — it must stay in
 * lock-step with the plan route's `output_config` JSON schema.
 */
export interface ExerciseSpec {
  /** 1-based order within the worksheet. Re-sequenced server-side to be contiguous. */
  position: number;
  /**
   * The exercise-type label, taken verbatim from the active `resource_tags`
   * (`dimension = 'exercise_type'`) vocabulary — spaces and slashes included.
   * Never normalised; there is no label→id map in the codebase.
   */
  exercise_type: string;
  /** Short human title for the exercise. */
  title: string;
  /** The generation brief — what the per-exercise generator should produce. */
  brief: string;
  /** Rough vertical footprint, to help layout downstream. */
  estimated_height: 'short' | 'medium' | 'tall';
  /**
   * How the exercise is sourced. Maps to the row `origin`:
   * `generate`→`generated`, `reuse`→`reused`, `adapt`→`adapted`.
   */
  source: 'generate' | 'reuse' | 'adapt';
  /** Bank resource this exercise reuses/adapts, or null when generating fresh. */
  resource_id: string | null;
  /** Number of images this exercise needs. Total across a plan must be ≤ 8. */
  image_count: number;
  /**
   * The heading text in the subject's worksheet template this exercise fills, or
   * null when there is no template or no matching heading. Matched to a template
   * heading by exact (trimmed) text — never a fuzzy/normalised rule.
   */
  template_anchor: string | null;
}

/**
 * One image slot derived from a `[Picture: …]` marker in an exercise's
 * `body_md`. The marker stays in `body_md` so a failed or disabled image
 * degrades to current behaviour with no renderer change; this slot is the
 * generation binding the image route fills in.
 */
export interface ImageSlot {
  /** Stable id for this slot within the exercise. */
  slot_id: string;
  /** The subject the image is for (the plan's subject uuid), steering the illustrator. */
  subject: string | null;
  /** The literal picture description from the marker. */
  brief: string;
  /** Lifecycle of the slot's image. */
  status: 'pending' | 'ready' | 'failed';
  /** Storage object path once generated, or null while pending. */
  storage_path: string | null;
}

/**
 * The `worksheet_exercise.generation` JSONB payload — the provenance of a row,
 * written by the plan route (skeleton) and updated by the exercise route.
 */
export interface WorksheetExerciseGeneration {
  /** Anthropic model id used. */
  model: string;
  /** The context documents that fed the composed prompt (observability). */
  docs_used: unknown[];
  /** The plan's curriculum reference at generation time. */
  curriculum_lesson_id: string | null;
  /** The spec this row was planned from (source of truth for regeneration). */
  spec: ExerciseSpec;
  /** Content hash of the prompt that produced the row. */
  prompt_hash: string;
}

/** Lifecycle of a worksheet exercise row (mirrors the CHECK in 0067). */
export type WorksheetExerciseStatus = 'generating' | 'ready' | 'failed' | 'edited';

/** How the exercise content was sourced (mirrors the CHECK in 0067). */
export type WorksheetExerciseOrigin = 'generated' | 'reused' | 'adapted';

/**
 * Domain representation of a `worksheet_exercise` row, with the JSONB columns
 * typed. Timestamps are ISO strings as returned by Supabase.
 */
export interface WorksheetExercise {
  id: string;
  lesson_plan_id: string;
  position: number;
  title: string;
  exercise_type: string;
  body_md: string | null;
  body_doc: WorksheetDoc | null;
  status: WorksheetExerciseStatus;
  origin: WorksheetExerciseOrigin;
  resource_id: string | null;
  image_slots: ImageSlot[];
  generation: WorksheetExerciseGeneration | null;
  created_at: string;
  updated_at: string;
}

/** Map an `ExerciseSpec.source` to the row `origin` value. */
export function originFromSource(source: ExerciseSpec['source']): WorksheetExerciseOrigin {
  switch (source) {
    case 'reuse':
      return 'reused';
    case 'adapt':
      return 'adapted';
    case 'generate':
    default:
      return 'generated';
  }
}
