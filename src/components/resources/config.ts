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

// ── auto-attribution helpers ─────────────────────────────────────────────────
// Format is a `format`-dimension tag (labels seeded in 0008_resource_bank.sql:
// PDF · Word doc · Image · Link · Audio · Video · Worksheet). The upload modal no
// longer asks the teacher to pick it — it derives the label from the uploaded
// file's extension (or a pasted link) and attaches the matching tag on save.

/** File extension → the canonical `format` tag label it maps to. */
const EXT_TO_FORMAT: Record<string, string> = {
  pdf: 'PDF',
  doc: 'Word doc',
  docx: 'Word doc',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  gif: 'Image',
  webp: 'Image',
  svg: 'Image',
  bmp: 'Image',
  heic: 'Image',
  mp3: 'Audio',
  wav: 'Audio',
  m4a: 'Audio',
  aac: 'Audio',
  ogg: 'Audio',
  flac: 'Audio',
  mp4: 'Video',
  mov: 'Video',
  avi: 'Video',
  webm: 'Video',
  mkv: 'Video',
  m4v: 'Video',
};

/** The `format` tag label for an uploaded file, or null when the extension is unknown. */
export function formatLabelForFileName(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_FORMAT[ext] ?? null;
}

/**
 * The `format` tag label for a pasted link: a recognised file extension in the
 * URL path wins (a direct `.pdf`/`.mp4` link), otherwise it's a plain `Link`.
 */
export function formatLabelForUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return EXT_TO_FORMAT[ext] ?? 'Link';
  } catch {
    return 'Link';
  }
}

/**
 * Turn an uploaded file's name into a clean, editable Title: drop the extension,
 * strip a leading index prefix + separator (e.g. `05_`), turn `_`/`-` into
 * spaces, collapse whitespace and Title-Case each word.
 * `05_How_We_Care_For_Our_Bodies.pdf` → `How We Care For Our Bodies`.
 */
export function cleanFileNameToTitle(fileName: string): string {
  const noExt = fileName.replace(/\.[^./\\]+$/, '');
  const noIndex = noExt.replace(/^\s*\d{1,3}\s*[-_.)\]]+\s*/, '');
  const spaced = noIndex.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const titled = spaced.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  // Guard: if stripping left nothing (e.g. "05_.pdf"), fall back to the raw stem.
  return titled || noExt.trim();
}
