import 'server-only';
import type { AiContextTool } from '@/types/ai-context';
import { OBJECTIVE_STEM } from '@/lib/editor/objective';
import { IMAGE_FLOOR } from '@/lib/ai/image-floor';

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
 * Worksheet-builder floor. The output contract + the body markers the worksheet
 * renderer and downstream image generation parse + the image-brief contract + the
 * safeguarding red lines + the content-language guard. The per-route response
 * schema (declared in that route's `output_config`) is deliberately NOT restated
 * here.
 *
 * The IMAGE BRIEFS section is the SINGLE source of the brief-content contract: a
 * brief is the sole input to the image dedupe hash, so a brief carrying lesson
 * context is unique by construction and drops the cache-hit rate to zero. That
 * consequence is mechanical and non-obvious, so the rule lives here (in code, one
 * copy) rather than in the route prompt or an uploaded document.
 */
export const WORKSHEET_BUILDER_FLOOR = `${OVERRIDE_LINE}

OUTPUT CONTRACT:
- Return ONLY the JSON object the request schema defines. No preamble, no explanation, no markdown fence around it.
- Never add fields. Never omit a required field — if you cannot produce a value return an empty string or an empty array, never null and never a placeholder such as "TODO" or "N/A".

EXERCISE COVERAGE:
- The teacher's lesson blocks are the ONLY source of exercises. Each student-facing block the teacher wrote becomes exactly one exercise, in block order; a "Teacher does" activity counts only when the student needs the artefact printed in front of them.
- Never merge two blocks into one exercise, and never split one block into several. Two blocks of the same kind — say two Independent practice activities — are two exercises.
- A block that needs nothing printed yields no exercise: an oral drill or a Think–Pair–Share produces nothing on paper. Never invent an exercise to pad the count, and never drop or merge blocks to shrink it.
- Curriculum context — theme, vocabulary, grammar, outcomes — shapes how an exercise is written. It never adds one.

BODY MARKERS (the renderer parses these literally):
- A blank for a student to fill is a run of underscores: ______ . Never a dotted line, never [blank], never a box character.
- An image is [Picture: short literal description] alone on its line. Never an emoji in place of a picture. Never describe an image in prose instead of using the marker.
- Permitted markdown: headings, ordered lists, unordered lists, bold, italic.
- Forbidden: tables, horizontal rules (---), code fences, HTML, emoji.

IMAGE BRIEFS
Each image_slots[] brief describes only what appears in the picture. Exercise context shapes what you choose to depict; it never appears in the words. Write "a single brown-and-white cow standing side-on, plain background" — not "a cow for the Year 2 counting exercise on farm animals". No year group, no theme, no lesson or task reference, no learning outcome, no mention of the student or the task.
Never emit an empty or whitespace-only brief. If there is nothing worth depicting, write no [Picture: …] marker for it.
Line drawings for print. Plain backgrounds. No text or numerals inside the image. No people where an object will do.

SAFEGUARDING (absolute) — these students are displaced adolescents aged 12-18, most of whom have lived through war and displacement:
- Never write content depicting war, weapons, violence, injury, death, bombing, fleeing, camps or displacement — including as incidental background detail in an example sentence.
- Never ask a student to write or speak about their own family, home, journey, nationality, legal status, or reason for leaving.
- Never include religious, sectarian or political content.
- Never include romantic or sexual content.
- Never assume a student has money, a device, internet access, the ability to travel, a bedroom of their own, or an intact family.

LANGUAGE OF THE WORKSHEET:
- Write the worksheet in the language of the SUBJECT being taught, as indicated by the curriculum context (subject, outcomes, grammar/vocabulary, theme) in the user message. For example, an English-subject worksheet must be written in English even though the students' first language is Arabic.
- The teacher's app/interface language is irrelevant here and is not provided — never infer the worksheet language from it. When the subject's language is genuinely unclear from the context, default to English.`;

/**
 * SMARTT objective-checker floor (base, locale-independent). The canonical
 * six-letter anchor, the fixed stem, and the JSON output contract — the shape the
 * editor + pills depend on, enforced hard by `RESPONSE_SCHEMA` and pinned here in
 * prose so no uploaded layer can redefine a letter or drop the stem.
 */
const SMARTT_CHECKER_FLOOR_BASE = `${OVERRIDE_LINE}

SMARTT is the fixed anchor — judge the objective against all six letters: Specific, Measurable, Achievable, Relevant, Time-bound, and Tangible (Alsama's distinctive final letter: relatable to students' real lives — concrete and meaningful in the students' own world, not just an abstract academic skill).

The objective — and your suggested rewrite — must use the exact stem "${OBJECTIVE_STEM}" followed by an observable, student-facing action.

Return ONLY a JSON object: for each of the six letters a status ("strong" or "needs work") and a single one-line note; and an improved_objective rewrite that keeps the stem. No code fences, no preamble, no prose outside the JSON.`;

/**
 * Language directive appended to the SMARTT floor ONLY when the SUBJECT's content
 * language is Arabic. Feedback language follows the subject being planned — not
 * the teacher's UI locale — so an Arabic-medium subject gets Arabic feedback even
 * for an English-UI teacher, and an English subject gets English feedback for an
 * Arabic-UI teacher. This is the same content-language rule the resource generator
 * and worksheet already follow. It switches only the human-readable feedback text;
 * the JSON keys, the status enum, and the English stem are untouched, so the
 * `ObjectiveCheckResult` shape is identical either way.
 *
 * The directive text itself is unchanged from when it was UI-locale-gated — only
 * the condition that appends it (see {@link smarttCheckerFloor}) now reads the
 * subject's `content_language`.
 */
const SMARTT_ARABIC_DIRECTIVE = `LANGUAGE: The teacher reads this feedback in Arabic. Write the human-readable feedback text — every "note" (the per-letter notes) — in Modern Standard Arabic (الفصحى).
Do NOT translate or alter the JSON contract: keep all JSON keys in English, keep each "status" value as the exact English literal "strong" or "needs work". The "improved_objective" MUST still begin with the exact stem "${OBJECTIVE_STEM}" — leave the stem in English, unchanged.`;

/**
 * The SMARTT checker floor, with the Arabic directive appended when
 * `contentLanguage` is `'ar'` (the SUBJECT's content language, resolved at the
 * route from `subjects.content_language` — never the UI locale).
 */
export function smarttCheckerFloor(contentLanguage: string): string {
  return contentLanguage === 'ar'
    ? `${SMARTT_CHECKER_FLOOR_BASE}\n\n${SMARTT_ARABIC_DIRECTIVE}`
    : SMARTT_CHECKER_FLOOR_BASE;
}

/**
 * The floor for a given tool. `contentLanguage` is only consulted for
 * `smartt_checker` (its feedback language follows the subject's content
 * language); it is ignored for every other tool.
 *
 * `worksheet_image` returns the image floor (single-sourced from
 * `@/lib/ai/image-floor`), so `composeContextStack` appends it last as the
 * highest-authority section. `contentLanguage` is not consulted for it.
 */
export function floorForTool(tool: AiContextTool, contentLanguage: string): string {
  switch (tool) {
    case 'resource_generator':
      return RESOURCE_GENERATOR_FLOOR;
    case 'smartt_checker':
      return smarttCheckerFloor(contentLanguage);
    case 'worksheet_image':
      return IMAGE_FLOOR;
    case 'worksheet_builder':
      return WORKSHEET_BUILDER_FLOOR;
  }
}
