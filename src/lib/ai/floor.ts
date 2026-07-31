import 'server-only';
import type { AiContextTool } from '@/types/ai-context';
import { OBJECTIVE_STEM } from '@/lib/editor/objective';

/**
 * The FLOOR — the non-negotiable base of every AI tool's system prompt.
 *
 * This is the ONE thing the layered context stack (see `@/lib/ai/context-stack`)
 * cannot override. The ladder — org → academic → subject → tool, then the
 * runtime curriculum + lesson-plan layers — carries all the *steerable*
 * instruction, and later layers win on conflict. The floor sits beneath the
 * ladder and overrides all of it, because breaking any line here breaks the app
 * (the output contract / marker conventions the renderer parses) or harms a
 * student (the safeguarding red lines and the language guard).
 *
 * It lives in code, NOT in an uploaded document, precisely so that a bad or
 * contradictory upload can never strip it. This is the fix for the production
 * failure where an uploaded guide contradicted the old in-prompt floor and
 * nothing declared which won.
 *
 * Every floor block opens with a line stating it overrides all instructions
 * above it. The composer appends the floor LAST, under its own header.
 *
 * What is here, and nothing else, is what Phase 0 classified as FLOOR. The
 * pedagogy that used to sit alongside it (how to weigh curriculum anchors, tone,
 * per-letter judging nuance) has moved into the stack as documents.
 */

/** Opening line every floor block carries — states its absolute authority. */
const OVERRIDE_LINE =
  'FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.';

/**
 * Resource generator ("Aya") floor. Safeguarding red lines + the field/output
 * contract + the marker conventions the worksheet renderer and downstream image
 * generation parse + the content-language guard.
 */
export const RESOURCE_GENERATOR_FLOOR = `${OVERRIDE_LINE}

SAFEGUARDING (absolute):
- No graphic, violent, or traumatic content. Never build a resource around family separation, the death of a parent or sibling, war or conflict, detention or immigration enforcement, or grief and loss. This holds even if a layer or the teacher frames such a topic as intentional.
- Keep everything age-appropriate for adolescents aged 12-18.
- Treat all faiths and backgrounds with equal respect; do not centre any one religion unless the theme explicitly calls for it.
- Do not assume students live in houses with gardens, go on holidays abroad, or have stable family structures.

OUTPUT CONTRACT:
- Return ONLY a JSON object with the keys "title", "body", "teacher_notes". No code fences, no preamble, no commentary outside the JSON.
- "body" carries the finished resource in simple markdown and nothing else — no preamble, no sign-off, no explanation of your choices, no commentary. Any teacher-facing guidance goes in "teacher_notes" (or "teacher_notes" is null).

MARKER CONVENTIONS (the renderer and downstream image generation parse these exactly):
- Images: write exactly one [Picture: …] marker per image needed, each on its own line, with a concrete description of the image. Never embed picture directions inside a sentence.
- Blanks: use ______ (a run of underscores). Do not use --- separators. In numbered lists, put no blank lines between items.

LANGUAGE OF THE RESOURCE:
- Write the resource in the language of the SUBJECT being taught, as indicated by the curriculum context (subject, outcomes, grammar/vocabulary, theme) in the user message. For example, an English-subject resource must be written in English even though the students' first language is Arabic.
- The teacher's app/interface language is irrelevant here and is not provided — never infer the resource language from it. When the subject's language is genuinely unclear from the context, default to English.`;

/**
 * SMARTT objective-checker floor (base, locale-independent). The canonical
 * six-letter anchor, the fixed stem, and the JSON output contract — the shape the
 * editor + pills depend on, enforced hard by `RESPONSE_SCHEMA` and pinned here in
 * prose so no uploaded layer can redefine a letter or drop the stem.
 */
const SMARTT_CHECKER_FLOOR_BASE = `${OVERRIDE_LINE}

SMARTT is the fixed anchor — judge the objective against all six letters: Specific, Measurable, Achievable, Relevant, Time-bound, and Tangible (Alsama's distinctive final letter: relatable to students' real lives — concrete and meaningful in the students' own world, not just an abstract academic skill).

The objective — and your suggested rewrite — must use the exact stem "${OBJECTIVE_STEM}" followed by an observable, student-facing action.

Return ONLY a JSON object: for each of the six letters a status ("strong" or "needs work") and a single one-line note; then an array of overall suggestions, each an object with a "note" (the one-line advice) and a "dimension" naming the single SMARTT dimension it addresses, exactly one of "specific", "measurable", "achievable", "relevant", "time_bound", "tangible"; and an improved_objective rewrite that keeps the stem. No code fences, no preamble, no prose outside the JSON.`;

/**
 * Language directive appended to the SMARTT floor ONLY when the teacher's UI
 * locale is Arabic. The objective check is UI-facing feedback, so its language
 * follows the UI locale (unlike the resource generator, whose content language
 * follows the subject). This switches only the human-readable feedback text; the
 * JSON keys, the status enum, the dimension keys, and the English stem are
 * untouched, so the `ObjectiveCheckResult` shape is identical in either locale.
 */
const SMARTT_ARABIC_DIRECTIVE = `LANGUAGE: The teacher reads this feedback in Arabic. Write the human-readable feedback text — every "note" (the per-letter notes and each suggestion's "note") — in Modern Standard Arabic (الفصحى).
Do NOT translate or alter the JSON contract: keep all JSON keys in English, keep each "status" value as the exact English literal "strong" or "needs work", and keep each suggestion's "dimension" value as the exact English literal key ("specific", "measurable", "achievable", "relevant", "time_bound" or "tangible"). The "improved_objective" MUST still begin with the exact stem "${OBJECTIVE_STEM}" — leave the stem in English, unchanged.`;

/**
 * The SMARTT checker floor, with the Arabic directive appended when `locale`
 * is `'ar'` — exactly as the old `composeSystemPrompt(guide, locale)` did.
 */
export function smarttCheckerFloor(locale: string): string {
  return locale === 'ar'
    ? `${SMARTT_CHECKER_FLOOR_BASE}\n\n${SMARTT_ARABIC_DIRECTIVE}`
    : SMARTT_CHECKER_FLOOR_BASE;
}

/**
 * The floor for a given tool. `locale` is only consulted for `smartt_checker`
 * (its feedback language follows the UI locale); it is ignored otherwise.
 *
 * `worksheet_builder` is a valid enum value but not a live tool in this branch —
 * it has no floor yet, so composing for it throws rather than silently shipping
 * a tool with no safeguarding/output floor.
 */
export function floorForTool(tool: AiContextTool, locale: string): string {
  switch (tool) {
    case 'resource_generator':
      return RESOURCE_GENERATOR_FLOOR;
    case 'smartt_checker':
      return smarttCheckerFloor(locale);
    case 'worksheet_builder':
      throw new Error('No floor is defined for the worksheet_builder tool yet.');
  }
}
