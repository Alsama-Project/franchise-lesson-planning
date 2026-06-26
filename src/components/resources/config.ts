// Static configuration shared by the Resource Bank's browse facets and upload
// modal: the tag dimensions, which adapt to the chosen subject
// ("English-specific"), and which browse facets start collapsed. Display labels
// are localised at the call site via the `resources.dimensions` message group
// (keyed by dimension), so no human-readable label lives here.

import type { TagDimension } from '@/types/resource';

export interface DimensionConfig {
  dimension: TagDimension;
  /** Adapts to the chosen subject (shows the "English" badge in browse). */
  subjectSpecific?: boolean;
  /** Browse facet starts collapsed. */
  defaultCollapsed?: boolean;
  /** Rendered as a row of pill toggles rather than checkbox rows. */
  pills?: boolean;
}

/** The dimensions that scope to the chosen subject (English first). */
export const SUBJECT_SPECIFIC_DIMENSIONS: TagDimension[] = ['skill_type', 'grammar_content'];

/** Browse-sidebar facet order (Year is handled separately, above these). */
export const BROWSE_FACETS: DimensionConfig[] = [
  { dimension: 'skill_type', subjectSpecific: true },
  { dimension: 'grammar_content', subjectSpecific: true, pills: true },
  { dimension: 'theme' },
  { dimension: 'format', pills: true },
  { dimension: 'exercise_type', defaultCollapsed: true },
  { dimension: 'lesson_stage', defaultCollapsed: true },
  { dimension: 'localisation', defaultCollapsed: true },
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
