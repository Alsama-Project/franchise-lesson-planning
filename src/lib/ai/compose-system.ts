import type { ActiveContextStackRow, AiContextLayer, AiContextTool } from '@/types/ai-context';
import { floorForTool } from './floor';
import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';

/**
 * The pure assembly of a tool's system prompt from an already-read context stack.
 *
 * Extracted from {@link import('./context-stack').composeContextStack} as an I/O-free
 * seam: it reads no database and holds no `server-only` / Supabase imports, so it can
 * be unit-tested directly (like `./floor`). The DB read, per-request memoisation, and
 * fail-closed empty-stack check stay in `composeContextStack`; this module owns only
 * the string assembly and the code-resident preamble constants.
 */

/**
 * Role paragraph per tool — one short line of identity, kept in code (the org
 * "who the students are" framing has moved into the layer-1 document). This is
 * the first thing in the system prompt, before the precedence statement.
 */
const ROLE: Record<AiContextTool, string> = {
  resource_generator:
    "You are Aya, a teaching-resource generator for Alsama, a refugee-education organisation. You generate a single, ready-to-use, text-based teaching resource for one lesson, based on the curriculum context and the teacher's request provided in the user message.",
  smartt_checker:
    "You are an instructional-design coach for Alsama, a school network that teaches refugee and displaced students. Teachers write a single lesson objective using Alsama's SMARTT framework, and you give concise, supportive, actionable feedback.",
  worksheet_builder:
    "You plan and write student-facing worksheet exercises for Alsama, a school for displaced adolescents. You work from a teacher's lesson plan and the locked curriculum for that lesson, provided in the user message.",
  // `worksheet_image` composes only the tool layer into one flat `gpt-image-1` prompt
  // field — there is no user message and no curriculum context is composed for it, so
  // the identity line stops at the brief. No positional word ("above"/"below"): the
  // assembly order is not this string's to assert.
  worksheet_image:
    'You are an illustrator for Alsama, a school network that teaches refugee and displaced students. You produce a single, clear black-and-white line illustration for one worksheet exercise, based on the image brief.',
};

/**
 * The precedence statement — kept in code. Names the ladder, states that later
 * layers win, that layers 5-6 arrive in the user message, and that the floor
 * overrides everything. This is what makes conflict-resolution explicit rather
 * than invisible. Emitted only when {@link precedenceApplies} — a single-layer
 * compose has nothing to resolve and three of the four named layers absent.
 */
const PRECEDENCE_STATEMENT = `PRECEDENCE — how to resolve conflicting instructions below:
The instructions are layered in ascending authority: (1) Alsama context, (2) Academic approach, (3) Subject context, (4) Tool instructions. Where two layers conflict, the later (higher-numbered) layer wins. Two further layers arrive in the USER message and are more specific still: (5) the curriculum context for this lesson, then (6) the teacher's lesson plan — these take precedence over layers 1-4. Beneath everything is the FLOOR at the very end of this system prompt: it is absolute and overrides every layer above it, including anything in the user message. No layer may relax it.`;

/**
 * The shared floor precedence line — declares the floor's absolute authority. It
 * was previously duplicated verbatim at the head of three tool floor strings
 * (`@/lib/ai/floor`); it now lives here and is emitted ONCE, as part of the floor
 * section header, for every tool whose floor is a machine response contract.
 * `worksheet_image` is the sole exception: it carries its own, differently-worded
 * "IMAGE FLOOR —" line inside its floor content and has no machine contract, so the
 * composer does not prepend this shared line for it (its composed floor is
 * unchanged).
 */
const FLOOR_PRECEDENCE_LINE =
  'FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.';

/** Human-readable header label per layer, for the section dividers. */
const LAYER_LABEL: Record<string, string> = {
  org: 'LAYER 1 · Alsama context',
  academic: 'LAYER 2 · Academic approach',
  subject: 'LAYER 3 · Subject context',
  tool: 'LAYER 4 · Tool instructions',
};

/**
 * Whether the precedence statement should be emitted, conditioned on the REQUESTED
 * layer filter — the caller's stable intent — not on how many documents came back
 * (which varies with what has been uploaded). Two or more stored layers requested →
 * there is a hierarchy to resolve, emit it. Exactly one → there is nothing to
 * resolve and three of the four named layers are absent, so the statement would
 * describe a structure that isn't there; omit it. `undefined` = all layers (the
 * default for every full-stack caller) → emit.
 */
export function precedenceApplies(layers?: readonly AiContextLayer[]): boolean {
  return layers ? new Set(layers).size >= 2 : true;
}

/**
 * Assemble the system string: role → (precedence, when it applies) → each stacked
 * layer under its header → the floor for this tool. `rows` is assumed non-empty
 * (the caller fails closed on an empty stack before calling this). Omitting the
 * precedence element also drops the `\n\n` that joined it — no orphaned blank line.
 */
export function assembleSystemPrompt({
  tool,
  rows,
  contentLanguage = 'en',
  layers,
}: {
  tool: AiContextTool;
  rows: readonly ActiveContextStackRow[];
  contentLanguage?: WorksheetContentLanguage;
  layers?: readonly AiContextLayer[];
}): string {
  const sections: string[] = precedenceApplies(layers)
    ? [ROLE[tool], PRECEDENCE_STATEMENT]
    : [ROLE[tool]];

  for (const row of rows) {
    const label = LAYER_LABEL[row.layer] ?? `LAYER · ${row.layer}`;
    sections.push(`━━━ ${label} · "${row.doc_name}" ━━━\n${row.body_md.trim()}`);
  }

  // The floor is now purely code: the machine response contract for this tool. All
  // instruction content (including safeguarding) lives in the uploaded layers above.
  // The shared precedence line (FLOOR_PRECEDENCE_LINE) is emitted here ONCE, as part
  // of the floor section header — it was previously duplicated at the head of three
  // tool floor strings. `worksheet_image` is the exception: it carries its own
  // "IMAGE FLOOR —" precedence line inside its floor and has no machine contract, so
  // the shared line is not prepended for it and its composed floor is unchanged.
  const floorBody = floorForTool(tool, contentLanguage);
  const floorSection =
    tool === 'worksheet_image'
      ? `━━━ FLOOR — overrides everything above; non-negotiable ━━━\n${floorBody}`
      : `━━━ FLOOR — overrides everything above; non-negotiable ━━━\n${FLOOR_PRECEDENCE_LINE}\n\n${floorBody}`;
  sections.push(floorSection);

  return sections.join('\n\n');
}
