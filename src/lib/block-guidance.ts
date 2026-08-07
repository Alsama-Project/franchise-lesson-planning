import type { LessonBlockType } from '@/types/lesson';

/**
 * Concise teaching guidance for each lesson block, surfaced behind the "?" on
 * the right-hand block panel of the editor. The fuller "Instructions for the
 * teacher" copy can be expanded in a later slice; this captures the agreed
 * Purpose / Technique / Success content for the editor build.
 */
export interface BlockGuidance {
  /** Why this block exists — what it is for. */
  purpose: string;
  /** Teach Like a Champion (or Alsama) technique(s) to use. Optional. */
  technique?: string;
  /** What success in this block looks like. Optional. */
  success?: string;
}

export const BLOCK_GUIDANCE: Record<LessonBlockType, BlockGuidance> = {
  anthem: {
    purpose: 'Build community, energy and shared identity to start the lesson.',
    technique: 'Threshold, Strong Start, SLANT.',
  },
  warm_up: {
    purpose: 'Activate the body and get students physically ready to learn.',
  },
  cool_down: {
    purpose:
      'Regulate energy and calm the nervous system, transitioning into focused learning (five deep breaths).',
    technique: 'Strong Voice, Wait Time.',
  },
  check_homework: {
    purpose: 'Reinforce prior learning and hold students accountable for homework.',
    technique: 'Least Invasive Intervention; peer-check.',
  },
  recap: {
    purpose: 'Activate prior knowledge from the previous lesson.',
    technique: 'Cold Call, Stretch It.',
    success: 'Students recall the key idea from last lesson before new content begins.',
  },
  new_content: {
    purpose: 'Teach the core lesson objective by modelling, then guiding (I do, then we do).',
    technique: 'Modelling; I do / We do.',
    success: 'Students can attempt the new skill with support.',
  },
  cfu: {
    purpose:
      'Measure whether students grasp the content before moving on — run it throughout the lesson, not just once.',
    success: "You can tell who has and hasn't understood, and adjust.",
  },
  independent_practice: {
    purpose:
      'Students apply the new skill on their own or in groups (you do); keep checking for understanding throughout.',
    technique: 'Radar, Look Forward.',
  },
  group_practice: {
    purpose:
      'Students apply the new skill together in groups (you do); keep checking for understanding throughout.',
    technique: 'Radar, Look Forward.',
  },
  exit_ticket: {
    purpose: 'Measure mastery at the end and prepare for the next lesson.',
    technique: 'Art of the Consequence.',
    success: 'Each student shows what they learned before leaving.',
  },
  homework: {
    purpose: "Consolidate the lesson's learning at home (aim for 30–60 minutes).",
  },
};
