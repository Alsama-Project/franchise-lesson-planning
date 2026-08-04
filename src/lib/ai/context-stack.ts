import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { ActiveContextStackRow, AiContextTool } from '@/types/ai-context';
import { floorForTool } from './floor';
import type { SubjectResolution } from './subject-access';
import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';

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
 * the FLOOR (`@/lib/ai/floor`) — now ONLY the machine response contract per tool.
 * All instruction content (house style, pedagogy, language, exercise coverage,
 * image briefs, safeguarding) lives in the uploaded docs (layers 1-4); code
 * carries only the response shape.
 *
 * FAIL CLOSED: a prompt missing all four layers is worthless regardless of safety,
 * so an errored or empty stack is a hard failure, not a partial compose. The read
 * throws {@link ContextStackError} on an RPC error, and {@link composeContextStack}
 * throws on an empty stack; the calling routes surface a clear message to the user
 * instead of generating against a stripped prompt.
 *
 * Read path: `get_active_context_stack(tool, subject_id)` runs in the teacher's
 * (non-admin) request through the security-definer RPC on the RLS-honouring
 * server client — never the service-role key.
 */

/**
 * Thrown when the layered context stack cannot be composed — an RPC error or a
 * completely empty stack (a misconfiguration). Carries an HTTP `status` the calling
 * routes surface directly, and a user-facing `message`, so the failure reads as a
 * comprehensible "not configured" rather than a 500.
 */
export class ContextStackError extends Error {
  status: number;
  constructor(
    message = 'AI instructions have not been set up yet. Ask an administrator to configure the AI instruction documents before using this feature.',
    status = 503,
  ) {
    super(message);
    this.name = 'ContextStackError';
    this.status = status;
  }
}

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
 * The single structured record emitted for every AI call, so `docsUsed` and the
 * subject-resolution outcome are queryable together on one line. `subjectResolution`
 * makes the (previously silent) null explicit: `present` = a validated subject
 * steered the stack; `absent` = the caller supplied none; `rejected` = the caller
 * supplied one that failed the server-side membership check and was dropped.
 */
export interface AiComposeLogRecord {
  route: string;
  tool: AiContextTool;
  subjectName: string | null;
  subjectId: string | null;
  subjectResolution: SubjectResolution;
  docsUsed: ContextDocUsed[];
  /**
   * The language the model was instructed to WRITE feedback in. Checker-only —
   * feedback language follows the subject's `content_language`, so this makes the
   * (otherwise invisible) language choice queryable alongside `docsUsed`. Omitted
   * for tools whose language is not route-resolved this way.
   */
  feedbackLanguage?: WorksheetContentLanguage;
  /**
   * How `feedbackLanguage` was chosen — mirrors `subjectResolution`:
   * `subject` = read from the resolved subject's `content_language`;
   * `fallback` = the subject was absent/rejected so no read was made and English
   * was used. A silent drop to UI locale never happens; this records the fallback.
   */
  languageResolution?: 'subject' | 'fallback';
}

/** Emit the per-call compose record. One event name + shape across both tools. */
export function logAiCompose(record: AiComposeLogRecord): void {
  console.info('[ai] compose', record);
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
  worksheet_builder:
    "You plan and write student-facing worksheet exercises for Alsama, a school for displaced adolescents. You work from a teacher's lesson plan and the locked curriculum for that lesson, provided in the user message.",
  worksheet_image:
    'You are an illustrator for Alsama, a school network that teaches refugee and displaced students. You produce a single, clear black-and-white line illustration for one worksheet exercise, based on the image brief and curriculum context provided in the user message.',
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
 * client. Memoised per-request with React `cache()` so repeated composes in one
 * request share a single DB round-trip. Keyed on the primitive args (not an
 * object) so the cache actually hits.
 *
 * FAIL CLOSED: an RPC error (or a malformed, non-array result) THROWS
 * {@link ContextStackError} rather than being swallowed into `[]`. A transient DB
 * error must not silently produce a prompt stripped of every uploaded instruction.
 */
const readActiveStack = cache(
  async (tool: AiContextTool, subjectId: string | null): Promise<ActiveContextStackRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_active_context_stack', {
      p_tool: tool,
      p_subject_id: subjectId,
    });
    if (error || !Array.isArray(data)) {
      console.error('[context-stack] stack read failed', {
        tool,
        subjectId,
        error: error?.message ?? 'non-array result',
      });
      throw new ContextStackError();
    }
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
 * A COMPLETELY empty stack, however, is a misconfiguration: the composer FAILS
 * CLOSED and throws {@link ContextStackError} rather than composing role + floor
 * against no instruction content (see the fail-closed note at the top).
 *
 * `contentLanguage` is only consulted for `smartt_checker`'s floor (its feedback
 * language follows the SUBJECT's `content_language`, resolved at the route); it is
 * ignored for other tools. `locale` is retained in this shared signature for the
 * non-checker callers that still pass it, but the composer no longer consults it —
 * the checker's language now comes from `contentLanguage`, never the UI locale.
 */
export async function composeContextStack({
  tool,
  subjectId = null,
  contentLanguage = 'en',
}: {
  tool: AiContextTool;
  subjectId?: string | null;
  /**
   * Retained in the shared signature so non-checker callers may keep passing it,
   * but the composer no longer consults it — the checker's feedback language now
   * comes from `contentLanguage`, never the UI locale. Deliberately not
   * destructured so it introduces no dead binding.
   */
  locale?: string;
  contentLanguage?: WorksheetContentLanguage;
}): Promise<ComposedContextStack> {
  const rows = await readActiveStack(tool, subjectId);

  // FAIL CLOSED: a completely empty stack means none of the four uploaded layers
  // resolved — a misconfiguration. Composing role + floor against it would produce
  // a prompt with no instruction content, so throw instead and let the route
  // surface a clear message. (`readActiveStack` has already thrown on an RPC error.)
  if (rows.length === 0) {
    console.error('[context-stack] empty stack — refusing to compose a partial prompt', {
      tool,
      subjectId,
    });
    throw new ContextStackError();
  }

  const sections: string[] = [ROLE[tool], PRECEDENCE_STATEMENT];

  for (const row of rows) {
    const label = LAYER_LABEL[row.layer] ?? `LAYER · ${row.layer}`;
    sections.push(`━━━ ${label} · "${row.doc_name}" ━━━\n${row.body_md.trim()}`);
  }

  // The floor is now purely code: the machine response contract for this tool. All
  // instruction content (including safeguarding) lives in the uploaded layers above.
  sections.push(
    `━━━ FLOOR — overrides everything above; non-negotiable ━━━\n${floorForTool(tool, contentLanguage)}`,
  );

  const docsUsed: ContextDocUsed[] = rows.map((r) => ({
    docId: r.doc_id,
    name: r.doc_name,
    layer: r.layer,
    version: r.version,
  }));

  return { system: sections.join('\n\n'), docsUsed };
}
