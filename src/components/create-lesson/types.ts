// Shared, client-safe types for the "+ Lesson" creation flow. These are imported
// by both the client dialog and the server data/action layers, so this module
// must stay free of any server-only imports (no Supabase, no `server-only`).

/** A class the signed-in user may plan for, within one space. */
export interface CreatableClass {
  id: string;
  year: number;
  groupLabel: string;
  /** Display label, e.g. "Year 2 · A". */
  label: string;
}

/** One (centre · subject) space, with the user's classes in it. */
export interface CreateSpaceGroup {
  schoolId: string;
  subjectId: string;
  /** The subject's `code` (e.g. "english") — the curriculum filter key. */
  subjectCode: string;
  schoolName: string;
  subjectName: string;
  /** Group label, e.g. "Shatila · English". */
  label: string;
  classes: CreatableClass[];
}

/** A month with its available curriculum week numbers, for the step-2 nav. */
export interface MonthNav {
  month: string;
  weeks: number[];
}

/** One curriculum period cell shown in the step-2 week grid. */
export interface PickerCell {
  /** Day-of-week period (1–5). P1 = Mon … P5 = Fri. */
  period: number;
  /** The curriculum_lesson.lesson_key written into the new plan. */
  lessonKey: string;
  /** Daily learning outcome (stem-cleaned). */
  dailyOutcome: string;
  /** Focus area / linguistic skill, e.g. "Reading". */
  focusArea: string;
}

/**
 * Optional pre-selection passed when the dialog opens. `classId` jumps straight
 * to step 2 (class known); `date` anchors the calendar week the new plan lands in
 * (its weekday pre-selects the matching period cell).
 */
export interface CreateSeed {
  classId?: string;
  /** A `YYYY-MM-DD` date — the day the affordance was clicked on. */
  date?: string;
}
