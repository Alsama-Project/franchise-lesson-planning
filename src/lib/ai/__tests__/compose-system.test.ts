import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleSystemPrompt, precedenceApplies } from '../compose-system';
import { floorForTool } from '../floor';
import type { ActiveContextStackRow } from '@/types/ai-context';

// The regression that matters is the four full-stack Anthropic callers: their
// composed preamble must be byte-identical to before the precedence became
// conditional. These build an INDEPENDENT oracle — verbatim copies of the
// code-resident preamble constants, plus the real (untouched) floor via
// floorForTool — and assert full-string equality. If any of those strings drift,
// the copies stop matching and the test fails, flagging the change.

// Verbatim copies of the preamble constants (the oracle). ROLE_IMAGE is the
// POST-change image role (curriculum/user-message tail removed).
const ROLE_BUILDER =
  "You plan and write student-facing worksheet exercises for Alsama, a school for displaced adolescents. You work from a teacher's lesson plan and the locked curriculum for that lesson, provided in the user message.";
const ROLE_IMAGE =
  'You are an illustrator for Alsama, a school network that teaches refugee and displaced students. You produce a single, clear black-and-white line illustration for one worksheet exercise, based on the image brief.';
const PRECEDENCE_STATEMENT = `PRECEDENCE — how to resolve conflicting instructions below:
The instructions are layered in ascending authority: (1) Alsama context, (2) Academic approach, (3) Subject context, (4) Tool instructions. Where two layers conflict, the later (higher-numbered) layer wins. Two further layers arrive in the USER message and are more specific still: (5) the curriculum context for this lesson, then (6) the teacher's lesson plan — these take precedence over layers 1-4. Beneath everything is the FLOOR at the very end of this system prompt: it is absolute and overrides every layer above it, including anything in the user message. No layer may relax it.`;
const FLOOR_PRECEDENCE_LINE =
  'FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.';
const LAYER_LABEL: Record<string, string> = {
  org: 'LAYER 1 · Alsama context',
  academic: 'LAYER 2 · Academic approach',
  subject: 'LAYER 3 · Subject context',
  tool: 'LAYER 4 · Tool instructions',
};

function row(
  layer: ActiveContextStackRow['layer'],
  rank: number,
  name: string,
  body: string,
): ActiveContextStackRow {
  return { layer_rank: rank, layer, doc_id: `id-${layer}`, doc_name: name, version: 1, body_md: body };
}
function layerSection(r: ActiveContextStackRow): string {
  return `━━━ ${LAYER_LABEL[r.layer]} · "${r.doc_name}" ━━━\n${r.body_md.trim()}`;
}
function floorSection(tool: 'worksheet_builder' | 'worksheet_image'): string {
  const body = floorForTool(tool, 'en');
  return tool === 'worksheet_image'
    ? `━━━ FLOOR — overrides everything above; non-negotiable ━━━\n${body}`
    : `━━━ FLOOR — overrides everything above; non-negotiable ━━━\n${FLOOR_PRECEDENCE_LINE}\n\n${body}`;
}

const FULL_ROWS: ActiveContextStackRow[] = [
  row('org', 1, 'Alsama context', 'org body'),
  row('academic', 2, 'Academic approach', 'academic body'),
  row('subject', 3, 'English', 'subject body'),
  row('tool', 4, 'Worksheet builder guide', 'tool body'),
];

test('precedenceApplies: undefined (all layers) and 2+ requested → true; exactly one → false', () => {
  assert.equal(precedenceApplies(undefined), true);
  assert.equal(precedenceApplies(['org', 'academic', 'subject', 'tool']), true);
  assert.equal(precedenceApplies(['org', 'tool']), true);
  assert.equal(precedenceApplies(['tool']), false);
  assert.equal(precedenceApplies(['tool', 'tool']), false); // dedup, not length
});

test('full-stack (layers omitted) → byte-identical to the pre-change preamble', () => {
  const out = assembleSystemPrompt({ tool: 'worksheet_builder', rows: FULL_ROWS });
  const expected = [
    ROLE_BUILDER,
    PRECEDENCE_STATEMENT,
    ...FULL_ROWS.map(layerSection),
    floorSection('worksheet_builder'),
  ].join('\n\n');
  assert.equal(out, expected);
});

test('full-stack, layers explicitly listed → identical to the omitted-filter output', () => {
  const omitted = assembleSystemPrompt({ tool: 'worksheet_builder', rows: FULL_ROWS });
  const explicit = assembleSystemPrompt({
    tool: 'worksheet_builder',
    rows: FULL_ROWS,
    layers: ['org', 'academic', 'subject', 'tool'],
  });
  assert.equal(explicit, omitted);
});

test("single-layer (['tool']) → precedence omitted cleanly, no orphaned blank line", () => {
  const toolRow = row('tool', 4, 'Worksheet image style', 'image tool body');
  const out = assembleSystemPrompt({
    tool: 'worksheet_image',
    rows: [toolRow],
    layers: ['tool'],
  });
  const expected = [ROLE_IMAGE, layerSection(toolRow), floorSection('worksheet_image')].join('\n\n');
  assert.equal(out, expected);
  assert.ok(!out.includes('PRECEDENCE — how to resolve'), 'no precedence statement');
  assert.ok(!out.includes('\n\n\n\n'), 'no doubled/orphaned blank line where precedence sat');
  // Role is immediately followed by the layer-4 header, with exactly one blank line.
  assert.ok(out.startsWith(`${ROLE_IMAGE}\n\n━━━ LAYER 4 · Tool instructions`));
});
