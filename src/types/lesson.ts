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
 * How widely a plan applies (migration 0012_lesson_plan_scope):
 *  - `class` — one class group (`class_id` + `school_id` set).
 *  - `centre` — a whole centre's Year-N subject (`school_id` set, `class_id` null).
 *  - `org` — every centre for a curriculum slot (`school_id` + `class_id` null).
 * The three coexist on the same curriculum slot.
 */
export type PlanScope = 'class' | 'centre' | 'org';

/**
 * One "Link it together" technique selection on the cfu / exit_ticket blocks: a
 * reference to a pre-approved technique by its STABLE `activity_bank` id (never
 * its display label, so it survives label edits) plus the teacher's short note.
 */
export interface LinkItTechnique {
  /** Stable `activity_bank` id of the chosen technique. */
  technique: string;
  /** The teacher's short note for this technique. */
  note: string;
}

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
  /**
   * The short "what I'll do" line. Also holds the free-text Recap on the `recap`
   * block (the "Link it together" Recap strip).
   */
  note?: string;
  /** Ids of resources attached to this block. */
  resourceIds?: string[];
  /**
   * "Link it together" technique selections for the `cfu` / `exit_ticket` blocks:
   * the chosen pre-approved techniques (by stable `activity_bank` id) each with a
   * short note. This is the current model; it replaces the legacy single
   * `activity_ref` + `note` for these two blocks. The legacy fields are LEFT IN
   * PLACE for rollback safety (never written, never dropped) and mapped in by the
   * read-time normalizer (see @/lib/editor/link-it). Undefined on other blocks.
   */
  techniques?: LinkItTechnique[];
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
 * A tiptap rich-text document, structurally typed so the domain layer need not
 * depend on the editor package. The concrete node shape is tiptap's
 * `JSONContent`; consumers cast to it where they hold an editor instance.
 */
export type WorksheetDoc = { type?: string; content?: unknown[] } & Record<string, unknown>;

/**
 * A teacher-authored "Free block": a tiptap document (optionally produced by the
 * AI generator) plus any floating elements (text boxes / images) the teacher has
 * placed inside this block. `doc` is null only for a freshly inserted, never-edited
 * block. `elements` are owned by and clamped to this block — there is no page-level
 * element layer.
 */
export interface WorksheetFreeBlock {
  id: string;
  kind: 'free';
  doc: WorksheetDoc | null;
  /** True when the doc was produced by the AI generator (shows the badge). */
  fromAI: boolean;
  /** Floating elements contained within this block (block-relative coords). */
  elements: FloatingElement[];
}

/**
 * A reference to a shared resource pulled in from the bank. Only the id is
 * persisted; the resource itself is resolved through the resource layer on
 * render. `uploaderName` is a display snapshot for the block badge.
 */
export interface WorksheetResourceBlock {
  id: string;
  kind: 'resource';
  resourceId: string;
  uploaderName: string | null;
}

/** One ordered exercise in the student worksheet body. */
export type WorksheetBlock = WorksheetFreeBlock | WorksheetResourceBlock;

/**
 * Geometry shared by every freely-positioned ("floating") element. Coordinates
 * are BLOCK-RELATIVE pixels in the owning block's content box (at natural size /
 * zoom = 1): `x`/`y` from the block content-box top-left, `w`/`h` the element
 * size. They are always clamped to the block box so an element can never leave
 * its block, and so they print exactly where placed. `z` orders overlapping
 * elements within the block.
 */
export interface FloatingBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/** A freely-positioned rich-text box (the Word-style text box). */
export interface FloatingTextBox extends FloatingBase {
  kind: 'textbox';
  doc: WorksheetDoc | null;
  /** Visible border around the box. Default false. */
  border: boolean;
  /** Background fill. Default 'transparent'. */
  fill: 'transparent' | 'white';
}

/** A freely-positioned (float-over-text) image. */
export interface FloatingImage extends FloatingBase {
  kind: 'image';
  src: string;
  alt: string | null;
}

/** A freely-positioned element overlaid on the worksheet body. */
export type FloatingElement = FloatingTextBox | FloatingImage;

/**
 * The persisted student-worksheet body, stored in `lesson_plans.worksheet`
 * (JSONB, migration 0009). `version` lets the loader migrate older shapes — v1
 * was a single bare tiptap document; v2 is this ordered block list. The column
 * is unenforced by Postgres, so this type is the source of truth for its shape.
 *
 * Floating elements (text boxes / images) are owned by individual Free blocks
 * (see {@link WorksheetFreeBlock.elements}), not the worksheet — there is no
 * page-level element layer. `parseWorksheet` re-homes any legacy page-level
 * `elements` array into the first Free block.
 */
export interface Worksheet {
  version: 2;
  blocks: WorksheetBlock[];
}

/**
 * Domain representation of a `lesson_plans` row, with the JSONB columns typed.
 * Dates/timestamps are ISO strings as returned by Supabase.
 */
export interface LessonPlan {
  id: string;
  /**
   * The class this plan is for. `null` for `centre`/`org` scope plans, which are
   * not tied to a single class group (migration 0012_lesson_plan_scope made the
   * column nullable).
   */
  class_id: string | null;
  /** Plan scope — class / centre / org. See {@link PlanScope}. */
  scope: PlanScope;
  /** The plan's subject (mirrors the class's subject for class scope). */
  subject_id: string | null;
  /** The plan's centre. Null for `org` scope (spans every centre). */
  school_id: string | null;
  /** Curriculum year the plan targets (0–6). */
  year: number | null;
  /**
   * Reference into the curriculum (Supabase `curriculum_lesson`). Stays `text`
   * with no FK: resolved by `curriculum_lesson.lesson_key` first, then best-effort
   * legacy `taxonomy_id` (e.g. "0.S1.K1.H3"). See @/lib/curriculumUtils#getLessonById.
   */
  curriculum_lesson_id: string;
  /**
   * Calendar date the lesson sits on. `null` now that the board places cards by
   * curriculum coordinate (month/week/period), not by date
   * (migration 0012_lesson_plan_scope made the column nullable).
   */
  lesson_date: string | null;
  /**
   * Mon–Fri column on the weekly board (1=Mon..5=Fri). Null on legacy rows
   * (migration 0016_lesson_plans_weekday). See {@link period}.
   */
  weekday: number | null;
  /**
   * Day-ordinal: the plan's 1-based position within its (year, weekday) stack on
   * the board. REPURPOSED by migration 0016 from the old "curriculum period" — the
   * curriculum period is now recovered from {@link curriculum_lesson_id} when
   * needed. The displayed "Period N" is re-derived from the sorted stack, so this
   * is a sort hint, not an authoritative label.
   */
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
   * Student worksheet body. Stored in the `lesson_plans.worksheet` JSONB column
   * and unenforced by Postgres. The current shape is the versioned {@link
   * Worksheet} envelope (an ordered {@link WorksheetBlock} list); older rows hold
   * a bare tiptap document. Left as `unknown` at the row boundary and normalised
   * via `parseWorksheet` (see @/lib/editor/worksheet). Optional so existing
   * plans/code keep working.
   */
  worksheet?: unknown;
  /**
   * Required-materials list, an array of entries. Stored in the
   * `lesson_plans.required_materials` JSONB column. The editor defines the exact
   * entry shape later. Optional so existing plans/code keep working.
   */
  requiredMaterials?: unknown[];
}
