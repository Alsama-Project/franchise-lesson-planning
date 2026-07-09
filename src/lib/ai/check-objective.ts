import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getLocale } from 'next-intl/server';
import { getActiveSmarttGuide } from '@/lib/ai/smartt-guide';

/**
 * AI objective-check service.
 *
 * Assesses a teacher's SMARTT lesson objective against Alsama's framework using
 * Claude, and returns a structured, per-letter critique plus a suggested rewrite.
 * This module is the single home for the prompt, the model call, and the safe
 * parsing of the model's reply; callers (currently the
 * `POST /api/check-objective` route handler) only ever see the typed result or a
 * thrown `ObjectiveCheckError`.
 *
 * Backend-only: this runs server-side and reads `ANTHROPIC_API_KEY` from the
 * environment. The system prompt is COMPOSED (mirroring generate-resource):
 *   [hardcoded role + org framing] → [admin-uploaded guide] → [hardcoded FLOOR]
 * The active guide is read via {@link getActiveSmarttGuide} through the
 * security-definer RPC on the RLS-honouring server client — never the
 * service-role key. The canonical SMARTT anchor, the fixed stem, and the JSON
 * output contract stay hardcoded in the FLOOR (plus the unchanged
 * `RESPONSE_SCHEMA` + `isObjectiveCheckResult` guard) so an uploaded guide can
 * never change the `ObjectiveCheckResult` shape the editor + pills depend on.
 */

/** Model used for the check. Pinned deliberately — see CLAUDE.md model notes. */
const MODEL = 'claude-sonnet-4-6';

/**
 * The fixed opening every Alsama objective must keep. The suggested rewrite is
 * required to begin with this exact stem.
 */
export const OBJECTIVE_STEM = 'By the end of this session, Aya will be able to…';

/** Optional surrounding lesson context the teacher can supply to sharpen feedback. */
export interface ObjectiveCheckContext {
  /** The day's intended learning outcome, if known. */
  dailyOutcome?: string;
  /** Grammar / vocabulary focus for the lesson. */
  grammarVocab?: string;
  /** Lesson or unit theme. */
  theme?: string;
  /** Year group the lesson is aimed at. */
  year?: number;
}

/** How a single SMARTT letter scored. */
export type LetterStatus = 'strong' | 'needs work';

/** Assessment of one of the six SMARTT letters. */
export interface SmarttLetterAssessment {
  /** Whether this dimension is met (`strong`) or not (`needs work`). */
  status: LetterStatus;
  /** One-line, teacher-facing explanation of the status. */
  note: string;
}

/** The six canonical SMARTT dimension keys, the values a suggestion may be tagged with. */
export type SmarttDimensionKey =
  | 'specific'
  | 'measurable'
  | 'achievable'
  | 'relevant'
  | 'time_bound'
  | 'tangible';

const SMARTT_DIMENSION_KEYS: readonly SmarttDimensionKey[] = [
  'specific',
  'measurable',
  'achievable',
  'relevant',
  'time_bound',
  'tangible',
];

/**
 * One overall suggestion to tighten the objective, tagged with the single SMARTT
 * dimension it addresses so the editor can lead each feedback bullet with that
 * dimension in bold.
 */
export interface SmarttSuggestion {
  /** Which SMARTT dimension this note relates to. */
  dimension: SmarttDimensionKey;
  /** The teacher-facing suggestion text. */
  note: string;
}

/**
 * Structured result of checking an objective. The six SMARTT letters each get a
 * status + note; ALSAMA's final "T" is **Tangible** — relatable to students'
 * real lives — not the more common "Trackable".
 */
export interface ObjectiveCheckResult {
  /** S — names a clear, single learning target. */
  specific: SmarttLetterAssessment;
  /** M — success is observable / assessable. */
  measurable: SmarttLetterAssessment;
  /** A — realistic for the lesson and learners. */
  achievable: SmarttLetterAssessment;
  /** R — connected to the wider curriculum / outcome. */
  relevant: SmarttLetterAssessment;
  /** T — bounded to the session ("by the end of this session…"). */
  time_bound: SmarttLetterAssessment;
  /** T — Tangible: relatable to students' real lives. */
  tangible: SmarttLetterAssessment;
  /** One or two overall suggestions, each tagged with the SMARTT dimension it addresses. */
  suggestions: SmarttSuggestion[];
  /** A rewrite that keeps the fixed {@link OBJECTIVE_STEM}. */
  improved_objective: string;
}

/**
 * Error thrown when the check cannot be completed. `status` is an HTTP status
 * the route handler can surface directly.
 */
export class ObjectiveCheckError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ObjectiveCheckError';
    this.status = status;
  }
}

/** JSON Schema the model's reply is constrained to (structured outputs). */
const LETTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['strong', 'needs work'] },
    note: { type: 'string' },
  },
  required: ['status', 'note'],
} as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    specific: LETTER_SCHEMA,
    measurable: LETTER_SCHEMA,
    achievable: LETTER_SCHEMA,
    relevant: LETTER_SCHEMA,
    time_bound: LETTER_SCHEMA,
    tangible: LETTER_SCHEMA,
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dimension: {
            type: 'string',
            enum: ['specific', 'measurable', 'achievable', 'relevant', 'time_bound', 'tangible'],
          },
          note: { type: 'string' },
        },
        required: ['dimension', 'note'],
      },
    },
    improved_objective: { type: 'string' },
  },
  required: [
    'specific',
    'measurable',
    'achievable',
    'relevant',
    'time_bound',
    'tangible',
    'suggestions',
    'improved_objective',
  ],
} as const;

/**
 * Hardcoded role / org framing — part 1 of the composed system prompt. Says who
 * is reviewing, what they review (one Alsama lesson objective), and the feedback
 * stance. Stays in code.
 */
const ROLE_FRAMING = `You are an instructional-design coach for Alsama, a school network that teaches refugee and displaced students. Teachers write a single lesson objective using Alsama's SMARTT framework, and you give concise, supportive, actionable feedback.`;

/**
 * Hardcoded FLOOR + output contract — part 3 of the composed system prompt, after
 * the active guide. Non-negotiable; stays in code. It pins the canonical SMARTT
 * anchor (the six letters, including Alsama's Tangible), the fixed stem, and the
 * JSON-only output contract, so an uploaded guide can steer judgement but can
 * never change the `ObjectiveCheckResult` shape (the `RESPONSE_SCHEMA` +
 * `isObjectiveCheckResult` guard are the hard enforcement; this is the in-prompt
 * statement of the same contract). Intentionally a compact subset — it does not
 * restate the whole guide.
 */
const SMARTT_FLOOR = `SMARTT is the fixed anchor — judge the objective against all six letters: Specific, Measurable, Achievable, Relevant, Time-bound, and Tangible (Alsama's distinctive final letter: relatable to students' real lives — concrete and meaningful in the students' own world, not just an abstract academic skill).

The objective — and your suggested rewrite — must use the exact stem "${OBJECTIVE_STEM}" followed by an observable, student-facing action.

Return ONLY a JSON object: for each of the six letters a status ("strong" or "needs work") and a single one-line note; then one or two overall suggestions to tighten the objective — each suggestion is an object with a "note" (the one-line advice) and a "dimension" naming the single SMARTT dimension it addresses, exactly one of "specific", "measurable", "achievable", "relevant", "time_bound", "tangible"; and an improved_objective rewrite that keeps the stem. No code fences, no preamble, no prose outside the JSON.`;

/**
 * Language directive appended ONLY when the teacher's UI locale is Arabic.
 *
 * Aya's objective check is UI-facing feedback, so its language follows the UI
 * locale (unlike generate-resource, whose content language follows the
 * subject/curriculum — never the UI). This directive switches only the
 * human-readable feedback text to Modern Standard Arabic; it must NOT touch the
 * JSON contract: the keys, the structure, and the status enum values stay
 * exactly as the FLOOR specifies, and the rewrite keeps the fixed English stem.
 */
const ARABIC_DIRECTIVE = `LANGUAGE: The teacher reads this feedback in Arabic. Write the human-readable feedback text — every "note" (the per-letter notes and each suggestion's "note") — in Modern Standard Arabic (الفصحى).
Do NOT translate or alter the JSON contract: keep all JSON keys in English, keep each "status" value as the exact English literal "strong" or "needs work", and keep each suggestion's "dimension" value as the exact English literal key ("specific", "measurable", "achievable", "relevant", "time_bound" or "tangible"). The "improved_objective" MUST still begin with the exact stem "${OBJECTIVE_STEM}" — leave the stem in English, unchanged.`;

/**
 * Compose the system prompt: hardcoded role framing → the active (or default)
 * guide → hardcoded FLOOR + contract → (Arabic only) a language directive.
 * Mirrors generate-resource's `composeSystemPrompt`. With no guide uploaded, the
 * guide argument is `DEFAULT_SMARTT_GUIDE` (the per-letter steering split out of
 * the original hardcoded prompt), so the checker receives the same role +
 * steering + letters + stem + contract as before — behaviour is unchanged.
 *
 * `locale` is the active UI locale (read server-side via next-intl). When it is
 * `'ar'` the {@link ARABIC_DIRECTIVE} is appended so the feedback text comes back
 * in Arabic; the FLOOR, the stem, and the JSON contract are untouched, so the
 * `ObjectiveCheckResult` shape is identical regardless of locale.
 */
function composeSystemPrompt(guide: string, locale: string): string {
  const base = `${ROLE_FRAMING}\n\n${guide.trim()}\n\n${SMARTT_FLOOR}`;
  return locale === 'ar' ? `${base}\n\n${ARABIC_DIRECTIVE}` : base;
}

/** Build the user-turn prompt from the objective and optional context. */
function buildUserPrompt(objective: string, context?: ObjectiveCheckContext): string {
  const lines: string[] = [`Objective to assess:\n"${objective.trim()}"`];

  const contextLines: string[] = [];
  if (context?.dailyOutcome) contextLines.push(`- Daily outcome: ${context.dailyOutcome}`);
  if (context?.grammarVocab) contextLines.push(`- Grammar / vocabulary: ${context.grammarVocab}`);
  if (context?.theme) contextLines.push(`- Theme: ${context.theme}`);
  if (typeof context?.year === 'number') contextLines.push(`- Year group: ${context.year}`);

  if (contextLines.length > 0) {
    lines.push(`\nLesson context (use to sharpen, do not assess directly):\n${contextLines.join('\n')}`);
  }

  lines.push('\nReturn ONLY the JSON object described in the schema. Do not wrap it in markdown or add any prose.');
  return lines.join('\n');
}

/** Pull the concatenated text out of a Claude message response. */
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Parse the model's reply into a result, tolerating an accidental markdown
 * fence. Throws {@link ObjectiveCheckError} (502) if the text is not the
 * expected JSON shape.
 */
function parseResult(text: string): ObjectiveCheckResult {
  let raw = text;
  // Strip a ```json … ``` fence if the model added one despite instructions.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) raw = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ObjectiveCheckError('Model did not return valid JSON.', 502);
  }

  if (!isObjectiveCheckResult(parsed)) {
    throw new ObjectiveCheckError('Model JSON did not match the expected shape.', 502);
  }
  return parsed;
}

/** Narrow an unknown value to a {@link SmarttLetterAssessment}. */
function isLetter(value: unknown): value is SmarttLetterAssessment {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.status === 'strong' || v.status === 'needs work') && typeof v.note === 'string';
}

/** Narrow an unknown value to a {@link SmarttSuggestion} (dimension-tagged note). */
function isSuggestion(value: unknown): value is SmarttSuggestion {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.note === 'string' &&
    SMARTT_DIMENSION_KEYS.includes(v.dimension as SmarttDimensionKey)
  );
}

/** Runtime guard mirroring {@link ObjectiveCheckResult}. */
function isObjectiveCheckResult(value: unknown): value is ObjectiveCheckResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const letters = ['specific', 'measurable', 'achievable', 'relevant', 'time_bound', 'tangible'];
  if (!letters.every((key) => isLetter(v[key]))) return false;
  if (!Array.isArray(v.suggestions) || !v.suggestions.every(isSuggestion)) return false;
  if (typeof v.improved_objective !== 'string') return false;
  return true;
}

/** A single resolved SMARTT letter, streamed to the client as a liveness frame. */
export interface SmarttPillFrame {
  key: SmarttDimensionKey;
  status: LetterStatus;
  note: string;
}

/**
 * Open a streaming SMARTT objective check with Claude.
 *
 * The request body is byte-identical to the non-streaming call it replaces —
 * same model, `max_tokens`, cached static system prefix (role framing + active
 * guide + FLOOR, + Arabic directive when locale is `ar`), and `json_schema`
 * output config — so prompt caching carries over untouched. The caller iterates
 * the returned stream for text deltas (see {@link createLetterScanner}) and then
 * validates `stream.finalMessage()` via {@link finalizeStreamedCheck}.
 *
 * Pre-flight failures throw {@link ObjectiveCheckError} BEFORE any stream is
 * opened, so the route can still map them to the same HTTP status as before
 * (empty input → 400, missing key → 503). This runs on the RLS-honouring server
 * client (the guide read is a security-definer RPC); never the service-role key.
 *
 * @throws {ObjectiveCheckError} on empty input (400) or missing API key (503).
 */
export async function openObjectiveCheckStream(
  objective: string,
  context?: ObjectiveCheckContext,
) {
  if (typeof objective !== 'string' || objective.trim().length === 0) {
    throw new ObjectiveCheckError('An objective string is required.', 400);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ObjectiveCheckError('ANTHROPIC_API_KEY is not configured.', 503);
  }

  const client = new Anthropic({ apiKey });

  // Compose the system prompt from the active SMARTT guide (admin-uploaded
  // steering, or the hardcoded default when none exists). The FLOOR + schema keep
  // the output shape fixed regardless of what the guide says.
  //
  // This is UI-facing feedback, so its language follows the active UI locale,
  // resolved server-side from the NEXT_LOCALE cookie via next-intl. Only the
  // feedback text changes (FLOOR/stem/JSON contract are locale-invariant).
  const guide = await getActiveSmarttGuide();
  const locale = await getLocale();
  const systemPrompt = composeSystemPrompt(guide, locale);

  return client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    // Single static system block with a cache breakpoint at its end — cloned
    // from generate-resource. The whole prefix is byte-identical across calls for
    // a given guide+locale, so it is a stable prompt-cache prefix; it self-busts
    // when the guide text changes. The per-objective text lives in the user
    // message, after the breakpoint.
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildUserPrompt(objective, context) }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: RESPONSE_SCHEMA,
      },
    },
  });
}

/**
 * Validate the assembled stream message into an {@link ObjectiveCheckResult}.
 *
 * This is the unchanged floor: {@link extractText} → {@link parseResult}, which
 * runs {@link isObjectiveCheckResult} and throws the same {@link ObjectiveCheckError}
 * (502) on a malformed reply. API-side schema enforcement was never the floor —
 * this validator is, and it stays byte-for-byte identical to the non-streaming path.
 */
export function finalizeStreamedCheck(message: Anthropic.Message): ObjectiveCheckResult {
  return parseResult(extractText(message));
}

/** True for JSON whitespace between tokens. */
function isJsonWs(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\r' || c === '\t';
}

/**
 * Read a JSON string token starting at `buffer[i] === '"'`. Returns the decoded
 * value and the index just past the closing quote, or `null` if the string is not
 * yet terminated (streaming frontier). Escape-aware so `\"` does not end it early.
 */
function readJsonString(buffer: string, i: number): { value: string; end: number } | null {
  if (buffer[i] !== '"') return null;
  const n = buffer.length;
  let j = i + 1;
  while (j < n) {
    const c = buffer[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '"') {
      try {
        return { value: JSON.parse(buffer.slice(i, j + 1)) as string, end: j + 1 };
      } catch {
        return null;
      }
    }
    j++;
  }
  return null;
}

/**
 * Return the index just past the matching close of the container opening at
 * `buffer[i]`, or `-1` if it has not closed yet. String-aware: `open`/`close`
 * chars inside a JSON string (e.g. a `}` in a note) are ignored.
 */
function matchContainer(buffer: string, i: number, open: string, close: string): number {
  const n = buffer.length;
  let depth = 0;
  let inStr = false;
  for (let j = i; j < n; j++) {
    const c = buffer[j];
    if (inStr) {
      if (c === '\\') {
        j++;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

/**
 * Walk the accumulating JSON at object depth 1 and return every top-level member
 * whose key is in `wanted` and whose value OBJECT has fully closed. Stops at the
 * streaming frontier (the first member whose value has not closed yet), so it
 * only ever reports complete letters. String/escape/depth aware, so braces or
 * quotes inside a note never trip the boundary detection.
 */
function closedTopLevelObjects(
  buffer: string,
  wanted: ReadonlySet<string>,
): Array<{ key: string; slice: string }> {
  const out: Array<{ key: string; slice: string }> = [];
  const n = buffer.length;
  let i = 0;
  while (i < n && buffer[i] !== '{') i++;
  if (i >= n) return out;
  i++; // step inside the root object (depth 1)

  while (i < n) {
    while (i < n && (isJsonWs(buffer[i]) || buffer[i] === ',')) i++;
    if (i >= n || buffer[i] === '}') break; // root closed or nothing more yet
    if (buffer[i] !== '"') break; // expected a member key; malformed/incomplete

    const keyTok = readJsonString(buffer, i);
    if (!keyTok) break; // key not fully streamed yet
    const key = keyTok.value;
    i = keyTok.end;

    while (i < n && isJsonWs(buffer[i])) i++;
    if (i >= n || buffer[i] !== ':') break;
    i++;
    while (i < n && isJsonWs(buffer[i])) i++;
    if (i >= n) break;

    const ch = buffer[i];
    if (ch === '{') {
      const end = matchContainer(buffer, i, '{', '}');
      if (end === -1) break; // value object not closed → frontier
      if (wanted.has(key)) out.push({ key, slice: buffer.slice(i, end) });
      i = end;
    } else if (ch === '[') {
      const end = matchContainer(buffer, i, '[', ']');
      if (end === -1) break;
      i = end;
    } else if (ch === '"') {
      const strTok = readJsonString(buffer, i);
      if (!strTok) break;
      i = strTok.end;
    } else {
      // primitive (number / true / false / null) — advance to the next delimiter
      let j = i;
      while (j < n && buffer[j] !== ',' && buffer[j] !== '}' && buffer[j] !== ']' && !isJsonWs(buffer[j])) {
        j++;
      }
      if (j >= n) break; // primitive may still be growing at the frontier
      i = j;
    }
  }
  return out;
}

/**
 * Stateful, incremental scanner over the accumulating structured-output JSON.
 * Feed it the FULL buffer each time; it returns any SMARTT letter whose value
 * object has closed since the previous call, exactly once, keyed by letter — so
 * even out-of-order emission resolves the right pill. Pill frames are liveness
 * only; the authoritative values come from the validated result at stream end.
 */
export function createLetterScanner() {
  const wanted: ReadonlySet<string> = new Set(SMARTT_DIMENSION_KEYS);
  const emitted = new Set<SmarttDimensionKey>();

  return {
    /** True once all six letters have been emitted (no need to keep scanning). */
    done(): boolean {
      return emitted.size === SMARTT_DIMENSION_KEYS.length;
    },
    /** Return letters that newly closed in `buffer` since the last call. */
    scan(buffer: string): SmarttPillFrame[] {
      const frames: SmarttPillFrame[] = [];
      for (const { key, slice } of closedTopLevelObjects(buffer, wanted)) {
        const dim = key as SmarttDimensionKey;
        if (emitted.has(dim)) continue;
        emitted.add(dim); // one shot per letter, even if the parse below rejects it
        let parsed: unknown;
        try {
          parsed = JSON.parse(slice);
        } catch {
          continue;
        }
        if (isLetter(parsed)) frames.push({ key: dim, status: parsed.status, note: parsed.note });
      }
      return frames;
    },
  };
}
