import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorForTool, smarttCheckerFloor, OUTPUT_CONTRACT } from '../floor';

// This branch collapsed the floor: code carries ONLY the machine response contract
// per tool. All instruction content — house style, pedagogy, language, exercise
// coverage, image briefs, and safeguarding — moved OUT of code into Connie's
// uploaded context docs. These tests pin that: the reduced floor still carries the
// response shape parsers depend on, and no longer carries any of the moved text.
// (The test imports the server-only, `@/`-aliased floor module via the test hook
// that stubs `server-only` and resolves `@/` — see scripts/ts-ext-hook.mjs.)

// Phrases that MUST have left the code floor entirely (safeguarding red lines +
// house style + moved guidance). If any reappears in a composed floor, content
// that should live in Connie's docs has leaked back into code.
const MUST_BE_ABSENT = [
  // safeguarding
  'SAFEGUARDING',
  'No identifiable real people',
  'Never write content depicting war',
  'No graphic, violent, or traumatic',
  // house style / image
  'Flat illustration',
  'Levantine',
  'STYLE:',
  'CONTEXT:',
  'IMAGE BRIEFS',
  // pedagogy / language / coverage
  'EXERCISE COVERAGE',
  'LANGUAGE OF THE RESOURCE',
  'LANGUAGE OF THE WORKSHEET',
  'MARKER CONVENTIONS',
];

test('resource_generator floor is only the JSON response contract', () => {
  const floor = floorForTool('resource_generator', 'en');
  assert.equal(floor, OUTPUT_CONTRACT.resource_generator);
  assert.match(floor, /OUTPUT CONTRACT:/);
  assert.match(floor, /"title", "body", "teacher_notes"/);
  for (const phrase of MUST_BE_ABSENT) {
    assert.equal(floor.includes(phrase), false, `resource floor must not contain: ${phrase}`);
  }
});

test('worksheet_builder floor is the JSON contract plus the [Picture:] rule only', () => {
  const floor = floorForTool('worksheet_builder', 'en');
  assert.equal(floor, OUTPUT_CONTRACT.worksheet_builder);
  assert.match(floor, /OUTPUT CONTRACT:/);
  // The one machine-parsed marker rule stays (exercise/route.ts:67 et al).
  assert.match(floor, /\[Picture: short literal description\] alone on its line/);
  // The `never null` clause was fixed out (schema requires nullable fields).
  assert.equal(floor.includes('never null'), false, 'worksheet floor must drop "never null"');
  // But the retained placeholder guidance stays.
  assert.match(floor, /never a placeholder such as "TODO" or "N\/A"/);
  for (const phrase of MUST_BE_ABSENT) {
    assert.equal(floor.includes(phrase), false, `worksheet floor must not contain: ${phrase}`);
  }
});

test('worksheet_builder floor carries the mechanical HEADING contract', () => {
  const floor = floorForTool('worksheet_builder', 'en');
  // Exercise title = ## (h2), label = ### (h3): the renderer keys layout + the pink title.
  assert.match(floor, /level-2 heading on its own line: ## Title/);
  assert.match(floor, /LABEL inside an exercise .* is a level-3 heading: ### Label/);
  // Bold is emphasis only — never a title or a label.
  assert.match(floor, /Bold\*\* is emphasis WITHIN a sentence only/);
  // Refer to exercises by title, never by number (moved from layer 4 to the floor).
  assert.match(floor, /Refer to an exercise ONLY by its title, never by a number/);
  // The model must not write pipe-table markdown; compile owns any grid layout.
  assert.match(floor, /Do NOT write pipe-table markdown/);
});

test('worksheet_image floor is only its precedence line (no style/context/safeguarding)', () => {
  const floor = floorForTool('worksheet_image', 'en');
  assert.equal(floor, OUTPUT_CONTRACT.worksheet_image);
  assert.match(floor, /^IMAGE FLOOR — this overrides every instruction above it/);
  for (const phrase of MUST_BE_ABSENT) {
    assert.equal(floor.includes(phrase), false, `image floor must not contain: ${phrase}`);
  }
});

test('smartt_checker floor keeps the contract, both locales', () => {
  const en = floorForTool('smartt_checker', 'en');
  const ar = floorForTool('smartt_checker', 'ar');
  assert.equal(en, smarttCheckerFloor('en'));
  assert.equal(ar, smarttCheckerFloor('ar'));
  // Contract that MUST stay in code: the six-letter anchor (each letter named), the
  // fixed stem (a code dependency — objective.ts compares against OBJECTIVE_STEM),
  // and the JSON contract (status enum + note + improved_objective).
  assert.match(en, /SMARTT is the fixed anchor/);
  for (const letter of ['Specific', 'Measurable', 'Achievable', 'Relevant', 'Time-bound', 'Tangible']) {
    assert.match(en, new RegExp(letter), `anchor must name ${letter}`);
  }
  assert.match(en, /By the end of this session, I will be able to/);
  assert.match(en, /"strong" or "needs work"/);
  assert.match(en, /improved_objective/);
  // The Arabic content-language directive is appended only for 'ar'.
  assert.equal(en.includes('الفصحى'), false);
  assert.match(ar, /الفصحى/);
});

test('smartt_checker floor no longer carries the extracted pedagogy', () => {
  // These three fragments were interleaved with the contract and moved to the
  // handback (docs/context-doc-handback/smartt_checker.md). If any reappears, the
  // pedagogy has leaked back into code.
  const SMARTT_PEDAGOGY_ABSENT = [
    "Alsama's distinctive final letter", // the Tangible gloss
    'observable, student-facing action', // the stem's pedagogical qualifier
    'single one-line', // the note length qualifier
  ];
  for (const lang of ['en', 'ar'] as const) {
    const floor = floorForTool('smartt_checker', lang);
    for (const phrase of SMARTT_PEDAGOGY_ABSENT) {
      assert.equal(floor.includes(phrase), false, `smartt floor (${lang}) must not contain: ${phrase}`);
    }
  }
});
