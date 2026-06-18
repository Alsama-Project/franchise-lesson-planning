// View-model types for the Weekly Overview. These describe the shape the data
// layer (src/lib/weekly-overview.ts) returns and the page renders directly —
// the read view of one teacher's Monday–Friday week.

import type { PlanStatus } from '@/types/lesson';
import type { Weekday } from '@/lib/week';

/**
 * What a slot shows as its status. The four stored `PlanStatus` values plus the
 * derived `not_started` (no plan row exists for that class/day yet).
 */
export type SlotStatus = PlanStatus | 'not_started';

/** The curriculum target resolved from a plan's `curriculum_lesson_id`. */
export interface CurriculumTarget {
  /** Daily learning outcome (cleaned). The slot headline. */
  dailyLO: string;
  /** Thematic context, e.g. "Food and Drink". May be empty. */
  theme: string;
}

/** The plan occupying a slot, trimmed to what the overview needs. */
export interface SlotPlan {
  id: string;
  status: PlanStatus;
  /** Coordinator note when returned (`needs_review`); null otherwise. */
  reviewNote: string | null;
}

/** One weekday cell for one class. */
export interface WeekSlot {
  weekday: Weekday;
  /** The cell's calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Whether this date is today (drives the highlighted column). */
  isToday: boolean;
  /** The plan for this class/day, or null when none exists. */
  plan: SlotPlan | null;
  /** `plan.status`, or `not_started` when `plan` is null. */
  status: SlotStatus;
  /** Curriculum target for the plan, or null when there is no plan. */
  target: CurriculumTarget | null;
}

/** One class row: its identity plus a Mon–Fri slot for each weekday. */
export interface ClassWeek {
  classId: string;
  year: number;
  groupLabel: string;
  schoolName: string;
  subjectName: string;
  /** Display label, e.g. "Year 2 · A". */
  label: string;
  /** Exactly five slots, Monday→Friday. */
  slots: WeekSlot[];
}

/** Everything the Weekly Overview page renders for the selected week. */
export interface WeeklyOverview {
  /** The Monday of the selected week, `YYYY-MM-DD`. */
  weekStart: string;
  /** Human label for the Mon–Fri span. */
  weekLabel: string;
  /** The signed-in teacher's display name. */
  teacherName: string;
  /** "School · Subject" context line, derived from the teacher's classes. */
  context: string | null;
  /** Total plans (any status) across the week — for the summary line. */
  planCount: number;
  /** One row per assigned class. Empty when the teacher has no classes. */
  classes: ClassWeek[];
}
