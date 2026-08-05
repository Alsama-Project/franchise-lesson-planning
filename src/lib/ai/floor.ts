import 'server-only';
import type { AiContextTool } from '@/types/ai-context';
import { OBJECTIVE_STEM } from '@/lib/editor/objective';
import { IMAGE_OUTPUT_CONTRACT } from '@/lib/ai/image-floor';

/**
 * The FLOOR — the non-negotiable base of every AI tool's system prompt.
 *
 * The floor carries ONLY the machine response contract, per tool — the JSON shape
 * a validator/parser depends on, and (for the worksheet builder) the `[Picture: …]`
 * marker rule three sites regex-parse. Everything that was house style, pedagogy,
 * language guidance, exercise coverage, image briefs, or safeguarding has moved OUT
 * of code into Connie's uploaded context docs (layers 1-4). Code no longer carries
 * safeguarding at all; the composer FAILS CLOSED when the stack is empty or errors,
 * rather than composing a partial prompt (see `@/lib/ai/context-stack`).
 *
 * The shared precedence line ("FLOOR — this overrides every instruction above
 * it…") no longer lives here: it was duplicated at the head of three floor strings,
 * so it now lives ONCE in the composer (`FLOOR_PRECEDENCE_LINE` in
 * `@/lib/ai/context-stack`), which emits it as part of the floor section header.
 * The floor strings below are therefore the contract text alone. `worksheet_image`
 * is the one exception: it carries its own differently-worded "IMAGE FLOOR —" line
 * (`IMAGE_OUTPUT_CONTRACT`) and has no machine contract, so the composer does not
 * prepend the shared line for it and its composed floor is unchanged.
 *
 * `smartt_checker`'s floor now separates CONTRACT from PEDAGOGY. The contract stays
 * in code — the six letter names (they map to the schema keys and the streaming
 * scanner), the JSON shape + `strong`/`needs work` enum + `note` + `improved_objective`,
 * and the fixed stem (a genuine code dependency: `@/lib/editor/objective` compares
 * against `OBJECTIVE_STEM`). The pedagogy — the Tangible gloss, "an observable,
 * student-facing action", and "single one-line" — has been extracted to
 * `docs/context-doc-handback/smartt_checker.md` for Kadria to fold into the
 * objective checker's layer-4 doc.
 */

// ── resource_generator ────────────────────────────────────────────────────────

/** Resource generator ("Aya") response contract: the JSON shape the route's
 *  `RESPONSE_SCHEMA` + `isGenerateResourceResult` guard enforce. Marker
 *  conventions, blanks and the language guidance have moved to Connie's doc. */
const RESOURCE_GENERATOR_CONTRACT = `OUTPUT CONTRACT:
- Return ONLY a JSON object with the keys "title", "body", "teacher_notes". No code fences, no preamble, no commentary outside the JSON.
- "body" carries the finished resource in simple markdown and nothing else — no preamble, no sign-off, no explanation of your choices, no commentary. Any teacher-facing guidance goes in "teacher_notes" (or "teacher_notes" is null).`;

// ── worksheet_builder ─────────────────────────────────────────────────────────

/** Worksheet builder response contract: the JSON shape (per-route schema) plus the
 *  ONE marker rule that is machine-parsed — `[Picture: …]` alone on its own line,
 *  regex-read at exercise/route.ts:67, worksheet-compile.ts, and ExerciseBody.tsx.
 *  The `never null` clause is dropped: `resource_id` and `template_anchor` are
 *  required-and-nullable in the plan schema and the prompt itself instructs null.
 *  Exercise coverage, blanks, the permitted/forbidden markdown list, image briefs
 *  and the language guidance have moved to Connie's doc. */
const WORKSHEET_BUILDER_CONTRACT = `OUTPUT CONTRACT:
- Return ONLY the JSON object the request schema defines. No preamble, no explanation, no markdown fence around it.
- Never add fields. Never omit a required field — if you cannot produce a value return an empty string or an empty array, never a placeholder such as "TODO" or "N/A".

BODY MARKERS (the renderer parses these literally):
- An image is [Picture: short literal description] alone on its line. Never an emoji in place of a picture. Never describe an image in prose instead of using the marker.

IMAGE SLOTS (one "image_slots" entry per [Picture: …] marker, in the order the markers appear):
- Each entry has two fields, "subject" and "brief".
- "subject" is a deduplication key, NOT art direction: the plain literal thing depicted, 1-4 words, lowercase, no styling, no mood, no colour, no count, no scene detail — e.g. "a bus", "a busy street scene". The SAME thing must always yield the SAME subject regardless of year group, wording, or the exercise around it. This field is machine-hashed to reuse an image already generated for that subject; varying it needlessly forces a fresh generation and wastes the shared image bank.
- "brief" is the full visual description of what to draw. Write it as richly as you like — it does not affect deduplication.`;

// ── smartt_checker (UNTOUCHED — do not edit on this branch) ─────────────────────

/**
 * SMARTT objective-checker floor (base, locale-independent) — the CONTRACT only.
 * The canonical six-letter anchor, the fixed stem, and the JSON output contract:
 * the shape the editor + pills depend on, enforced hard by `RESPONSE_SCHEMA` and
 * pinned here in prose so no uploaded layer can redefine a letter or drop the stem.
 *
 * The pedagogy that was interleaved with this contract has been extracted to
 * `docs/context-doc-handback/smartt_checker.md` (the Tangible gloss, "an observable,
 * student-facing action", and "single one-line"), and the remaining contract
 * sentences were rewritten to read cleanly without it. The stem deliberately STAYS
 * in code: `@/lib/editor/objective` compares stored objectives against
 * `OBJECTIVE_STEM`, so the prompt text and that constant must agree — it is a code
 * dependency, not pedagogy.
 *
 * This tool has NO safeguarding block — preserve that exactly (do not seed or
 * compose one for it). The shared precedence line is emitted by the composer, not
 * here (see the module note above).
 */
const SMARTT_CHECKER_FLOOR_BASE = `SMARTT is the fixed anchor — judge the objective against all six letters: Specific, Measurable, Achievable, Relevant, Time-bound, and Tangible.

The objective — and your suggested rewrite — must use the exact stem "${OBJECTIVE_STEM}".

Return ONLY a JSON object: for each of the six letters a status ("strong" or "needs work") and a note; and an improved_objective rewrite that keeps the stem. No code fences, no preamble, no prose outside the JSON.`;

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
 * The code FLOOR per tool — the machine response contract, and nothing else. The
 * shared precedence line is no longer part of these strings: the composer emits it
 * once as the floor section header (see `@/lib/ai/context-stack`). `worksheet_image`
 * has no response contract; its entry is just its own precedence line
 * (`IMAGE_OUTPUT_CONTRACT`, unchanged). `smartt_checker` is its full
 * (locale-independent) floor, contract only.
 */
export const OUTPUT_CONTRACT: Record<AiContextTool, string> = {
  resource_generator: RESOURCE_GENERATOR_CONTRACT,
  worksheet_builder: WORKSHEET_BUILDER_CONTRACT,
  smartt_checker: SMARTT_CHECKER_FLOOR_BASE,
  worksheet_image: IMAGE_OUTPUT_CONTRACT,
};

/**
 * The floor for a given tool: its response contract from {@link OUTPUT_CONTRACT},
 * except `smartt_checker`, whose feedback language follows the SUBJECT's
 * `content_language` (resolved at the route — never the UI locale). `contentLanguage`
 * is ignored for every other tool. The composer appends the result LAST.
 */
export function floorForTool(tool: AiContextTool, contentLanguage: string): string {
  return tool === 'smartt_checker' ? smarttCheckerFloor(contentLanguage) : OUTPUT_CONTRACT[tool];
}
