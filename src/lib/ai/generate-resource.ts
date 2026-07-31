import Anthropic from '@anthropic-ai/sdk';
import { getResourcesClient } from '@/lib/anthropic';
import { composeContextStack } from './context-stack';

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
 * Backend-only: this runs server-side and uses the resources-only Anthropic
 * client ({@link getResourcesClient}, keyed by `ANTHROPIC_API_KEY_RESOURCES`) so
 * its cost is tracked separately from SMARTT objective checking. It is
 * destination-agnostic — it returns generated content and
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
  /** Subject the lesson teaches (e.g. "English"). The one always-present anchor. */
  subject: string;
  /**
   * The remaining curriculum anchors are all OPTIONAL. They vary by subject
   * shape — `grammar_vocab` is empty for Science/Maths, `daily_outcome` for
   * weekly-shape subjects (Awareness/Yoga), etc. — and each is included in the
   * prompt only when present and non-empty. An absent anchor never blocks
   * generation; it simply drops its line from the user prompt.
   */
  /** Year group the lesson is aimed at. */
  year?: number;
  /** The day's intended learning outcome. */
  daily_outcome?: string;
  /** The week's intended learning outcome (sent to the model, not echoed back). */
  weekly_outcome?: string;
  /**
   * The broader monthly learning outcome the lesson sits under
   * (curriculum_lesson.monthly_lo). Included in the prompt when present.
   */
  monthly_lo?: string;
  /** Grammar / vocabulary focus for the lesson (English-shape subjects only). */
  grammar_vocab?: string;
  /** Lesson or unit theme. */
  theme?: string;
  /** Lesson stage the resource is for. */
  lesson_stage?: LessonStage;
  /** The teacher's free-text request. Required for a fresh generate; ignored on adjust. */
  teacher_prompt?: string;
  /** The change to apply (typed instruction or preset chip). Set on an adjust call. */
  refinement?: string;
  /** The current resource (markdown) to refine. When present with `refinement`, the
   *  call is a stateless adjust: apply the refinement to this and return the full result. */
  current_content?: string;
  /**
   * Layer 6 — the teacher's own lesson plan for the block this resource serves,
   * pulled from the relevant `lesson_plans.blocks` entry. Optional and gated: an
   * absent block (or one with all fields empty) simply omits the layer-6 section
   * from the user prompt — it never blocks generation. It is the most specific
   * runtime layer and, per the precedence statement, takes precedence over the
   * stored ladder above it.
   */
  lesson_block?: {
    /** What the teacher does during the block. */
    teacher_does?: string;
    /** What the students do during the block. */
    students_do?: string;
    /** Gradual-release phase: `i_do` | `we_do` | `you_do`, or null. */
    phase?: string | null;
    /** The teacher's short "what I'll do" note for the block. */
    note?: string;
  };
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

// The role framing, the safety floor + JSON contract, the base output contract,
// and the language guard have moved out of this file. The system prompt is now
// built by the layered-context composer (`@/lib/ai/context-stack`):
//   role → precedence statement → layers 1-4 (org/academic/subject/tool) → FLOOR
// The FLOOR (safeguarding red lines, the field/output contract, the marker
// conventions, the language guard) lives in `@/lib/ai/floor`. The steerable
// prose that used to sit here — "mirror the request", "keep it tight", the org
// student framing, the cultural defaults — has moved into the stack as
// documents. The teacher's request stays the task, in the USER message.

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
  // Subject is the one guaranteed anchor; every other line is emitted only when
  // its value is present and non-empty, so non-English subject shapes (which
  // legitimately lack grammar/vocab, a daily outcome, etc.) produce a clean
  // prompt with no empty "- Field: " lines.
  const hasText = (value?: string): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const curriculumContext: string[] = [
    'Curriculum context (anchors to respect while fulfilling the task above):',
    `- Subject: ${context.subject}`,
    ...(typeof context.year === 'number' && Number.isFinite(context.year)
      ? [`- Year group: ${context.year}`]
      : []),
    ...(hasText(context.daily_outcome) ? [`- Daily outcome: ${context.daily_outcome.trim()}`] : []),
    ...(hasText(context.weekly_outcome) ? [`- Weekly outcome: ${context.weekly_outcome.trim()}`] : []),
    ...(hasText(context.monthly_lo)
      ? [`- Monthly learning outcome: ${context.monthly_lo.trim()}`]
      : []),
    ...(hasText(context.grammar_vocab)
      ? [`- Grammar / vocabulary: ${context.grammar_vocab.trim()}`]
      : []),
    ...(hasText(context.theme) ? [`- Theme: ${context.theme.trim()}`] : []),
    ...(context.lesson_stage ? [`- Lesson stage: ${context.lesson_stage}`] : []),
  ];

  const lines: string[] = [];

  if (isAdjustCall(context)) {
    // Stateless adjust: the provided content is the single source of truth — apply
    // the change to it and return the FULL updated resource. No conversation history.
    lines.push(
      'You are refining an EXISTING resource. Apply the requested change to the resource below and return the FULL updated resource (not just the changed part). Keep everything the teacher already has, except where the change says otherwise, and keep it serving the curriculum anchors below.',
      '',
      'Current resource (markdown):',
      context.current_content!.trim(),
      '',
      `Requested change: ${context.refinement!.trim()}`,
      '',
      ...curriculumContext,
    );
  } else {
    // Fresh generate. The teacher's request IS the task and is sent verbatim —
    // never summarised, expanded, or rewritten. The curriculum context follows as
    // supporting anchors, not as a competing instruction.
    lines.push(
      "TASK — produce exactly the resource the teacher requests below. Their request is quoted verbatim; fulfil it directly and do not substitute a different or more generic resource:",
      '',
      (context.teacher_prompt ?? '').trim(),
    );
    if (context.refinement && context.refinement.trim().length > 0) {
      lines.push('', `Refinement: ${context.refinement.trim()}`);
    }
    lines.push('', ...curriculumContext);
  }

  // Layer 6 — the teacher's own lesson plan for this block, when supplied.
  const lessonPlanContext = buildLessonPlanContext(context.lesson_block);
  if (lessonPlanContext.length > 0) {
    lines.push('', ...lessonPlanContext);
  }

  lines.push(
    '',
    'Return ONLY the JSON object with keys "title", "body", "teacher_notes". Do not wrap it in markdown or add any prose.',
  );
  return lines.join('\n');
}

/**
 * Build the layer-6 section from the teacher's lesson-plan block. Emitted only
 * when `block` carries at least one non-empty field; an absent or all-empty block
 * returns `[]` so the section is dropped entirely (gated, never an error). The
 * header marks it as layer 6 — the most specific runtime context — so it reads as
 * taking precedence over the stored ladder, per the composer's precedence
 * statement.
 */
function buildLessonPlanContext(block?: GenerateResourceContext['lesson_block']): string[] {
  if (!block) return [];
  const hasText = (v?: string | null): v is string =>
    typeof v === 'string' && v.trim().length > 0;
  const phaseLabel: Record<string, string> = { i_do: 'I do', we_do: 'We do', you_do: 'You do' };

  const rows: string[] = [];
  if (hasText(block.phase)) rows.push(`- Phase: ${phaseLabel[block.phase] ?? block.phase}`);
  if (hasText(block.teacher_does)) rows.push(`- Teacher does: ${block.teacher_does.trim()}`);
  if (hasText(block.students_do)) rows.push(`- Students do: ${block.students_do.trim()}`);
  if (hasText(block.note)) rows.push(`- Note: ${block.note.trim()}`);
  if (rows.length === 0) return [];

  return [
    "The teacher's lesson plan for this block (layer 6 — the most specific context; honour it while respecting the floor):",
    ...rows,
  ];
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
  let client: Anthropic;
  try {
    // Resource generation has its OWN Anthropic key (ANTHROPIC_API_KEY_RESOURCES).
    client = getResourcesClient();
  } catch (err) {
    // Surface a missing/misconfigured key as a 503 so the route maps it the same
    // way it always has — fail loudly, never silently fall back.
    throw new GenerateResourceError(
      err instanceof Error ? err.message : 'ANTHROPIC_API_KEY_RESOURCES is not configured.',
      503,
    );
  }

  // Compose the system prompt from the layered context stack: role → precedence
  // → layers 1-4 (org/academic/subject/tool) → FLOOR. The floor (safeguarding,
  // output contract, marker conventions, language guard) lives in code and
  // overrides every layer. The per-lesson curriculum anchors (layer 5) and the
  // teacher's lesson plan (layer 6) stay in the USER message, after the cache
  // breakpoint. `subjectId` is null here: the caller supplies a subject *name*,
  // not the UUID the RPC keys on, and no per-subject documents are seeded — the
  // org/academic/tool layers still compose correctly.
  const { system: systemPrompt, docsUsed } = await composeContextStack({
    tool: 'resource_generator',
    subjectId: null,
  });
  // Observability: which documents produced this prompt (see PR/floor notes).
  console.info('[ai] generate-resource compose', {
    tool: 'resource_generator',
    subject: context.subject,
    docsUsed,
  });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      // Hard ceiling on the only expensive axis (output at $15/M). A single
      // one-page worksheet — fresh or an Adjust that returns the full doc — sits
      // well under this; the cap just bounds runaway generations. If a legitimate
      // resource ever truncates here (incomplete JSON → GenerateResourceError 502),
      // raise it deliberately rather than removing the ceiling.
      max_tokens: 1536,
      // Single static system block with one cache breakpoint at its end: the whole
      // prefix (role + precedence + layers 1-4 + floor) is stable per (tool,
      // subject) and self-busts when a layer document changes. The per-lesson
      // context (layers 5-6) lives in the user message, after the breakpoint.
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
