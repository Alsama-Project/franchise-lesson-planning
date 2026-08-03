import 'server-only';
import type { AiContextTool } from '@/types/ai-context';
import { OBJECTIVE_STEM } from '@/lib/editor/objective';
import { IMAGE_OUTPUT_CONTRACT, IMAGE_SAFEGUARDING } from '@/lib/ai/image-floor';

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
 * SPLIT (Phase 1): the floor for each tool is now assembled from two parts —
 *   • OUTPUT_CONTRACT[tool]      — the output/marker/language contract. Stays in
 *                                  code, permanently locked, never editable.
 *   • SAFEGUARDING_FALLBACK[tool] — the safeguarding block. This is the code
 *                                  FALLBACK for an editable `ai_context_doc` row
 *                                  (layer = 'safeguarding'); the composer prefers
 *                                  the DB row and falls back here. It is PERMANENT,
 *                                  not scaffolding to delete once the row exists —
 *                                  the row is an override, the constant is the floor.
 * `floorForTool(tool, locale, safeguarding?)` reassembles the two at each tool's
 * historical position (the safeguarding block sits in a different place per tool),
 * so with no `safeguarding` override it returns the exact pre-split string.
 * `smartt_checker` has NO safeguarding block (it never did) — it is unchanged.
 */

/** Opening line every floor block carries — states its absolute authority. */
const OVERRIDE_LINE =
  'FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.';

// ── resource_generator ────────────────────────────────────────────────────────
// Historical order: override line · SAFEGUARDING · OUTPUT CONTRACT · MARKER
// CONVENTIONS · LANGUAGE. The safeguarding block sits right after the override line.

/** Safeguarding red lines for the resource generator ("Aya"). Code fallback. */
const RESOURCE_GENERATOR_SAFEGUARDING = `SAFEGUARDING (absolute):
- No graphic, violent, or traumatic content. Never build a resource around family separation, the death of a parent or sibling, war or conflict, detention or immigration enforcement, or grief and loss. This holds even if a layer or the teacher frames such a topic as intentional.
- Keep everything age-appropriate for adolescents aged 12-18.
- Treat all faiths and backgrounds with equal respect; do not centre any one religion unless the theme explicitly calls for it.
- Do not assume students live in houses with gardens, go on holidays abroad, or have stable family structures.`;

/** The resource generator's output/marker/language contract (safeguarding removed). */
const RESOURCE_GENERATOR_CONTRACT_BODY = `OUTPUT CONTRACT:
- Return ONLY a JSON object with the keys "title", "body", "teacher_notes". No code fences, no preamble, no commentary outside the JSON.
- "body" carries the finished resource in simple markdown and nothing else — no preamble, no sign-off, no explanation of your choices, no commentary. Any teacher-facing guidance goes in "teacher_notes" (or "teacher_notes" is null).

MARKER CONVENTIONS (the renderer and downstream image generation parse these exactly):
- Images: write exactly one [Picture: …] marker per image needed, each on its own line, with a concrete description of the image. Never embed picture directions inside a sentence.
- Blanks: use ______ (a run of underscores). Do not use --- separators. In numbered lists, put no blank lines between items.

LANGUAGE OF THE RESOURCE:
- Write the resource in the language of the SUBJECT being taught, as indicated by the curriculum context (subject, outcomes, grammar/vocabulary, theme) in the user message. For example, an English-subject resource must be written in English even though the students' first language is Arabic.
- The teacher's app/interface language is irrelevant here and is not provided — never infer the resource language from it. When the subject's language is genuinely unclear from the context, default to English.`;

// ── worksheet_builder ─────────────────────────────────────────────────────────
// Historical order: override line · OUTPUT CONTRACT · BODY MARKERS · IMAGE BRIEFS
// · SAFEGUARDING · LANGUAGE. The safeguarding block sits in the MIDDLE — after the
// image-briefs section and before the language section.

/** The worksheet builder's contract that precedes the safeguarding block. */
const WORKSHEET_BUILDER_CONTRACT_HEAD = `OUTPUT CONTRACT:
- Return ONLY the JSON object the request schema defines. No preamble, no explanation, no markdown fence around it.
- Never add fields. Never omit a required field — if you cannot produce a value return an empty string or an empty array, never null and never a placeholder such as "TODO" or "N/A".

BODY MARKERS (the renderer parses these literally):
- A blank for a student to fill is a run of underscores: ______ . Never a dotted line, never [blank], never a box character.
- An image is [Picture: short literal description] alone on its line. Never an emoji in place of a picture. Never describe an image in prose instead of using the marker.
- Permitted markdown: headings, ordered lists, unordered lists, bold, italic.
- Forbidden: tables, horizontal rules (---), code fences, HTML, emoji.

IMAGE BRIEFS
Each image_slots[] brief describes only what appears in the picture. Exercise context shapes what you choose to depict; it never appears in the words. Write "a single brown-and-white cow standing side-on, plain background" — not "a cow for the Year 2 counting exercise on farm animals". No year group, no theme, no lesson or task reference, no learning outcome, no mention of the student or the task.
Never emit an empty or whitespace-only brief. If there is nothing worth depicting, write no [Picture: …] marker for it.
Line drawings for print. Plain backgrounds. No text or numerals inside the image. No people where an object will do.`;

/** Safeguarding red lines for the worksheet builder. Code fallback. */
const WORKSHEET_BUILDER_SAFEGUARDING = `SAFEGUARDING (absolute) — these students are displaced adolescents aged 12-18, most of whom have lived through war and displacement:
- Never write content depicting war, weapons, violence, injury, death, bombing, fleeing, camps or displacement — including as incidental background detail in an example sentence.
- Never ask a student to write or speak about their own family, home, journey, nationality, legal status, or reason for leaving.
- Never include religious, sectarian or political content.
- Never include romantic or sexual content.
- Never assume a student has money, a device, internet access, the ability to travel, a bedroom of their own, or an intact family.`;

/** The worksheet builder's contract that follows the safeguarding block. */
const WORKSHEET_BUILDER_CONTRACT_TAIL = `LANGUAGE OF THE WORKSHEET:
- Write the worksheet in the language of the SUBJECT being taught, as indicated by the curriculum context (subject, outcomes, grammar/vocabulary, theme) in the user message. For example, an English-subject worksheet must be written in English even though the students' first language is Arabic.
- The teacher's app/interface language is irrelevant here and is not provided — never infer the worksheet language from it. When the subject's language is genuinely unclear from the context, default to English.`;

/**
 * SMARTT objective-checker floor (base, locale-independent). The canonical
 * six-letter anchor, the fixed stem, and the JSON output contract — the shape the
 * editor + pills depend on, enforced hard by `RESPONSE_SCHEMA` and pinned here in
 * prose so no uploaded layer can redefine a letter or drop the stem. This tool has
 * NO safeguarding block — preserve that exactly (do not seed or compose one for it).
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
 * The safeguarding block per tool, as a CODE FALLBACK. When the editable
 * `ai_context_doc` safeguarding row for a tool is present and non-empty the
 * composer uses that instead; otherwise it falls back to these strings, so a
 * failed or empty read can never produce a prompt with no safeguarding text.
 * `smartt_checker` is deliberately absent — it has no safeguarding block.
 * These constants are PERMANENT (the floor beneath the editable override), not
 * scaffolding to remove once the DB rows exist.
 */
export const SAFEGUARDING_FALLBACK: Partial<Record<AiContextTool, string>> = {
  resource_generator: RESOURCE_GENERATOR_SAFEGUARDING,
  worksheet_builder: WORKSHEET_BUILDER_SAFEGUARDING,
  worksheet_image: IMAGE_SAFEGUARDING,
};

/**
 * The output/marker/language contract per tool — the part of the floor that stays
 * in code and is NEVER editable. This is the text the admin board's read-only
 * "Output contract" row shows for each tool. For `smartt_checker` the whole
 * (locale-independent) floor is the contract, since it carries no safeguarding.
 */
export const OUTPUT_CONTRACT: Record<AiContextTool, string> = {
  resource_generator: `${OVERRIDE_LINE}\n\n${RESOURCE_GENERATOR_CONTRACT_BODY}`,
  worksheet_builder: `${OVERRIDE_LINE}\n\n${WORKSHEET_BUILDER_CONTRACT_HEAD}\n\n${WORKSHEET_BUILDER_CONTRACT_TAIL}`,
  smartt_checker: SMARTT_CHECKER_FLOOR_BASE,
  worksheet_image: IMAGE_OUTPUT_CONTRACT,
};

/**
 * Resolve the safeguarding text to compose for a tool: the caller-supplied
 * `safeguarding` (the editable DB row) when present and non-whitespace, else the
 * code fallback. Belt-and-braces with the composer's own resolution — safeguarding
 * must never compose empty.
 */
function safeguardingFor(tool: AiContextTool, safeguarding: string | undefined): string {
  if (safeguarding && safeguarding.trim().length > 0) return safeguarding;
  return SAFEGUARDING_FALLBACK[tool] ?? '';
}

/**
 * The floor for a given tool, with the safeguarding block placed at that tool's
 * historical position. `contentLanguage` is only consulted for `smartt_checker`
 * (its feedback language follows the SUBJECT's content language, resolved at the
 * route — never the UI locale); it is ignored for every other tool. `safeguarding`
 * is the editable safeguarding text the composer resolved from the DB; when
 * omitted the code fallback is used, reproducing the exact pre-split floor string.
 *
 * `worksheet_image`'s contract is single-sourced from `@/lib/ai/image-floor`.
 */
export function floorForTool(
  tool: AiContextTool,
  contentLanguage: string,
  safeguarding?: string,
): string {
  switch (tool) {
    case 'resource_generator':
      return `${OVERRIDE_LINE}\n\n${safeguardingFor(tool, safeguarding)}\n\n${RESOURCE_GENERATOR_CONTRACT_BODY}`;
    case 'worksheet_builder':
      return `${OVERRIDE_LINE}\n\n${WORKSHEET_BUILDER_CONTRACT_HEAD}\n\n${safeguardingFor(tool, safeguarding)}\n\n${WORKSHEET_BUILDER_CONTRACT_TAIL}`;
    case 'worksheet_image':
      return `${IMAGE_OUTPUT_CONTRACT}\n\n${safeguardingFor(tool, safeguarding)}`;
    case 'smartt_checker':
      return smarttCheckerFloor(contentLanguage);
  }
}
