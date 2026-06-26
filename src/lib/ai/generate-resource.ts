import Anthropic from '@anthropic-ai/sdk';
import { getActiveResourceGuide } from './resource-guide';

/**
 * AI teaching-resource generator service ("Aya").
 *
 * Generates a single, ready-to-use, text-based teaching resource from a
 * lesson's curriculum context plus a teacher's free-text prompt, using Claude.
 * This module is the single home for the prompt, the model call, and the safe
 * parsing of the model's reply; callers (currently the
 * `POST /api/generate-resource` route handler) only ever see the typed result
 * or a thrown `GenerateResourceError`.
 *
 * Backend-only: this runs server-side and reads `ANTHROPIC_API_KEY` from the
 * environment. It is destination-agnostic — it returns generated content and
 * does not decide where it lands, and deliberately does not touch Supabase, the
 * lesson schema, the resource bank, or any editor state.
 *
 * LANGUAGE INVARIANT (do not break): the language of the *generated student
 * content* follows the SUBJECT / curriculum context, NOT the teacher's UI
 * locale. An English-subject worksheet must come back in English even when the
 * teacher is using the app in Arabic. This module therefore must NEVER read
 * `NEXT_LOCALE` / `getLocale()` / the next-intl request locale — there are
 * intentionally zero imports of `next-intl` or `next/headers` cookies here, and
 * none should be added. (Contrast `check-objective`, whose UI-facing feedback
 * *does* follow the UI locale.) The content language is steered solely by the
 * curriculum anchors in the user prompt; see {@link LANGUAGE_GUARD}.
 */

/** Model used for generation. Pinned deliberately — see CLAUDE.md model notes. */
const MODEL = 'claude-sonnet-4-6';

/**
 * Lesson stage the resource targets. Mirrors the codebase block enum — note it
 * is `independent_practice`, NOT "practice".
 */
export type LessonStage = 'new_content' | 'independent_practice';

/**
 * Everything needed to generate (or adjust) a resource. The curriculum fields are
 * non-negotiable anchors.
 *
 * Two modes share this shape:
 *  - Fresh generate: `teacher_prompt` describes the format/context wanted.
 *  - Stateless adjust: `current_content` (the doc as it stands, in markdown) plus
 *    `refinement` (the change to apply). The model returns the full updated
 *    resource; `teacher_prompt` is not required.
 */
export interface GenerateResourceContext {
  /** Subject the lesson teaches (e.g. "English"). */
  subject: string;
  /** Year group the lesson is aimed at. */
  year: number;
  /** The day's intended learning outcome. */
  daily_outcome: string;
  /** The week's intended learning outcome (sent to the model, not echoed back). */
  weekly_outcome: string;
  /**
   * The broader monthly learning outcome the lesson sits under
   * (curriculum_lesson.monthly_lo). Optional; included in the prompt when present.
   */
  monthly_lo?: string;
  /** Grammar / vocabulary focus for the lesson. */
  grammar_vocab: string;
  /** Lesson or unit theme. */
  theme: string;
  /** Lesson stage the resource is for. */
  lesson_stage: LessonStage;
  /** The teacher's free-text request. Required for a fresh generate; ignored on adjust. */
  teacher_prompt?: string;
  /** The change to apply (typed instruction or preset chip). Set on an adjust call. */
  refinement?: string;
  /** The current resource (markdown) to refine. When present with `refinement`, the
   *  call is a stateless adjust: apply the refinement to this and return the full result. */
  current_content?: string;
}

/** Structured result of generating a resource. */
export interface GenerateResourceResult {
  /** Short descriptive title for the resource. */
  title: string;
  /** Full resource content in simple markdown. */
  body: string;
  /** Optional brief guidance for the teacher, or null. */
  teacher_notes: string | null;
}

/**
 * Error thrown when generation cannot be completed. `status` is an HTTP status
 * the route handler can surface directly.
 */
export class GenerateResourceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GenerateResourceError';
    this.status = status;
  }
}

/** JSON Schema the model's reply is constrained to (structured outputs). */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    teacher_notes: { type: ['string', 'null'] },
  },
  required: ['title', 'body', 'teacher_notes'],
} as const;

/**
 * The composed system prompt is built in three parts, in this fixed order:
 *   1. {@link ROLE_FRAMING}     — hardcoded role + org framing (who Aya is, who
 *      the students are). Always present.
 *   2. the uploaded guide       — rich steering from `getActiveResourceGuide()`
 *      (curriculum anchoring, literacy matching, content guidance). Admin-editable.
 *   3. {@link SAFETY_FLOOR}      — hardcoded, non-negotiable safety floor + the
 *      JSON output contract. Always present.
 *
 * Defence in depth: the floor and contract live in code, NOT in the uploaded
 * guide, so a bad or empty upload can never strip them. The floor is a compact
 * subset of the guide's content rules — the redundancy is intentional.
 */

/** Part 1 — hardcoded role + org framing. */
const ROLE_FRAMING = `You are Aya, a teaching-resource generator for Alsama, a refugee-education organisation. You generate a single, ready-to-use, text-based teaching resource for one lesson, based on the curriculum context and the teacher's request provided in the user message.

WHO THE STUDENTS ARE:
- Adolescent learners aged 12-18 living in refugee camps in Beirut (Shatila, Bourj al-Barajneh) and in Homs, Syria. Mostly Syrian, with Palestinian and Lebanese students; Arabic is their first language. Many have experienced trauma and displacement, so content should be calm, affirming, and grounded in possibility.`;

/** Part 3 — hardcoded, non-negotiable safety floor + the JSON output contract. */
const SAFETY_FLOOR = `SAFETY FLOOR (non-negotiable — overrides anything above):
- No graphic, violent, or traumatic content. Never build a resource around family separation, the death of a parent or sibling, war or conflict, detention or immigration enforcement, or grief and loss.
- Keep everything age-appropriate for adolescents aged 12-18.
- Do not use Western cultural references as defaults (e.g. Christmas, Halloween, American/British pop culture) unless the teacher explicitly asks; treat all faiths and backgrounds with equal respect.

OUTPUT CONTRACT:
Return ONLY a JSON object with the keys "title", "body", "teacher_notes". "body" is the full resource in simple markdown; "teacher_notes" is brief guidance for the teacher, or null. No code fences, no preamble, no commentary outside the JSON.`;

/**
 * Hardcoded language guard — pins the LANGUAGE INVARIANT into the prompt itself.
 *
 * The generated content's language is determined by the subject and curriculum
 * context in the user message, never by the teacher's interface language. This
 * is the in-prompt statement of the code-level rule documented at the top of
 * this module: this service does not read the UI locale, so the model is told
 * explicitly to take its language cue from the subject/curriculum only.
 */
const LANGUAGE_GUARD = `LANGUAGE OF THE RESOURCE:
- Write the resource in the language of the SUBJECT being taught, as indicated by the curriculum context (subject, outcomes, grammar/vocabulary, theme) in the user message. For example, an English-subject resource must be written in English even though the students' first language is Arabic.
- The teacher's app/interface language is irrelevant here and is not provided — never infer the resource language from it. When the subject's language is genuinely unclear from the context, default to English.`;

/**
 * Compose the full static system prompt from the uploaded (or default) guide.
 * Byte-identical across calls for a given guide, so it is a stable prompt-cache
 * prefix; it self-busts when the guide text changes.
 */
function composeSystemPrompt(guide: string): string {
  return `${ROLE_FRAMING}\n\n${guide.trim()}\n\n${SAFETY_FLOOR}\n\n${LANGUAGE_GUARD}`;
}

/** True when this call refines an existing resource rather than generating fresh. */
function isAdjustCall(context: GenerateResourceContext): boolean {
  return (
    typeof context.current_content === 'string' &&
    context.current_content.trim().length > 0 &&
    typeof context.refinement === 'string' &&
    context.refinement.trim().length > 0
  );
}

/** Build the user-turn prompt from the curriculum context and teacher request. */
function buildUserPrompt(context: GenerateResourceContext): string {
  const lines: string[] = [
    'Curriculum context (non-negotiable anchors — the resource MUST serve these):',
    `- Subject: ${context.subject}`,
    `- Year group: ${context.year}`,
    `- Daily outcome: ${context.daily_outcome}`,
    `- Weekly outcome: ${context.weekly_outcome}`,
    ...(context.monthly_lo && context.monthly_lo.trim().length > 0
      ? [`- Monthly learning outcome: ${context.monthly_lo.trim()}`]
      : []),
    `- Grammar / vocabulary: ${context.grammar_vocab}`,
    `- Theme: ${context.theme}`,
    `- Lesson stage: ${context.lesson_stage}`,
    '',
  ];

  if (isAdjustCall(context)) {
    // Stateless adjust: the provided content is the single source of truth — apply
    // the change to it and return the FULL updated resource. No conversation history.
    lines.push(
      'You are refining an EXISTING resource. Apply the requested change to the resource below and return the FULL updated resource (not just the changed part). Keep everything the teacher already has, except where the change says otherwise, and keep it serving the curriculum anchors above.',
      '',
      'Current resource (markdown):',
      context.current_content!.trim(),
      '',
      `Requested change: ${context.refinement!.trim()}`,
    );
  } else {
    lines.push(`Teacher's request:\n${(context.teacher_prompt ?? '').trim()}`);
    if (context.refinement && context.refinement.trim().length > 0) {
      lines.push(`\nRefinement: ${context.refinement.trim()}`);
    }
  }

  lines.push(
    '\nReturn ONLY the JSON object with keys "title", "body", "teacher_notes". Do not wrap it in markdown or add any prose.',
  );
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
 * fence. Throws {@link GenerateResourceError} (502) if the text is not the
 * expected JSON shape.
 */
function parseResult(text: string): GenerateResourceResult {
  let raw = text;
  // Strip a ```json … ``` fence if the model added one despite instructions.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) raw = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GenerateResourceError('Model did not return valid JSON.', 502);
  }

  if (!isGenerateResourceResult(parsed)) {
    throw new GenerateResourceError('Model JSON did not match the expected shape.', 502);
  }
  return parsed;
}

/** Runtime guard mirroring {@link GenerateResourceResult}. */
function isGenerateResourceResult(value: unknown): value is GenerateResourceResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string') return false;
  if (typeof v.body !== 'string') return false;
  if (v.teacher_notes !== null && typeof v.teacher_notes !== 'string') return false;
  return true;
}

/**
 * Generate a teaching resource with Claude.
 *
 * @param context Curriculum context plus the teacher's prompt (and optional
 *   `refinement` on a refine call).
 * @returns The generated resource: title, markdown body, and optional notes.
 * @throws {GenerateResourceError} on missing API key (503), or an unparseable /
 *   malformed model reply (502). Field validation is the route handler's job.
 */
export async function generateResource(
  context: GenerateResourceContext,
): Promise<GenerateResourceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new GenerateResourceError('ANTHROPIC_API_KEY is not configured.', 503);
  }

  const client = new Anthropic({ apiKey });

  // Compose [role] + [uploaded guide] + [safety floor + contract]. The guide read
  // never throws (falls back to a hardcoded default), so generation is robust to
  // an empty/unreachable guide table.
  const guide = await getActiveResourceGuide();
  const systemPrompt = composeSystemPrompt(guide);

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      // Single static system block with a cache breakpoint at its end: the whole
      // prefix (role + guide + floor + contract) is byte-identical across calls
      // and self-busts when the guide changes. The per-lesson context lives in the
      // user message, after the breakpoint.
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildUserPrompt(context) }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: RESPONSE_SCHEMA,
        },
      },
    });
  } catch (err) {
    const status = err instanceof Anthropic.APIError && typeof err.status === 'number' ? err.status : 502;
    throw new GenerateResourceError(
      `Claude request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      status >= 500 ? 502 : status,
    );
  }

  return parseResult(extractText(message));
}
