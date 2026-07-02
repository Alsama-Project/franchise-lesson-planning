// Presentation tokens + view-model derivation for resource cards. The colours
// here come straight from the design handoff's "Format badges" / "Skill chips"
// token lists. They are data-driven (a resource's format/skill is a tag value),
// so they live as plain maps consumed via inline styles rather than Tailwind
// utilities.

import type { ResourceTag, ResourceWithTags, TagDimension } from '@/types/resource';

export interface Swatch {
  /** Foreground / text colour. */
  c: string;
  /** Background tint. */
  bg: string;
}

/** Format badge colours + the short label shown on the thumbnail. */
interface FormatStyle extends Swatch {
  /** Short uppercase label for the thumbnail (e.g. "DOC", "IMG"). */
  short: string;
}

const FORMAT_STYLES: Record<string, FormatStyle> = {
  PDF: { c: '#B62A5C', bg: '#FBEFF3', short: 'PDF' },
  'Word doc': { c: '#1F7A6C', bg: '#E4F0ED', short: 'DOC' },
  Image: { c: '#B0651E', bg: '#F6ECDA', short: 'IMG' },
  Link: { c: '#2E7D5B', bg: '#E2F0E8', short: 'LINK' },
  Audio: { c: '#6A5AA0', bg: '#EEEAF6', short: 'AUDIO' },
  Video: { c: '#C2553F', bg: '#FBEAE5', short: 'VIDEO' },
  Worksheet: { c: '#7A6E62', bg: '#F1ECE3', short: 'SHEET' },
};

const FORMAT_FALLBACK: FormatStyle = { c: '#7A6E62', bg: '#F1ECE3', short: 'FILE' };

export function formatStyle(label: string | undefined): FormatStyle {
  return (label && FORMAT_STYLES[label]) || FORMAT_FALLBACK;
}

const SKILL_STYLES: Record<string, Swatch> = {
  Reading: { c: '#186155', bg: '#E4F0ED' },
  Writing: { c: '#7A6E62', bg: '#F1ECE3' },
  Listening: { c: '#B0651E', bg: '#F6ECDA' },
  Speaking: { c: '#B62A5C', bg: '#FBEFF3' },
  'Basic Literacy': { c: '#6A5AA0', bg: '#EEEAF6' },
};

const SKILL_FALLBACK: Swatch = { c: '#186155', bg: '#E4F0ED' };
const THEME_SWATCH: Swatch = { c: '#B62A5C', bg: '#FBEFF3' };
const EXERCISE_SWATCH: Swatch = { c: '#5C544E', bg: '#F3ECE2' };
const GRAMMAR_SWATCH: Swatch = { c: '#6A5AA0', bg: '#EEEAF6' };

/** Number of days within which a resource still shows the NEW badge. */
const NEW_WINDOW_DAYS = 7;

/**
 * The NEW badge is purely time-based: it shows only while a resource's
 * `created_at` is within the last {@link NEW_WINDOW_DAYS} days, evaluated against
 * the current date at render time — so it ages off on its own, with no persisted
 * flag and no cron.
 */
export function isNewResource(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays < NEW_WINDOW_DAYS;
}

/** First tag in a dimension (resources usually carry one per dimension). */
function firstTag(tags: ResourceTag[], dimension: TagDimension): ResourceTag | undefined {
  return tags.find((t) => t.dimension === dimension);
}

export interface Chip {
  label: string;
  c: string;
  bg: string;
}

export interface ResourceView {
  formatLabel: string | undefined;
  formatShort: string;
  fmtColor: string;
  fmtBg: string;
  /** The tinted chips shown on the card (skill · theme · exercise · grammar). */
  chips: Chip[];
  /** "Year N · stage · localisation" meta line (only the parts that exist). */
  meta: string;
  skill?: string;
  theme?: string;
  exercise?: string;
  stage?: string;
  localisation?: string;
  grammar?: string;
  isNew: boolean;
}

/** Derive everything a card/preview needs from a resource and its tags. */
export function resourceView(r: ResourceWithTags): ResourceView {
  const format = firstTag(r.tags, 'format')?.label;
  const skill = firstTag(r.tags, 'skill_type')?.label;
  const theme = firstTag(r.tags, 'theme')?.label;
  const exercise = firstTag(r.tags, 'exercise_type')?.label;
  const stage = firstTag(r.tags, 'lesson_stage')?.label;
  const localisation = firstTag(r.tags, 'localisation')?.label;
  const grammar = firstTag(r.tags, 'grammar_content')?.label;

  const fmt = formatStyle(format);

  const chips: Chip[] = [];
  if (skill) chips.push({ label: skill, ...(SKILL_STYLES[skill] ?? SKILL_FALLBACK) });
  if (theme) chips.push({ label: theme, ...THEME_SWATCH });
  if (exercise) chips.push({ label: exercise, ...EXERCISE_SWATCH });
  if (grammar) chips.push({ label: `Grammar · ${grammar}`, ...GRAMMAR_SWATCH });

  const metaParts = [
    r.year != null ? `Year ${r.year}` : null,
    stage ?? null,
    localisation ?? null,
  ].filter(Boolean);

  return {
    formatLabel: format,
    formatShort: fmt.short,
    fmtColor: fmt.c,
    fmtBg: fmt.bg,
    chips,
    meta: metaParts.join(' · '),
    skill,
    theme,
    exercise,
    stage,
    localisation,
    grammar,
    isNew: isNewResource(r.created_at),
  };
}

/** Up-to-two-letter initials for an id/name (used only where a name exists). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
