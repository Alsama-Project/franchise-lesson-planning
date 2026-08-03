import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getWorksheetClient } from '@/lib/anthropic';
import { composeContextStack, logAiCompose, type ContextDocUsed } from './context-stack';
import { anchorLines, promptHash, type CurriculumAnchors } from './worksheet-shared';
import type { ExerciseSpec } from '@/types/worksheet-exercise';

/**
 * Per-exercise worksheet GENERATOR service.
 *
 * Given one {@link ExerciseSpec} (taken from a skeleton row's `generation.spec`)
 * plus the lesson's curriculum context, it asks Claude to write the student-
 * facing content for that single exercise as `body_md`. One call, one exercise.
 * This is also the regenerate path — same spec, fresh content.
 *
 * Mirrors `@/lib/ai/generate-resource` for the route/lib split, the
 * `composeContextStack` call, the `output_config` json_schema, and the
 * `logAiCompose` observability. Uses the worksheet-only Anthropic client
 * ({@link getWorksheetClient}). Same LANGUAGE INVARIANT as the planner: content
 * language follows the subject, never the UI locale — no `next-intl` here.
 */

const MODEL = 'claude-sonnet-4-6';

/** Error thrown when generation cannot be completed. `status` is an HTTP status. */
export class WorksheetExerciseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'WorksheetExerciseError';
    this.status = status;
  }
}

/** Everything the generator needs — read + validated server-side by the route. */
export interface WorksheetExerciseContext {
  /** The plan's subject uuid — steers the context stack. */
  subjectId: string | null;
  /** The spec this exercise was planned from (source of truth). */
  spec: ExerciseSpec;
  /** The lesson's curriculum anchors (gated). */
  anchors: CurriculumAnchors | null;
}

/** The generator's result plus the provenance the route stamps back onto the row. */
export interface WorksheetExerciseResult {
  bodyMd: string;
  docsUsed: ContextDocUsed[];
  model: string;
  promptHash: string;
}

/** The model returns just the exercise body markdown; the floor governs its shape. */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    body_md: { type: 'string' },
  },
  required: ['body_md'],
} as const;

/** Build the user-turn prompt for one exercise. Marker/language rules live in the floor. */
function buildUserPrompt(context: WorksheetExerciseContext): string {
  const { spec } = context;
  const lines: string[] = [
    'TASK — write the student-facing content for ONE worksheet exercise, exactly as described below. Return it as "body_md".',
    '',
    'Exercise spec:',
    `- Title: ${spec.title}`,
    `- Type: ${spec.exercise_type}`,
    `- Brief: ${spec.brief}`,
    `- Approximate size: ${spec.estimated_height}`,
  ];

  if (spec.image_count > 0) {
    lines.push(
      `- Include exactly ${spec.image_count} image${spec.image_count === 1 ? '' : 's'}, each as a [Picture: …] marker alone on its own line.`,
    );
  } else {
    lines.push('- This exercise needs no images — do not add any [Picture: …] markers.');
  }

  const anchors = anchorLines(context.anchors);
  if (anchors.length > 0) {
    lines.push('', 'Curriculum context (anchors to respect):', ...anchors);
  }

  lines.push(
    '',
    'Write only the exercise itself — a heading is optional; no teacher notes, no answer key, no commentary.',
    'Return ONLY the JSON object with the key "body_md". No prose, no markdown fence.',
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

/** Parse the model reply into the exercise body markdown. */
function parseBodyMd(text: string): string {
  let raw = text;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) raw = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WorksheetExerciseError('Model did not return valid JSON.', 502);
  }
  const bodyMd = (parsed as { body_md?: unknown })?.body_md;
  if (typeof bodyMd !== 'string' || bodyMd.trim().length === 0) {
    throw new WorksheetExerciseError('Model JSON did not contain a non-empty "body_md".', 502);
  }
  return bodyMd;
}

/**
 * Generate (or regenerate) one worksheet exercise's `body_md`. Composes the
 * worksheet_builder context stack, calls Claude once, and returns the body plus
 * the provenance the route writes back onto the row.
 */
export async function generateExercise(
  context: WorksheetExerciseContext,
): Promise<WorksheetExerciseResult> {
  let client: Anthropic;
  try {
    client = getWorksheetClient();
  } catch (err) {
    throw new WorksheetExerciseError(
      err instanceof Error ? err.message : 'ANTHROPIC_API_KEY_WORKSHEET is not configured.',
      503,
    );
  }

  const { system, docsUsed } = await composeContextStack({
    tool: 'worksheet_builder',
    subjectId: context.subjectId,
  });
  logAiCompose({
    route: '/api/worksheet/exercise',
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
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    });
  } catch (err) {
    const status =
      err instanceof Anthropic.APIError && typeof err.status === 'number' ? err.status : 502;
    throw new WorksheetExerciseError(
      `Claude request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      status >= 500 ? 502 : status,
    );
  }

  const bodyMd = parseBodyMd(extractText(message));
  return { bodyMd, docsUsed, model: MODEL, promptHash: promptHash(userPrompt) };
}
