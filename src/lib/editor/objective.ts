// Helpers for the SMARTT objective field. The objective is stored whole in
// `lesson_plans.smartt_objective`, but the editor ENFORCES a fixed opening stem
// and only lets the teacher edit the remainder. These helpers keep the stored
// string and the editable remainder in sync.

/**
 * The enforced opening of every SMARTT objective. This is the canonical, English,
 * locale-invariant value that {@link composeObjective} bakes into the stored
 * string (and {@link stripStem} peels back off). The editor's *displayed* prefix
 * is localised via the `stem` i18n message, whose English value mirrors this.
 */
export const OBJECTIVE_STEM = 'By the end of this session, I will be able to';

/** The six SMARTT criteria, shown as guidance in the pink box. */
export const SMARTT_CRITERIA: { label: string; description: string }[] = [
  { label: 'Specific', description: 'Targets one clear, concrete skill or outcome.' },
  { label: 'Measurable', description: 'Uses a verb you can observe and count (identify, list, read…).' },
  { label: 'Achievable', description: 'Realistic for these students in one 50-minute session.' },
  { label: 'Relevant', description: "Connected to the curriculum outcome and students' level." },
  { label: 'Time-bound', description: 'Bounded by the lesson — e.g. "by the end of this session".' },
  { label: 'Tangible', description: "Relatable to students' real lives." },
];

/**
 * A lenient match for the objective's opening scaffold, used ONLY as a fallback
 * when a stored value doesn't begin with the exact {@link OBJECTIVE_STEM}. It
 * collapses any near-miss lead-in of the family "By the end of <…> be able to"
 * (a reworded opener, a negated "will not be able to", an added comma, a
 * different learner name) back to nothing. Anchored at the start and non-greedy,
 * so it removes only the opener up to the first "be able to" and never eats into
 * genuine remainder text. This is what keeps a paraphrased lead-in from ever
 * resurrecting the doubled-stem bug: the editor/`/view` render exactly one
 * scaffold, never two, whatever shape a legacy stored value has.
 */
const STEM_LEADIN = /^by the end of\b.*?\bbe able to\b/i;

/**
 * Strip the enforced stem (and any leading punctuation/whitespace) from a stored
 * objective, returning just the teacher-editable remainder.
 *
 * Prefers an exact {@link OBJECTIVE_STEM} match; falls back to {@link STEM_LEADIN}
 * so a stored value whose opener merely paraphrases the scaffold still degrades to
 * a stem-free remainder (rendering one scaffold, never two).
 */
export function stripStem(full: string | null | undefined): string {
  if (!full) return '';
  let rest = full.trim();
  // Peel EVERY leading scaffold occurrence — an exact stem, else a paraphrased
  // lead-in — looping so even a doubled/tripled stem (a legacy corrupt value)
  // collapses to the real remainder. Each pass removes a non-empty prefix, so
  // `rest` strictly shrinks and the loop terminates.
  for (;;) {
    let next = rest;
    if (next.toLowerCase().startsWith(OBJECTIVE_STEM.toLowerCase())) {
      next = next.slice(OBJECTIVE_STEM.length);
    } else {
      const m = STEM_LEADIN.exec(next);
      if (m) next = next.slice(m[0].length);
    }
    next = next.replace(/^[\s.,:;-]+/, '');
    if (next === rest) break;
    rest = next;
  }
  return rest.trim();
}

/**
 * Compose the full objective string to persist from the editable remainder.
 * Returns an empty string when the teacher has written nothing yet, so an
 * "objective is empty" check is simply `composeObjective(r) === ''`.
 */
export function composeObjective(remainder: string): string {
  // Strip any stem the remainder already carries before re-prepending, so a paste
  // of Aya's full stem-prefixed rewrite into the (emptied) field can't produce a
  // doubled stem in the composed value. `stripStem` trims and loops, so a doubled
  // or tripled paste collapses to a single stem; empty input still yields ''.
  const r = stripStem(remainder);
  return r ? `${OBJECTIVE_STEM} ${r}` : '';
}

/** True when the stored objective has real content beyond the stem. */
export function hasObjectiveContent(full: string | null | undefined): boolean {
  return stripStem(full).length > 0;
}
