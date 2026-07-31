import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { ActiveContextStackRow, AiContextTool } from '@/types/ai-context';
import { floorForTool } from './floor';

/**
 * The layered-context composer — the single home for building an AI tool's
 * system prompt.
 *
 * Instructions no longer live as hardcoded prose in TypeScript. They live in
 * `ai_context_doc` / `ai_context_doc_version` as a stack of ascending authority:
 *
 *   1. Alsama context      (org, global)
 *   2. Academic approach   (pedagogy, global)
 *   3. Subject context     (per subject)
 *   4. Tool instructions   (per tool, optionally per subject)
 *   — then at runtime, in the USER message —
 *   5. Curriculum context  (per lesson)
 *   6. Teacher's lesson plan
 *
 * Later layers win on conflict. Beneath the ladder and overriding all of it sits
 * the FLOOR (`@/lib/ai/floor`) — the output contract, the safeguarding red
 * lines, and the language guard — which stays in code because breaking it breaks
 * the app or harms a student. This structure exists because of a real production
 * failure: a hardcoded floor and an uploaded guide gave contradictory
 * instructions and nothing declared which won. Now the ladder + an explicit
 * precedence statement + the floor make the resolution visible.
 *
 * Read path: `get_active_context_stack(tool, subject_id)` runs in the teacher's
 * (non-admin) request through the security-definer RPC on the RLS-honouring
 * server client — never the service-role key.
 */

/** One document that contributed to a composed prompt, for observability. */
export interface ContextDocUsed {
  docId: string;
  name: string;
  layer: string;
  version: number;
}

export interface ComposedContextStack {
  /** The full system string: role → precedence → layers 1-4 → floor. */
  system: string;
  /** The documents that fed layers 1-4, in composition order. */
  docsUsed: ContextDocUsed[];
}

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
  worksheet_builder: '',
};

/**
 * The precedence statement — kept in code. Names the ladder, states that later
 * layers win, that layers 5-6 arrive in the user message, and that the floor
 * overrides everything. This is what makes conflict-resolution explicit rather
 * than invisible.
 */
const PRECEDENCE_STATEMENT = `PRECEDENCE — how to resolve conflicting instructions below:
The instructions are layered in ascending authority: (1) Alsama context, (2) Academic approach, (3) Subject context, (4) Tool instructions. Where two layers conflict, the later (higher-numbered) layer wins. Two further layers arrive in the USER message and are more specific still: (5) the curriculum context for this lesson, then (6) the teacher's lesson plan — these take precedence over layers 1-4. Beneath everything is the FLOOR at the very end of this system prompt: it is absolute and overrides every layer above it, including anything in the user message. No layer may relax it.`;

/** Human-readable header label per layer, for the section dividers. */
const LAYER_LABEL: Record<string, string> = {
  org: 'LAYER 1 · Alsama context',
  academic: 'LAYER 2 · Academic approach',
  subject: 'LAYER 3 · Subject context',
  tool: 'LAYER 4 · Tool instructions',
};

/**
 * Read the active stack for `(tool, subjectId)` via the RLS-honouring server
 * client. Memoised per-request with React `cache()` — matching the pattern the
 * deleted `getActive*Guide` helpers used — so repeated composes in one request
 * share a single DB round-trip. Keyed on the primitive args (not an object) so
 * the cache actually hits. Returns `[]` on error; the caller logs the empty
 * stack as a misconfiguration and still composes role + floor.
 */
const readActiveStack = cache(
  async (tool: AiContextTool, subjectId: string | null): Promise<ActiveContextStackRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_active_context_stack', {
      p_tool: tool,
      p_subject_id: subjectId,
    });
    if (error || !Array.isArray(data)) return [];
    return data as ActiveContextStackRow[];
  },
);

/**
 * Compose the system prompt for a tool from the layered context stack.
 *
 * Order (exact): role → precedence statement → layers 1-4 (in the order the RPC
 * returns them, each under a header naming its layer and document) → the floor
 * for this tool (under a header stating it overrides everything above).
 *
 * Missing layers are legitimate, not errors — a subject with no subject-context
 * document composes fine with that layer simply absent; nothing is substituted.
 * A COMPLETELY empty stack is a misconfiguration: it is logged at error level
 * and the prompt is still built from role + floor (no invented content).
 *
 * `locale` is only consulted for `smartt_checker`'s floor (its feedback language
 * follows the UI locale); it is ignored for other tools.
 */
export async function composeContextStack({
  tool,
  subjectId = null,
  locale = 'en',
}: {
  tool: AiContextTool;
  subjectId?: string | null;
  locale?: string;
}): Promise<ComposedContextStack> {
  const rows = await readActiveStack(tool, subjectId);

  if (rows.length === 0) {
    console.error('[context-stack] empty stack — misconfiguration', { tool, subjectId });
  }

  const sections: string[] = [ROLE[tool], PRECEDENCE_STATEMENT];

  for (const row of rows) {
    const label = LAYER_LABEL[row.layer] ?? `LAYER · ${row.layer}`;
    sections.push(`━━━ ${label} · "${row.doc_name}" ━━━\n${row.body_md.trim()}`);
  }

  sections.push(
    `━━━ FLOOR — overrides everything above; non-negotiable ━━━\n${floorForTool(tool, locale)}`,
  );

  const docsUsed: ContextDocUsed[] = rows.map((r) => ({
    docId: r.doc_id,
    name: r.doc_name,
    layer: r.layer,
    version: r.version,
  }));

  return { system: sections.join('\n\n'), docsUsed };
}
