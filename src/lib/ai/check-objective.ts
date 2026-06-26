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
export const OBJECTIVE_STEM = 'By the end of this session, students will be able to…';

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
  /** One or two overall suggestions to tighten the objective. */
  suggestions: string[];
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
    suggestions: { type: 'array', items: { type: 'string' } },
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

Return ONLY a JSON object: for each of the six letters a status ("strong" or "needs work") and a single one-line note; then one or two overall suggestions to tighten the objective; and an improved_objective rewrite that keeps the stem. No code fences, no preamble, no prose outside the JSON.`;

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
const ARABIC_DIRECTIVE = `LANGUAGE: The teacher reads this feedback in Arabic. Write the human-readable feedback text — every "note" and every entry in "suggestions" — in Modern Standard Arabic (الفصحى).
Do NOT translate or alter the JSON contract: keep all JSON keys in English, and keep each "status" value as the exact English literal "strong" or "needs work". The "improved_objective" MUST still begin with the exact stem "${OBJECTIVE_STEM}" — leave the stem in English, unchanged.`;

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

/** Runtime guard mirroring {@link ObjectiveCheckResult}. */
function isObjectiveCheckResult(value: unknown): value is ObjectiveCheckResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const letters = ['specific', 'measurable', 'achievable', 'relevant', 'time_bound', 'tangible'];
  if (!letters.every((key) => isLetter(v[key]))) return false;
  if (!Array.isArray(v.suggestions) || !v.suggestions.every((s) => typeof s === 'string')) return false;
  if (typeof v.improved_objective !== 'string') return false;
  return true;
}

/**
 * Assess a SMARTT lesson objective with Claude.
 *
 * @param objective The teacher's objective text.
 * @param context   Optional surrounding lesson context.
 * @returns Structured per-letter feedback, suggestions, and a rewrite.
 * @throws {ObjectiveCheckError} on missing API key (503), empty input (400), or
 *   an unparseable / malformed model reply (502).
 */
export async function checkObjective(
  objective: string,
  context?: ObjectiveCheckContext,
): Promise<ObjectiveCheckResult> {
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

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: buildUserPrompt(objective, context) }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: RESPONSE_SCHEMA,
        },
      },
    });
  } catch (err) {
    const status = err instanceof Anthropic.APIError && typeof err.status === 'number' ? err.status : 502;
    throw new ObjectiveCheckError(
      `Claude request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      status >= 500 ? 502 : status,
    );
  }

  return parseResult(extractText(message));
}
