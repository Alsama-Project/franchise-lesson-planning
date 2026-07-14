// The real lesson/curriculum/class context the worksheet builder needs.
//
// Everything here is sourced from `EditorPlanData` (see @/lib/editor/load-plan)
// and threaded down from `LessonPlanEditor`. The MASTER half drives the locked
// (cream, read-only) page frame; the GENERATE half is the curriculum payload
// for `POST /api/generate-resource`; the IDS half scopes persistence, the bank
// modal, and usage tracking.

import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';

export interface WorksheetContext {
  // ── Master frame (locked, read-only) ──────────────────────────────────────
  /** Subject name from the lesson's subject space (NOT profiles.subject_id). */
  subjectName: string;
  /**
   * The language the SUBJECT's content is taught/produced in, from
   * `subjects.content_language`. Drives the worksheet artifact scaffold language
   * (the A4 preview + print/PDF) — NOT the teacher's UI locale. Defaults to 'en'.
   */
  contentLanguage: WorksheetContentLanguage;
  /** Curriculum year from the class. */
  year: number | null;
  /** Theme from the curriculum lesson. */
  theme: string;
  /** Daily learning outcome from the curriculum lesson (stem-cleaned). */
  dailyOutcome: string;
  /**
   * The teacher-authored SMARTT objective REMAINDER (the stored
   * `lesson_plans.smartt_objective` with its enforced stem peeled off by
   * `stripStem`). This — NOT `dailyOutcome` — is what the worksheet's objective
   * strip renders, re-voiced to first person at the render boundary.
   */
  smarttObjective: string;
  /** Centre name, from the school. */
  centreName: string;
  /** Curriculum lesson code, shown on the footer. */
  lessonCode: string;
  /** Exit-ticket prompt, sourced from the Step 4 exit_ticket block when present. */
  exitTicket: string;

  // ── Generate-with-AI payload (curriculum context) ─────────────────────────
  /** Week-level knowledge objective. */
  weeklyOutcome: string;
  /** Combined monthly learning outcome (curriculum_lesson.monthly_lo). */
  monthlyLo: string;
  /** Combined grammar + vocabulary focus. */
  grammarVocab: string;

  // ── Ids / scoping ─────────────────────────────────────────────────────────
  /** The lesson plan id — for `recordUsage` and (future) image paths. */
  lessonPlanId: string;
  /** The subject id — scopes the resource bank modal. */
  subjectId: string | null;
}
