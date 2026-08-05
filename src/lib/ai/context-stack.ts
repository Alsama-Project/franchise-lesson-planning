import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { ActiveContextStackRow, AiContextLayer, AiContextTool } from '@/types/ai-context';
import { assembleSystemPrompt } from './compose-system';
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
 *
 * `layers` restricts which STORED layers (1-4) are composed. It defaults to ALL
 * layers, so every existing caller is byte-for-byte unchanged. A tool that only
 * needs a subset passes the layers it wants — the image route asks for `['tool']`
 * alone, because an image model does not need the org/academic/subject teaching
 * corpus to draw a bus, and posting the whole stack blew `gpt-image-1`'s 32,000-char
 * prompt cap. The floor is always appended regardless of the filter. The fail-closed
 * check runs AFTER the filter: if the requested layer(s) resolve to nothing, the
 * composer throws exactly as it does for a wholly empty stack — a restricted compose
 * that silently drops safeguarding (which lives in the layer-4 tool doc) is a
 * misconfiguration, not an acceptable fallback.
 */
export async function composeContextStack({
  tool,
  subjectId = null,
  contentLanguage = 'en',
  layers,
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
  /**
   * Which stored layers (1-4) to compose. Omit for all layers (the default, and
   * what every existing caller does). Pass a subset — e.g. `['tool']` — to compose
   * only those; the floor is still appended, and an empty result after filtering
   * fails closed (see the note above).
   */
  layers?: readonly AiContextLayer[];
}): Promise<ComposedContextStack> {
  const allRows = await readActiveStack(tool, subjectId);
  const rows = layers ? allRows.filter((r) => layers.includes(r.layer)) : allRows;

  // FAIL CLOSED: an empty stack means the requested layers resolved to nothing —
  // either none of the four uploaded layers exist (a wholly unconfigured stack) or
  // the `layers` filter matched no active document (e.g. the tool layer is missing
  // under a restricted compose). Either way, composing role + floor against no
  // instruction content — dropping safeguarding — is a misconfiguration, so throw
  // and let the route surface a clear message. (`readActiveStack` has already thrown
  // on an RPC error.)
  if (rows.length === 0) {
    console.error('[context-stack] empty stack — refusing to compose a partial prompt', {
      tool,
      subjectId,
      layers: layers ?? null,
    });
    throw new ContextStackError();
  }

  // Pure assembly (role → precedence-when-it-applies → layers → floor) lives in
  // `./compose-system`, an I/O-free seam that is unit-tested directly. The DB read,
  // memoisation, and fail-closed check above stay here.
  const system = assembleSystemPrompt({ tool, rows, contentLanguage, layers });

  const docsUsed: ContextDocUsed[] = rows.map((r) => ({
    docId: r.doc_id,
    name: r.doc_name,
    layer: r.layer,
    version: r.version,
  }));

  return { system, docsUsed };
}
