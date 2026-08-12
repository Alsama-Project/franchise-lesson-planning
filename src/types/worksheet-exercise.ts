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
  /**
   * The model-authored deduplication key — the plain literal thing depicted, 1-4
   * words (e.g. "a cow"). The image route hashes on THIS (not the brief) so the
   * same subject reuses an already-generated image regardless of how the brief is
   * worded. Its contract lives in `WORKSHEET_BUILDER_FLOOR` (IMAGE SLOTS). Falls
   * back to the `[Picture: …]` marker text when the model leaves it blank; nullable
   * only for legacy rows written before the field existed.
   */
  subject: string | null;
  /**
   * The model-authored visual brief for this slot's image — what the image model is
   * actually prompted with. Rich and free to vary; it no longer affects the cache
   * key (that is `subject`). Its content contract is the single copy in
   * `WORKSHEET_BUILDER_FLOOR` — not restated here.
   */
  brief: string;
  /** Lifecycle of the slot's image. */
  status: 'pending' | 'ready' | 'failed';
  /** Storage object path once generated, or null while pending. */
  storage_path: string | null;
  /**
   * Short, human-readable reason the last generation attempt failed — set alongside
   * `status: 'failed'` so the failure is legible in the pane without a SQL query.
   * Absent on any non-failed slot. Truncated and credential-redacted at the write
   * site; never a full stack trace or an API key. (`image_slots` is JSONB, so this
   * needs no migration.)
   */
  error?: string;
}

/**
 * One STRUCTURED item the model declares for an exercise (the composition contract).
 *
 * The model declares WHAT an item is; `compileWorksheet` decides HOW it sits, by
 * running the eleven composition rules (`@/lib/ai/worksheet-compose`) — first match
 * wins. This replaces the old detector approach where compile pattern-matched the
 * model's markdown to guess a layout (which failed four times in a fortnight).
 *
 * Every field is OPTIONAL: an item carries only the fields its shape needs, and a
 * rule fires on the fields present. See the worksheet-builder FLOOR for the field
 * contract the model follows, and `worksheet-compose.ts` for which rule reads which.
 *
 * `items[]` itself is OPTIONAL on the response — absent means today's markdown path
 * runs unchanged. This is what makes the change safe to land in one branch.
 */
export interface WorksheetItem {
  /** A picture: the plain literal subject (1-4 words, e.g. "a bus"), which pairs by
   *  value with an `image_slots` entry of the same `subject`. Repeating the SAME
   *  picture value across items is how the model declares a shared scene (rule 7). */
  picture?: string | null;
  /** A short answer of one or two words (rule 1), or the answer inside a sentence
   *  (rule 10), or the word being sorted (rule 4). Absent = no printed answer key. */
  answer?: string | null;
  /** A full sentence — a picture-prompted sentence (rule 2) or a gap-fill sentence
   *  whose blank is written as an underscore run `___` (rule 10). */
  sentence?: string | null;
  /** The left side of a matching pair (rule 3). */
  left?: string | null;
  /** The right side of a matching pair (rule 3). Compile shuffles the right column. */
  right?: string | null;
  /** The category this item sorts into (rule 4). Distinct values become columns. */
  group?: string | null;
  /** The named speaker of a dialogue line (rule 5), e.g. "Ali" or "You". */
  speaker?: string | null;
  /** A dialogue line's text (rule 5): printed when present, a ruled line when empty. */
  reply?: string | null;
  /** The choices to pick between (rule 9), with no picture. */
  options?: string[] | null;
  /** A writing prompt with no answer key (rule 6). */
  prompt?: string | null;
  /** This item is a worked example — its answer is printed, not blanked (rules 1, 6, 7). */
  isExample?: boolean;
  /** An explicit true/false or choose flag: adds a tick box (rule 1) and flips a
   *  picture-and-sentence row to picture-right (rule 2). NEVER inferred from prose —
   *  the model declares it, because inferring intent is the failure this branch ends. */
  trueFalse?: boolean;
  /** Ruled writing lines to emit for a writing-frame prompt (rule 6). Omitted →
   *  `DEFAULT_WRITING_LINES`, so a model that leaves it out still gets a usable frame. */
  lines?: number | null;
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
  /**
   * The structured items the model declared for this exercise, or null/absent when
   * it declared none (the markdown path). Nested here — not a new column — because it
   * is generation output the exercise route writes, alongside `spec`, and this branch
   * should not add a column for something that may be reshaped once it meets real
   * worksheets. Compile reads `generation.items` to pick a composition rule.
   */
  items?: WorksheetItem[] | null;
  /**
   * An exercise-level reading passage shared by every item (rule 8) — a SIBLING of
   * `items`, never a per-item field, so a field that "sometimes means something else"
   * can't creep in. Null/absent when the exercise has no shared passage.
   */
  passage?: string | null;
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
