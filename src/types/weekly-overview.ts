// View-model types for the day-column planning board. These describe the shape
// the data layer (src/lib/weekly-overview.ts) returns and the Calendar / Status
// views render.
//
// The board is a per-year set of Mon–Fri columns. A lesson appears on the board
// only once a plan exists for it; the plan carries its placement — `weekday`
// (which column) and `period` (its 1-based position in that day's stack). The
// curriculum lessons for the selected (month, week) are the POOL the "+ Add
// lesson" picker draws from, not the board skeleton.

import type { PlanScope, PlanStatus } from '@/types/lesson';

/**
 * What a slot/column shows as its status. The four stored `PlanStatus` values
 * plus the derived `not_started` (no plan covers a curriculum lesson yet) — used
 * by the Status (kanban) view.
 */
export type SlotStatus = PlanStatus | 'not_started';

/** The owner of a plan — for the "whose plan" avatar and the people filter. */
export interface PlanOwner {
  id: string;
  name: string;
  initials: string;
}

/**
 * One plan placed on the day-column board. `weekday` is the column it sits in and
 * `period` its stored day-ordinal (sort hint); the displayed "Period N" is
 * re-derived from the sorted stack so it stays correct as cards are dragged. Only
 * the creator (or a coordinator / admin) may move a plan — `canEdit` gates the
 * drag, and shared cards sort into the column by their stored placement.
 */
export interface BoardPlan {
  /** The plan id. */
  id: string;
  /** The `curriculum_lesson.lesson_key` this plan teaches (`curriculum_lesson_id`). */
  lessonKey: string;
  /** Curriculum year (0–6) the plan targets. */
  year: number;
  /** The plan's subject `code` (e.g. "english") — the board can span subjects. */
  subjectCode: string;
  /** The plan's subject display name — the card's attribution label. */
  subjectName: string;
  /**
   * The centre (school) name to show under the subject, or `null` when the centre
   * label should be omitted — a single-centre user, or an org-scoped ("all centres")
   * plan whose scope chip already conveys reach. Set only when the user spans >1
   * centre AND the plan belongs to one centre.
   */
  centreName: string | null;
  /**
   * The band this plan belongs to (`centreId|subjectCode|year`) — the key the
   * Calendar view groups a day's stack by when re-deriving each card's "Period N",
   * so cards of different (subject, centre, year) never share one numbering.
   */
  groupKey: string;
  /** Day column (1 = Mon … 5 = Fri). Legacy rows fall back to a derived day. */
  weekday: number;
  /** Stored day-ordinal — the sort hint within its (year, weekday) stack. */
  period: number;
  status: PlanStatus;
  /** Plan scope — drives the Class / Centre / All centres chip. */
  scope: PlanScope;
  /** Who created the plan (avatar + people filter). Null on legacy rows. */
  owner: PlanOwner | null;
  /**
   * Whether the signed-in user may edit/move this plan (its creator, a
   * coordinator of its space, or an admin). Drives editable-wizard vs
   * read-only-view routing AND whether the card is draggable.
   */
  canEdit: boolean;
  /**
   * Whether the signed-in user may delete (soft-delete) this plan from the board —
   * the author of an `in_progress` plan, or a coordinator/admin of its space at any
   * status. Drives the card's trash affordance; the RPC (0048) is the real gate.
   */
  canDelete: boolean;
  /** Coordinator note when returned (`needs_review`); null otherwise. */
  reviewNote: string | null;
  /** Daily learning outcome (stem-cleaned) — context for "+ make your own". */
  dailyOutcome: string;
}

/**
 * One curriculum lesson available to place this week for a year — the pool the
 * "+ Add lesson" picker offers and the Status view's "Not started" cards.
 */
export interface BoardLesson {
  /** The `curriculum_lesson.lesson_key` written into a new plan's `curriculum_lesson_id`. */
  lessonKey: string;
  /** Curriculum period (1–5) — the picker's label and default day. */
  period: number;
  /** Daily learning outcome (stem-cleaned) — the picker headline. */
  dailyOutcome: string;
  /** Focus area / linguistic skill, e.g. "Reading". May be empty. */
  focusArea: string;
}

/**
 * One band on the board: a `(centre, subject, year)` the user teaches. The board
 * is user-wide, so a single year number (e.g. Year 2) can appear in several bands —
 * one per subject, and per centre when the user spans centres — hence the composite
 * `key`. `plans` are every plan placed this week for the band (any weekday),
 * pre-sorted by (weekday, period); `lessons` is the curriculum pool the picker
 * draws from. On a single-subject, single-centre board there is one band per year,
 * exactly as before.
 */
export interface BoardYear {
  /** Stable band identity: `centreId|subjectCode|year`. */
  key: string;
  year: number;
  /** The band's centre (school) id — the centre a new plan here is created against. */
  centreId: string;
  /** The band's centre display name (for the card's centre label). */
  centreName: string;
  /** The band's subject `code`. */
  subjectCode: string;
  /** The band's subject display name. */
  subjectName: string;
  plans: BoardPlan[];
  lessons: BoardLesson[];
}

/** A curriculum (month, week) position the prev/next arrows step through. */
export interface BoardCoordinate {
  month: string;
  week: number;
}

/**
 * One entry in the month → week picker: a curriculum coordinate plus its flat
 * teaching-week number. `weekNo` is the SAME 1-based number the board shows
 * (`weekNo = index + 1` in the ordered scheme of work), so the picker and the
 * prev/next arrows share one numbering — no remapping.
 */
export interface BoardWeekOption {
  month: string;
  week: number;
  weekNo: number;
}

/** A class the teacher teaches, for the scope chooser's "My class" option. */
export interface BoardClass {
  id: string;
  /** Display label, e.g. "Year 2 · A". */
  label: string;
}

/** One subject the user can export a week PDF for — the download picker's options. */
export interface BoardDownloadSubject {
  /** The subject's `code`, passed to `/api/pdf/week`. */
  subjectCode: string;
  /** The subject's display name. */
  subjectName: string;
  /** The years to export for this subject (union across the user's centres for it). */
  years: number[];
}

/** Everything the planning board renders for the selected curriculum week. */
export interface BoardData {
  /** The signed-in teacher's display name. */
  teacherName: string;
  /**
   * "Centre · Subject" context line — kept only when the user's spaces collapse to a
   * single `(centre, subject)`. Null on a user-wide (multi-subject or multi-centre)
   * board, where no single centre·subject describes it.
   */
  context: string | null;
  /** The distinct subject names the board spans (English first) — for empty-state copy. */
  subjectNames: string[];
  /** True when the board spans more than one subject (drives user-wide chrome). */
  spansMultipleSubjects: boolean;
  /** True when the board spans more than one centre (drives the per-card centre label). */
  spansMultipleCentres: boolean;
  /** Per-subject week-PDF export targets — the "Download week" picker's options. */
  downloadSubjects: BoardDownloadSubject[];
  /** The selected curriculum coordinate. */
  coordinate: BoardCoordinate;
  /** Human label for the coordinate, e.g. "March · Week 2". Kept as the week label's tooltip. */
  coordinateLabel: string;
  /**
   * The curriculum teaching-week number (1-based: Month 1 Week 1 = 1, …≈36),
   * derived by counting curriculum coordinates in order. Drives the "Week {n}"
   * label and is the `term_week` lookup key. `0` when no curriculum is synced.
   */
  weekNo: number;
  /**
   * The shown week's real Monday (`YYYY-MM-DD`) from `term_week.starts_on`, or
   * `null` when no mapping row exists (the table is empty for now). Never fabricated.
   */
  mondayDate: string | null;
  /** Whether today falls in the shown week — only ever true when a `term_week` row proves it. */
  isCurrent: boolean;
  /** The previous coordinate (or null at the start of the scheme of work). */
  prev: BoardCoordinate | null;
  /** The next coordinate (or null at the end of the scheme of work). */
  next: BoardCoordinate | null;
  /**
   * Every curriculum coordinate in scheme-of-work order, each carrying its flat
   * `weekNo` — the month → week picker's option list. Empty when no curriculum is
   * synced. Built from the same ordered list that derives `weekNo`, so picker and
   * arrows agree on the numbering.
   */
  weeks: BoardWeekOption[];
  /** One band per year the teacher teaches, in ascending year order. */
  years: BoardYear[];
  /** Distinct plan owners across the visible plans — the people-filter options. */
  owners: PlanOwner[];
  /** Total plans (any status/scope) visible for this coordinate. */
  planCount: number;
  /** False when the teacher teaches no classes yet (calm empty state). */
  hasClasses: boolean;
  /**
   * True when the viewer is a COORDINATOR of the board's resolved (centre, subject)
   * space. The board then becomes a space-wide, read-only review surface: cards are
   * not draggable and carry no status control, they open the read-only review view,
   * and the Status board omits the "Not started" column. False for a teacher's own
   * board (unchanged behaviour).
   */
  boardReadOnly: boolean;
  /**
   * The teacher's own classes (via `class_teachers`) in the board subject, keyed
   * by year — drives the "My class" choice in the scope chooser. A year with more
   * than one entry lets the teacher pick which class.
   */
  myClassesByYear: Record<number, BoardClass[]>;
}
