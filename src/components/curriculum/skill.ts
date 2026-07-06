// Linguistic-skill → colour mapping for the Curriculum browse screen. Client-safe
// (no server imports) so both the server data layer and the client components can
// use `skillKeyOf`. The four macro skills get the categorical colours sampled into
// `--color-skill-*` (globals.css); anything else (grammar terms, "mixed", exam
// rows, blank) falls back to the neutral cream-grey `other`.
//
// Class strings are written out in full literal form so Tailwind's source scan
// detects them (it cannot see dynamically-built class names).

import type { SkillKey } from '@/types/curriculum-browse';

/** Normalise a raw `linguistic_skill` label to a macro-skill key. */
export function skillKeyOf(label: string): SkillKey {
  const s = label.toLowerCase();
  if (s.includes('read')) return 'reading';
  if (s.includes('writ')) return 'writing';
  if (s.includes('listen')) return 'listening';
  if (s.includes('speak')) return 'speaking';
  return 'other';
}

/**
 * Canonicalise a raw `linguistic_skill` label to one of the ~5 REAL skill values
 * (Listening · Reading · Speaking · Writing · Basic Literacy). The source column carries
 * typo/casing variants of these, so the Search Skill facet folds them to a stable label
 * (matched by substring, which absorbs the common misspellings). A value that matches
 * none is returned trimmed as-is rather than dropped, so no real data disappears; a blank
 * yields null. Keep this the single definition both the facet options and the record
 * matching read.
 */
export function canonicalSkill(label: string | null): string | null {
  const raw = (label ?? '').trim();
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('read')) return 'Reading';
  if (s.includes('writ')) return 'Writing';
  if (s.includes('listen')) return 'Listening';
  if (s.includes('speak')) return 'Speaking';
  if (s.includes('liter')) return 'Basic Literacy';
  return raw;
}

/** Coloured text class for the table's Skill column (no fill, as in the design). */
export const SKILL_TEXT: Record<SkillKey, string> = {
  reading: 'text-skill-reading',
  writing: 'text-skill-writing',
  listening: 'text-skill-listening',
  speaking: 'text-skill-speaking',
  other: 'text-skill-other',
};

/** Tinted-pill class (fill + text + border) for the focus card's skill chip. */
export const SKILL_PILL: Record<SkillKey, string> = {
  reading: 'bg-skill-reading-bg text-skill-reading border-skill-reading-border',
  writing: 'bg-skill-writing-bg text-skill-writing border-skill-writing-border',
  listening: 'bg-skill-listening-bg text-skill-listening border-skill-listening-border',
  speaking: 'bg-skill-speaking-bg text-skill-speaking border-skill-speaking-border',
  other: 'bg-skill-other-bg text-skill-other border-skill-other-border',
};
