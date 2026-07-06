// Types for curriculum data parsed from the Alsama English curriculum spreadsheet.
// These are read-only reference data; for user-created content see src/types/lesson.ts.

export interface CurriculumLesson {
  /** Lesson identifier, e.g. "0.S1.K1.H3". Format: {focusArea}.{skillRef}.{knowledgeRef}.{hourRef} — segment 1 is the Focus Area, NOT the year (see @/lib/curriculum/taxonomy). */
  id: string;
  /** Full year label, e.g. "Year 0" */
  year: string;
  /** Numeric year extracted from the label (0–6) */
  yearNum: number | null;
  /** Calendar month name, e.g. "February" */
  month: string;
  /** Calendar week number within the school year */
  week: number | null;
  /** Period label, e.g. "Period 3" */
  period: string;
  /** Numeric period within the week (1–5) */
  periodNum: number | null;
  /** Daily learning outcome used in lesson plans */
  dailyLO: string;
  /** Linguistic skill category, e.g. "Basic Literacy", "Reading", "Writing" */
  linguisticSkill: string;
  /** Skill learning objective reference code, e.g. "S1" */
  skillLORef: string;
  /** Skill learning objective text */
  skillLO: string;
  /** Knowledge learning objective reference code, e.g. "K1" */
  knowledgeLORef: string;
  /** Knowledge learning objective text */
  knowledgeLO: string;
  /**
   * Combined monthly learning outcome (curriculum_lesson.monthly_lo), distinct
   * from skillLO (the monthly *skills* LO). Optional — only the DB-backed path
   * populates it. Reserved for the AI resource generator's curriculum context.
   */
  monthlyLO?: string;
  /** Suggested resources and materials */
  resources: string;
  /** Vocabulary and linguistic skill content focus */
  vocabFocus: string;
  /** Grammar content focus */
  grammarFocus: string;
  /** Thematic context for the lesson */
  theme: string;
  /**
   * Subject this lesson belongs to (e.g. "english"). Optional and currently
   * unpopulated — reserved for the multi-subject curriculum work (see doc 03).
   */
  subject?: string;
}

/**
 * Shape of the curriculum.json lookup.
 * Most IDs map to a single lesson. IDs that recur across years
 * (e.g. exam-slot "E.*" rows) map to an array.
 */
export type CurriculumLookup = Record<string, CurriculumLesson | CurriculumLesson[]>;
