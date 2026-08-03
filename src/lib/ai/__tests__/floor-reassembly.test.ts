import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  floorForTool,
  smarttCheckerFloor,
  SAFEGUARDING_FALLBACK,
  OUTPUT_CONTRACT,
} from '../floor';

// Phase 1 split the AI FLOOR into a locked OUTPUT-CONTRACT half (code) and an
// editable SAFEGUARDING half (a DB row, with a code fallback). The split MUST be
// behaviour-neutral: with no DB override, and with the seeded override (which
// equals the fallback), the composed floor must be byte-for-byte the pre-split
// string — at the safeguarding block's per-tool position — for every tool, and
// for SMARTT in BOTH content-language modes.
//
// FIXTURES are the pre-split floor strings extracted verbatim from origin/main
// (src/lib/ai/floor.ts + image-floor.ts, before the split). This test imports the
// live floor module (via the test hook that stubs `server-only` and resolves
// `@/`) and asserts equality, so any future fragment edit that would change a
// composed prompt fails loudly instead of silently.

const FIXTURES: Record<string, string> = {
  "resource_generator": "FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.\n\nSAFEGUARDING (absolute):\n- No graphic, violent, or traumatic content. Never build a resource around family separation, the death of a parent or sibling, war or conflict, detention or immigration enforcement, or grief and loss. This holds even if a layer or the teacher frames such a topic as intentional.\n- Keep everything age-appropriate for adolescents aged 12-18.\n- Treat all faiths and backgrounds with equal respect; do not centre any one religion unless the theme explicitly calls for it.\n- Do not assume students live in houses with gardens, go on holidays abroad, or have stable family structures.\n\nOUTPUT CONTRACT:\n- Return ONLY a JSON object with the keys \"title\", \"body\", \"teacher_notes\". No code fences, no preamble, no commentary outside the JSON.\n- \"body\" carries the finished resource in simple markdown and nothing else — no preamble, no sign-off, no explanation of your choices, no commentary. Any teacher-facing guidance goes in \"teacher_notes\" (or \"teacher_notes\" is null).\n\nMARKER CONVENTIONS (the renderer and downstream image generation parse these exactly):\n- Images: write exactly one [Picture: …] marker per image needed, each on its own line, with a concrete description of the image. Never embed picture directions inside a sentence.\n- Blanks: use ______ (a run of underscores). Do not use --- separators. In numbered lists, put no blank lines between items.\n\nLANGUAGE OF THE RESOURCE:\n- Write the resource in the language of the SUBJECT being taught, as indicated by the curriculum context (subject, outcomes, grammar/vocabulary, theme) in the user message. For example, an English-subject resource must be written in English even though the students' first language is Arabic.\n- The teacher's app/interface language is irrelevant here and is not provided — never infer the resource language from it. When the subject's language is genuinely unclear from the context, default to English.",
  "worksheet_builder": "FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.\n\nOUTPUT CONTRACT:\n- Return ONLY the JSON object the request schema defines. No preamble, no explanation, no markdown fence around it.\n- Never add fields. Never omit a required field — if you cannot produce a value return an empty string or an empty array, never null and never a placeholder such as \"TODO\" or \"N/A\".\n\nEXERCISE COVERAGE:\n- The teacher's lesson blocks are the ONLY source of exercises. Each student-facing block the teacher wrote becomes exactly one exercise, in block order; a \"Teacher does\" activity counts only when the student needs the artefact printed in front of them.\n- Never merge two blocks into one exercise, and never split one block into several. Two blocks of the same kind — say two Independent practice activities — are two exercises.\n- A block that needs nothing printed yields no exercise: an oral drill or a Think–Pair–Share produces nothing on paper. Never invent an exercise to pad the count, and never drop or merge blocks to shrink it.\n- Curriculum context — theme, vocabulary, grammar, outcomes — shapes how an exercise is written. It never adds one.\n\nBODY MARKERS (the renderer parses these literally):\n- A blank for a student to fill is a run of underscores: ______ . Never a dotted line, never [blank], never a box character.\n- An image is [Picture: short literal description] alone on its line. Never an emoji in place of a picture. Never describe an image in prose instead of using the marker.\n- Permitted markdown: headings, ordered lists, unordered lists, bold, italic.\n- Forbidden: tables, horizontal rules (---), code fences, HTML, emoji.\n\nIMAGE BRIEFS\nEach image_slots[] brief describes only what appears in the picture. Exercise context shapes what you choose to depict; it never appears in the words. Write \"a single brown-and-white cow standing side-on, plain background\" — not \"a cow for the Year 2 counting exercise on farm animals\". No year group, no theme, no lesson or task reference, no learning outcome, no mention of the student or the task.\nNever emit an empty or whitespace-only brief. If there is nothing worth depicting, write no [Picture: …] marker for it.\nLine drawings for print. Plain backgrounds. No text or numerals inside the image. No people where an object will do.\n\nSAFEGUARDING (absolute) — these students are displaced adolescents aged 12-18, most of whom have lived through war and displacement:\n- Never write content depicting war, weapons, violence, injury, death, bombing, fleeing, camps or displacement — including as incidental background detail in an example sentence.\n- Never ask a student to write or speak about their own family, home, journey, nationality, legal status, or reason for leaving.\n- Never include religious, sectarian or political content.\n- Never include romantic or sexual content.\n- Never assume a student has money, a device, internet access, the ability to travel, a bedroom of their own, or an intact family.\n\nLANGUAGE OF THE WORKSHEET:\n- Write the worksheet in the language of the SUBJECT being taught, as indicated by the curriculum context (subject, outcomes, grammar/vocabulary, theme) in the user message. For example, an English-subject worksheet must be written in English even though the students' first language is Arabic.\n- The teacher's app/interface language is irrelevant here and is not provided — never infer the worksheet language from it. When the subject's language is genuinely unclear from the context, default to English.",
  "worksheet_image": "IMAGE FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.\n\nSTYLE:\n- Flat illustration: clean, vector-style line art. Never photorealistic, never a 3D render.\n\nCONTEXT:\n- Ground people, dress, food, streets, and objects in a Levantine, Beirut-appropriate setting. Do not default to Western or Gulf visual cues.\n\nSAFEGUARDING (absolute):\n- No identifiable real people — no public figures, no recognisable individuals.\n- No military, no weapons, no uniforms of any kind.\n- No religious iconography.\n- No distress, injury, blood, or scenes of harm.",
  "smartt_checker_en": "FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.\n\nSMARTT is the fixed anchor — judge the objective against all six letters: Specific, Measurable, Achievable, Relevant, Time-bound, and Tangible (Alsama's distinctive final letter: relatable to students' real lives — concrete and meaningful in the students' own world, not just an abstract academic skill).\n\nThe objective — and your suggested rewrite — must use the exact stem \"By the end of this session, I will be able to\" followed by an observable, student-facing action.\n\nReturn ONLY a JSON object: for each of the six letters a status (\"strong\" or \"needs work\") and a single one-line note; and an improved_objective rewrite that keeps the stem. No code fences, no preamble, no prose outside the JSON.",
  "smartt_checker_ar": "FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.\n\nSMARTT is the fixed anchor — judge the objective against all six letters: Specific, Measurable, Achievable, Relevant, Time-bound, and Tangible (Alsama's distinctive final letter: relatable to students' real lives — concrete and meaningful in the students' own world, not just an abstract academic skill).\n\nThe objective — and your suggested rewrite — must use the exact stem \"By the end of this session, I will be able to\" followed by an observable, student-facing action.\n\nReturn ONLY a JSON object: for each of the six letters a status (\"strong\" or \"needs work\") and a single one-line note; and an improved_objective rewrite that keeps the stem. No code fences, no preamble, no prose outside the JSON.\n\nLANGUAGE: The teacher reads this feedback in Arabic. Write the human-readable feedback text — every \"note\" (the per-letter notes) — in Modern Standard Arabic (الفصحى).\nDo NOT translate or alter the JSON contract: keep all JSON keys in English, keep each \"status\" value as the exact English literal \"strong\" or \"needs work\". The \"improved_objective\" MUST still begin with the exact stem \"By the end of this session, I will be able to\" — leave the stem in English, unchanged."
};

// 1. No-override (code fallback) path — must reproduce the pre-split floor.
test('floorForTool reproduces the pre-split floor for every content tool', () => {
  assert.equal(floorForTool('resource_generator', 'en'), FIXTURES.resource_generator);
  assert.equal(floorForTool('worksheet_builder', 'en'), FIXTURES.worksheet_builder);
  assert.equal(floorForTool('worksheet_image', 'en'), FIXTURES.worksheet_image);
});

// 2. SMARTT in BOTH content-language modes (no safeguarding half; unchanged).
test('smartt_checker floor is byte-identical in both content-language modes', () => {
  assert.equal(floorForTool('smartt_checker', 'en'), FIXTURES.smartt_checker_en);
  assert.equal(floorForTool('smartt_checker', 'ar'), FIXTURES.smartt_checker_ar);
  // floorForTool must delegate to smarttCheckerFloor unchanged.
  assert.equal(floorForTool('smartt_checker', 'en'), smarttCheckerFloor('en'));
  assert.equal(floorForTool('smartt_checker', 'ar'), smarttCheckerFloor('ar'));
});

// 3. Seeded state: the DB override equals the fallback, so composing WITH it must
//    still reproduce the pre-split floor exactly (the byte-identity the seed relies on).
test('composing with the seeded safeguarding text (== fallback) is byte-identical', () => {
  for (const tool of ['resource_generator', 'worksheet_builder', 'worksheet_image'] as const) {
    const seeded = SAFEGUARDING_FALLBACK[tool];
    assert.ok(seeded, `SAFEGUARDING_FALLBACK missing entry for ${tool}`);
    assert.equal(floorForTool(tool, 'en', seeded), FIXTURES[tool]);
  }
});

// 4. smartt_checker has no safeguarding half — preserve Phase 0 §1 exactly.
test('smartt_checker has no safeguarding fallback', () => {
  assert.equal(SAFEGUARDING_FALLBACK.smartt_checker, undefined);
});

// 5. The read-only Output-contract text for smartt_checker is its whole base floor.
test('OUTPUT_CONTRACT.smartt_checker is the SMARTT base floor', () => {
  assert.equal(OUTPUT_CONTRACT.smartt_checker, FIXTURES.smartt_checker_en);
});
