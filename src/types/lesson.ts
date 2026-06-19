// Hand-authored domain types for user-created lesson plans.
//
// These mirror the `lesson_plans` table but capture the shapes Postgres cannot
// enforce — the JSONB `blocks` array and `smartt_check` object. The database
// schema (supabase/migrations) is the locked source of truth; these types must
// be kept in sync with it by hand. Generated row types live in
// src/types/database.types.ts (see `npm run gen:types`).

/** The fixed set of timed blocks every Alsama lesson is built from. */
export type LessonBlockType =
  | 'anthem'
  | 'warm_up'
  | 'cool_down'
  | 'check_homework'
  | 'recap'
  | 'new_content'
  | 'cfu'
  | 'independent_practice'
  | 'exit_ticket'
  | 'homework';

/** Gradual-release teaching phase. `null` for blocks with no phase. */
export type TeachingPhase = 'i_do' | 'we_do' | 'you_do';

/** Approval-workflow state of a plan. ("not started" = the absence of a row.) */
export type PlanStatus = 'in_progress' | 'submitted' | 'needs_review' | 'approved';

/**
 * One timed block within a lesson. Stored as an ordered element of the
 * `lesson_plans.blocks` JSONB array.
 */
export interface Block {
  /** Which of the fixed block types this is. */
  type: LessonBlockType;
  /** Fixed display name for the block type (e.g. "Check for Understanding"). */
  title: string;
  /** Headline the teacher gives the chosen activity (shown in the editor sidebar). */
  activity_title: string;
  /** Optional `activity_bank` id when chosen from the menu; null otherwise. */
  activity_ref: string | null;
  /** What the teacher does during this block. */
  teacher_does: string;
  /** What the students do during this block. */
  students_do: string;
  /** Materials needed. NB: the field is named "resources", not "materials". */
  resources: string;
  /** Teaching phase, or null for blocks that have none. */
  phase: TeachingPhase | null;
  /** Planned duration of the block in minutes. */
  duration_minutes: number;
  /**
   * Editable per-block time in minutes. Distinct from `duration_minutes` (the
   * format's fixed default); the editor lets teachers adjust this. Optional so
   * existing plans/code keep working.
   */
  minutes?: number;
  /** The short CFU "what I'll do" line. */
  note?: string;
  /** Ids of resources attached to this block. */
  resourceIds?: string[];
}

/**
 * The six SMARTT components an objective is validated against. The second "T"
 * label is provisional and to be confirmed when the editor/validation phase
 * lands; the JSONB column is unenforced so this can be refined without a
 * migration.
 */
export type SmarttComponent =
  | 'specific'
  | 'measurable'
  | 'achievable'
  | 'relevant'
  | 'time_bound'
  | 'trackable';

/** Validation result for a single SMARTT component. */
export interface SmarttComponentResult {
  passed: boolean;
  feedback?: string;
}

/**
 * Optional per-component validation result for a SMARTT objective. Stored in the
 * `lesson_plans.smartt_check` JSONB column. Any subset of components may be present.
 */
export type SmarttCheck = Partial<Record<SmarttComponent, SmarttComponentResult>>;

/**
 * Domain representation of a `lesson_plans` row, with the JSONB columns typed.
 * Dates/timestamps are ISO strings as returned by Supabase.
 */
export interface LessonPlan {
  id: string;
  class_id: string;
  /** A curriculum.json key, e.g. "0.S1.K1.H3" (no FK — curriculum is a flat file). */
  curriculum_lesson_id: string;
  lesson_date: string;
  period: number | null;
  status: PlanStatus;
  smartt_objective: string | null;
  smartt_check: SmarttCheck | null;
  blocks: Block[];
  created_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Student worksheet as a rich-text (tiptap) document. Stored in the
   * `lesson_plans.worksheet` JSONB column. Tiptap's JSON shape is unenforced
   * here; the editor defines the concrete document type when it wires
   * persistence. Optional so existing plans/code keep working.
   */
  worksheet?: unknown;
  /**
   * Required-materials list, an array of entries. Stored in the
   * `lesson_plans.required_materials` JSONB column. The editor defines the exact
   * entry shape later. Optional so existing plans/code keep working.
   */
  requiredMaterials?: unknown[];
}
