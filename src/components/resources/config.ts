// Static configuration shared by the Resource Bank's browse facets and upload
// modal: the tag dimensions, their display labels, which adapt to the chosen
// subject ("English-specific"), and which browse facets start collapsed.

import type { TagDimension } from '@/types/resource';

export interface DimensionConfig {
  dimension: TagDimension;
  label: string;
  /** Adapts to the chosen subject (shows the "English" badge in browse). */
  subjectSpecific?: boolean;
  /** Browse facet starts collapsed. */
  defaultCollapsed?: boolean;
}

/** Human label per dimension (used in the upload modal and chips). */
export const DIMENSION_LABEL: Record<TagDimension, string> = {
  skill_type: 'Skill type',
  grammar_content: 'Grammar content',
  theme: 'Theme',
  format: 'Format',
  exercise_type: 'Exercise type',
  lesson_stage: 'Lesson stage',
  localisation: 'Localisation',
};

/** The dimensions that scope to the chosen subject (English first). */
export const SUBJECT_SPECIFIC_DIMENSIONS: TagDimension[] = ['skill_type', 'grammar_content'];

/** Browse-sidebar facet order (Year is handled separately, above these). */
export const BROWSE_FACETS: DimensionConfig[] = [
  { dimension: 'skill_type', label: 'Skill type', subjectSpecific: true },
  { dimension: 'grammar_content', label: 'Grammar content', subjectSpecific: true },
  { dimension: 'theme', label: 'Theme' },
  { dimension: 'format', label: 'Format' },
  { dimension: 'exercise_type', label: 'Exercise type', defaultCollapsed: true },
  { dimension: 'lesson_stage', label: 'Lesson stage', defaultCollapsed: true },
  { dimension: 'localisation', label: 'Localisation', defaultCollapsed: true },
];

/**
 * Upload-modal dimension order. The first group is global; the subject-specific
 * group (skill_type, grammar_content) renders in its own "English-specific"
 * panel once a subject is chosen.
 */
export const UPLOAD_GLOBAL_DIMENSIONS: TagDimension[] = [
  'format',
  'theme',
  'exercise_type',
  'lesson_stage',
  'localisation',
];

/** Years offered across the curriculum (Years 1–3). */
export const YEAR_OPTIONS = [1, 2, 3] as const;
