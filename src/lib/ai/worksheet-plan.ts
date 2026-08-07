import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getWorksheetClient } from '@/lib/anthropic';
import { composeContextStack, logAiCompose, ContextStackError, type ContextDocUsed } from './context-stack';
import { anchorLines, promptHash, type CurriculumAnchors } from './worksheet-shared';
import type { Block } from '@/types/lesson';
import type { ExerciseSpec } from '@/types/worksheet-exercise';

/**
 * Worksheet PLANNER service.
 *
 * Given a lesson's blocks + curriculum context + the subject's worksheet
 * template, it asks Claude to plan the worksheet as an ordered list of
 * {@link ExerciseSpec}s — one call, structured output. This module owns the
 * prompt, the model call, and the safe parse; the route
 * (`POST /api/worksheet/plan`) reads the inputs, calls this, then persists the
 * skeleton `worksheet_exercise` rows.
 *
 * Mirrors `@/lib/ai/generate-resource` for the route/lib split, the
 * `composeContextStack` call, the `output_config` json_schema, and the
 * `logAiCompose` observability. It uses the worksheet-only Anthropic client
 * ({@link getWorksheetClient}, keyed by `ANTHROPIC_API_KEY_WORKSHEET`) so its
 * cost is tracked separately.
 *
 * LANGUAGE INVARIANT (do not break): the language of the planned worksheet
 * follows the SUBJECT / curriculum context, never the teacher's UI locale. This
 * module therefore never reads `next-intl` / `next/headers`; the content
 * language is steered solely by the curriculum anchors and the floor.
 */

/** Model used for worksheet building. Pinned, matching the other AI routes. */
const MODEL = 'claude-sonnet-4-6';

/** Hard ceiling on total images a single worksheet may request (spec rule). */
export const MAX_TOTAL_IMAGES = 8;

/** Error thrown when planning cannot be completed. `status` is an HTTP status. */
export class WorksheetPlanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'WorksheetPlanError';
    this.status = status;
  }
}

/** Everything the planner needs — all read + validated server-side by the route. */
export interface WorksheetPlanContext {
  /** The plan's subject uuid — steers the context stack. Trusted (from the plan row). */
  subjectId: string | null;
  /** The plan's curriculum reference (for the generation record). */
  curriculumLessonId: string | null;
  /** The lesson's timed blocks — the primary source of exercises. */
  blocks: Block[];
  /** The lesson's curriculum anchors (gated). */
  anchors: CurriculumAnchors | null;
  /** The heading texts available in the subject's worksheet template (may be empty). */
  templateHeadings: string[];
  /** The active exercise_type labels (verbatim), injected into the schema enum. */
  exerciseTypes: string[];
}

/** The planner's result plus the provenance the route stamps onto each row. */
export interface WorksheetPlanResult {
  specs: ExerciseSpec[];
  docsUsed: ContextDocUsed[];
  model: string;
  promptHash: string;
}

/** Build the JSON schema the model reply is constrained to. Enum injected verbatim. */
function buildResponseSchema(exerciseTypes: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      specs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            position: { type: 'integer' },
            exercise_type: { type: 'string', enum: exerciseTypes },
            title: { type: 'string' },
            brief: { type: 'string' },
            estimated_height: { type: 'string', enum: ['short', 'medium', 'tall'] },
            source: { type: 'string', enum: ['generate', 'reuse', 'adapt'] },
            resource_id: { type: ['string', 'null'] },
            image_count: { type: 'integer' },
            template_anchor: { type: ['string', 'null'] },
          },
          required: [
            'position',
            'exercise_type',
            'title',
            'brief',
            'estimated_height',
            'source',
            'resource_id',
            'image_count',
            'template_anchor',
          ],
        },
      },
    },
    required: ['specs'],
  } as const;
}

/** Render the lesson blocks for the prompt — students-do first, teacher-do as secondary. */
function blockLines(blocks: Block[]): string[] {
  const hasText = (v?: string | null): v is string => typeof v === 'string' && v.trim().length > 0;
  const phaseLabel: Record<string, string> = { i_do: 'I do', we_do: 'We do', you_do: 'You do' };
  const out: string[] = ['The lesson blocks (the plan to build the worksheet from):'];
  for (const b of blocks) {
    // Skip a block that carries no printable content (no activity title, students-do,
    // teacher-does, or note). Such a block would otherwise emit only a bare title line
    // and rely on the model to notice it yields no exercise; skipping it keeps the
    // empty step-5b Group-practice block (0-min, seeded on every existing plan) — and
    // any other content-less block — out of the planner input entirely. It removes only
    // detail-less title lines, so blocks that already produce no exercise are unaffected.
    if (
      !hasText(b.activity_title) &&
      !hasText(b.students_do) &&
      !hasText(b.teacher_does) &&
      !hasText(b.note)
    ) {
      continue;
    }
    const parts: string[] = [`- ${b.title}`];
    if (hasText(b.phase)) parts.push(`(${phaseLabel[b.phase] ?? b.phase})`);
    out.push(parts.join(' '));
    if (hasText(b.activity_title)) out.push(`  · Activity: ${b.activity_title.trim()}`);
    if (hasText(b.students_do)) out.push(`  · Students do: ${b.students_do.trim()}`);
    if (hasText(b.teacher_does)) out.push(`  · Teacher does: ${b.teacher_does.trim()}`);
    if (hasText(b.note)) out.push(`  · Note: ${b.note.trim()}`);
  }
  return out;
}

/** Build the user-turn prompt. The generation brief rules live here, not the floor. */
function buildUserPrompt(context: WorksheetPlanContext): string {
  const lines: string[] = [
    'TASK — plan the student worksheet for this lesson as an ordered list of exercises. An exercise is the printed work for one student-facing block the teacher wrote. Return one spec per such block, in block order.',
    '',
    ...blockLines(context.blocks),
  ];

  const anchors = anchorLines(context.anchors);
  if (anchors.length > 0) {
    lines.push('', 'Curriculum context (anchors to respect):', ...anchors);
  }

  lines.push(
    '',
    'exercise_type MUST be exactly one of the allowed labels (verbatim, including spaces and slashes):',
    ...context.exerciseTypes.map((t) => `- ${t}`),
  );

  if (context.templateHeadings.length > 0) {
    lines.push(
      '',
      "The subject's worksheet template has these headings. Set template_anchor to the EXACT heading text an exercise fills (copied verbatim from this list), or null when no heading fits:",
      ...context.templateHeadings.map((h) => `- ${h}`),
    );
  } else {
    lines.push(
      '',
      'This subject has no worksheet template — set template_anchor to null for every exercise.',
    );
  }

  lines.push(
    '',
    'How to plan the exercises:',
    '- The blocks are the ONLY source of exercises. A "Students do" activity is a student-facing block; a "Teacher does" activity is one only when the student needs the artefact printed in front of them — a worked example does, an oral drill does not.',
    '- One student-facing block, one exercise, in block order. A block is one activity the teacher wrote about. Two Independent practice blocks — a gap fill and a crossword — are two exercises. Never merge two blocks into one exercise; never split one block into several.',
    '- A block that needs nothing printed yields no exercise: an oral drill or a Think–Pair–Share produces nothing on paper, whether it is written under "Students do" or "Teacher does". Do not pad to make counts match, and never drop or combine blocks to shrink them.',
    '- Curriculum context — theme, vocabulary, grammar, outcomes — shapes how an exercise is written. It never adds one.',
    `- template_anchor is the heading text in the template that the exercise fills, or null when there is no template or no matching heading.`,
    `- image_count is how many images the exercise needs. The TOTAL image_count across all specs MUST NOT exceed ${MAX_TOTAL_IMAGES}.`,
    '- position is the 1-based order of the exercise on the worksheet.',
    '- source is "generate" to write fresh, "reuse" to point at an existing bank resource, or "adapt" to adjust one; set resource_id only for reuse/adapt, otherwise null.',
    '',
    'Return ONLY the JSON object with a "specs" array. No prose, no markdown fence.',
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

/** Parse + validate the model reply into a re-sequenced spec list. */
function parseSpecs(text: string, exerciseTypes: Set<string>): ExerciseSpec[] {
  let raw = text;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) raw = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WorksheetPlanError('Model did not return valid JSON.', 502);
  }

  const specsRaw = (parsed as { specs?: unknown })?.specs;
  if (!Array.isArray(specsRaw)) {
    throw new WorksheetPlanError('Model JSON did not contain a "specs" array.', 502);
  }

  const heights = new Set(['short', 'medium', 'tall']);
  const sources = new Set(['generate', 'reuse', 'adapt']);

  // Re-sequence positions to a contiguous 1..n by returned order, so the
  // DEFERRABLE unique (lesson_plan_id, position) constraint always holds
  // regardless of what positions the model chose.
  return specsRaw.map((s, i): ExerciseSpec => {
    const o = (s ?? {}) as Record<string, unknown>;
    const exercise_type = typeof o.exercise_type === 'string' ? o.exercise_type : '';
    if (!exerciseTypes.has(exercise_type)) {
      throw new WorksheetPlanError('Model returned an unknown exercise_type.', 502);
    }
    const height = typeof o.estimated_height === 'string' && heights.has(o.estimated_height)
      ? (o.estimated_height as ExerciseSpec['estimated_height'])
      : 'medium';
    const source = typeof o.source === 'string' && sources.has(o.source)
      ? (o.source as ExerciseSpec['source'])
      : 'generate';
    const imageCount =
      typeof o.image_count === 'number' && Number.isFinite(o.image_count)
        ? Math.max(0, Math.trunc(o.image_count))
        : 0;
    return {
      position: i + 1,
      exercise_type,
      title: typeof o.title === 'string' ? o.title : '',
      brief: typeof o.brief === 'string' ? o.brief : '',
      estimated_height: height,
      source,
      resource_id: typeof o.resource_id === 'string' && o.resource_id.trim() ? o.resource_id : null,
      image_count: imageCount,
      template_anchor:
        typeof o.template_anchor === 'string' && o.template_anchor.trim()
          ? o.template_anchor
          : null,
    };
  });
}

/**
 * Plan the worksheet for a lesson. Composes the worksheet_builder context stack,
 * calls Claude once with a schema whose exercise_type enum is the live tag
 * vocabulary, and returns the parsed, re-sequenced specs plus the provenance the
 * route stamps onto each skeleton row.
 */
export async function planWorksheet(context: WorksheetPlanContext): Promise<WorksheetPlanResult> {
  if (context.exerciseTypes.length === 0) {
    throw new WorksheetPlanError('No exercise_type vocabulary is configured.', 502);
  }

  let client: Anthropic;
  try {
    client = getWorksheetClient();
  } catch (err) {
    throw new WorksheetPlanError(
      err instanceof Error ? err.message : 'ANTHROPIC_API_KEY_WORKSHEET is not configured.',
      503,
    );
  }

  let composed: Awaited<ReturnType<typeof composeContextStack>>;
  try {
    composed = await composeContextStack({ tool: 'worksheet_builder', subjectId: context.subjectId });
  } catch (err) {
    // Fail closed: surface the composer's "not configured" as a clean 503, not a 500.
    if (err instanceof ContextStackError) throw new WorksheetPlanError(err.message, err.status);
    throw err;
  }
  const { system, docsUsed } = composed;
  logAiCompose({
    route: '/api/worksheet/plan',
    tool: 'worksheet_builder',
    subjectName: null,
    subjectId: context.subjectId,
    subjectResolution: context.subjectId ? 'present' : 'absent',
    docsUsed,
  });

  const userPrompt = buildUserPrompt(context);

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
      output_config: {
        format: { type: 'json_schema', schema: buildResponseSchema(context.exerciseTypes) },
      },
    });
  } catch (err) {
    const status =
      err instanceof Anthropic.APIError && typeof err.status === 'number' ? err.status : 502;
    throw new WorksheetPlanError(
      `Claude request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      status >= 500 ? 502 : status,
    );
  }

  const specs = parseSpecs(extractText(message), new Set(context.exerciseTypes));
  return { specs, docsUsed, model: MODEL, promptHash: promptHash(userPrompt) };
}
