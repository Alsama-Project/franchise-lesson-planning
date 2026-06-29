// View-model the PDF components render from.
//
// This is deliberately decoupled from the `lesson_plans` row shape so the
// documents depend on a stable, presentational contract rather than the DB. It
// mirrors what the editor already resolves (plan + class + curriculum) and
// leaves explicit, optional slots for data that isn't on lesson_plans yet —
// attached resources, required materials, and a worksheet — so those can be
// populated later by extending the loader, with no change to the components'
// public shape.

import type { LessonPlan } from '@/types/lesson';

/** Class identity shown in the PDF header. */
export interface PdfClassContext {
  year: number;
  schoolName: string;
  subjectName: string;
}

/** Curriculum target resolved from `curriculum_lesson_id` (flat-file lookup). */
export interface PdfCurriculumContext {
  dailyLO: string;
  /** Focus area = the curriculum's linguistic skill (e.g. "Reading"). */
  focusArea: string;
  theme: string;
  /**
   * The previous lesson's daily outcome (the curriculum slot immediately before
   * this plan's). Rendered as a cream "Yesterday's learning outcome" panel above
   * the Recap block, mirroring the editor's Link-it Recap panel. Empty when this
   * is the first lesson of its year.
   */
  previousDailyLO: string;
}

/**
 * A future-facing attachment slot. Nothing populates this today; the documents
 * render it only when present, so the loader can start supplying resources,
 * materials, or a worksheet reference without a component rewrite.
 */
export interface PdfAttachment {
  label: string;
  detail?: string;
}

/**
 * Resolved "Link it together" content: the recap free-text and the chosen
 * cfu / exit_ticket techniques (already resolved to display labels via the
 * activity bank, since the PDF documents don't load it themselves).
 */
export interface PdfLinkIt {
  recap: string;
  cfu: { label: string; note: string }[];
  exitTicket: { label: string; note: string }[];
}

/** Everything one lesson-plan page needs, fully self-contained. */
export interface PlanPdfModel {
  plan: LessonPlan;
  classContext: PdfClassContext;
  curriculum: PdfCurriculumContext | null;
  /** Resolved Link-it content for the recap / cfu / exit_ticket blocks. */
  linkIt?: PdfLinkIt;
  /** Resources/materials attached to the whole plan (reserved; empty today). */
  attachments?: PdfAttachment[];
  /** A worksheet reference for the plan (reserved; absent today). */
  worksheet?: PdfAttachment;
}
