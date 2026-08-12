import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getWorksheetClient } from '@/lib/anthropic';
import { composeContextStack, logAiCompose, ContextStackError, type ContextDocUsed } from './context-stack';
import { anchorLines, promptHash, type CurriculumAnchors } from './worksheet-shared';
import type { ExerciseSpec, WorksheetItem } from '@/types/worksheet-exercise';

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
  /** The exercise's CURRENT body markdown — the base a teacher-steered regenerate
   *  revises (the adjust pattern). Null/absent for a plain regenerate. */
  currentBodyMd?: string | null;
  /** An optional teacher instruction to apply when regenerating (e.g. "make it
   *  simpler", "use market vocabulary"). Absent/empty regenerates plainly. */
  instruction?: string | null;
}

/**
 * One image slot the MODEL authors, per `[Picture: …]` marker, in marker order.
 * The model authors TWO fields:
 *   • `subject` — the plain literal thing depicted (1-4 words), the deduplication
 *     key the image route hashes on. Its contract lives in the worksheet-builder
 *     FLOOR (IMAGE SLOTS) so it can never be edited away into a layer doc.
 *   • `brief` — the rich visual description that becomes the image prompt.
 * The mechanical fields (`slot_id`, `status`, `storage_path`) are added by the route.
 */
export interface AuthoredImageSlot {
  subject: string;
  brief: string;
}

/** The generator's result plus the provenance the route stamps back onto the row. */
export interface WorksheetExerciseResult {
  bodyMd: string;
  /** The model-authored briefs, in marker order (see {@link AuthoredImageSlot}). */
  imageSlots: AuthoredImageSlot[];
  /** The model's declared structured items, or null when it declared none (the markdown
   *  path). Compile reads these to pick a composition rule; see `worksheet-compose`. */
  items: WorksheetItem[] | null;
  /** The exercise-level shared passage (rule 8), or null. */
  passage: string | null;
  docsUsed: ContextDocUsed[];
  model: string;
  promptHash: string;
}

/**
 * The model returns the exercise body markdown AND one brief per `[Picture: …]`
 * marker, in marker order. The floor governs the body's shape and the brief's
 * content contract; the schema here only pins the structure.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    body_md: { type: 'string' },
    image_slots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subject: { type: 'string' },
          brief: { type: 'string' },
        },
        required: ['subject', 'brief'],
      },
    },
    // OPTIONAL structured items — the composition contract. When present, compile reads
    // the item shape and applies the first matching rule; when absent, the markdown path
    // is unchanged. Every field is optional: an item carries only what its shape needs.
    // The FLOOR governs which fields mean what; the schema pins only the structure.
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          picture: { type: 'string' },
          answer: { type: 'string' },
          sentence: { type: 'string' },
          left: { type: 'string' },
          right: { type: 'string' },
          group: { type: 'string' },
          speaker: { type: 'string' },
          reply: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          prompt: { type: 'string' },
          isExample: { type: 'boolean' },
          trueFalse: { type: 'boolean' },
          lines: { type: 'integer' },
        },
      },
    },
    // OPTIONAL exercise-level reading passage shared by every item (rule 8) — a sibling
    // of items[], never a per-item field.
    passage: { type: 'string' },
  },
  required: ['body_md', 'image_slots'],
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

  // Adjust mode: when the teacher gave an instruction, revise the CURRENT body rather
  // than starting over — so "make it simpler" has something to be simpler than. Mirrors
  // the /api/generate-resource current_content + refinement pattern.
  const instruction = context.instruction?.trim();
  if (instruction) {
    const current = context.currentBodyMd?.trim();
    lines.push(
      '',
      'REVISE THE CURRENT VERSION below rather than starting over: keep everything that works and change only what the teacher asks. Keep the same [Picture: …] markers unless the change requires otherwise.',
      '',
      'Current version:',
      current && current.length > 0 ? current : '(the current version is empty)',
      '',
      `Teacher’s change: ${instruction}`,
    );
  }

  lines.push(
    '',
    'Write only the exercise itself — a heading is optional; no teacher notes, no answer key, no commentary.',
    '',
    'IMAGES — "image_slots": one entry per picture (per [Picture: …] marker, or per distinct item picture when using items), in first-appearance order. Each entry has "subject" and "brief" — follow the IMAGE SLOTS contract above.',
    '',
    'STRUCTURE — prefer "items": when this exercise\'s content repeats, declare it in the optional "items" array and place a single [Items] marker in body_md where the composed exercise sits, per the STRUCTURED ITEMS contract above. Omit "items" to write the exercise as markdown instead. "passage" is optional and top-level.',
    '',
    'Return ONLY the JSON object. Its required keys are "body_md" and "image_slots"; "items" and "passage" are optional. No prose, no markdown fence.',
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

/** Coerce one raw item object into a `WorksheetItem`, keeping only the fields present
 *  and well-typed. Unknown/empty fields are dropped so an item carries exactly what its
 *  shape needs — the rule dispatch reads presence, so a stray empty string must not
 *  count as "has this field". */
function parseItem(raw: unknown): WorksheetItem {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  const item: WorksheetItem = {};
  const picture = str(o.picture); if (picture) item.picture = picture;
  const answer = str(o.answer); if (answer) item.answer = answer;
  const sentence = str(o.sentence); if (sentence) item.sentence = sentence;
  const left = str(o.left); if (left) item.left = left;
  const right = str(o.right); if (right) item.right = right;
  const group = str(o.group); if (group) item.group = group;
  const speaker = str(o.speaker); if (speaker) item.speaker = speaker;
  const reply = str(o.reply); if (reply !== undefined) item.reply = reply;
  const prompt = str(o.prompt); if (prompt) item.prompt = prompt;
  if (Array.isArray(o.options)) {
    const opts = o.options.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
    if (opts.length) item.options = opts;
  }
  if (o.isExample === true) item.isExample = true;
  if (o.trueFalse === true) item.trueFalse = true;
  if (typeof o.lines === 'number' && Number.isFinite(o.lines) && o.lines > 0) item.lines = Math.floor(o.lines);
  return item;
}

/** Parse the model reply into the exercise body markdown + authored image slots + the
 *  optional structured items and shared passage. */
function parseReply(text: string): {
  bodyMd: string;
  imageSlots: AuthoredImageSlot[];
  items: WorksheetItem[] | null;
  passage: string | null;
} {
  let raw = text;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) raw = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WorksheetExerciseError('Model did not return valid JSON.', 502);
  }
  const obj = (parsed ?? {}) as {
    body_md?: unknown;
    image_slots?: unknown;
    items?: unknown;
    passage?: unknown;
  };
  if (typeof obj.body_md !== 'string' || obj.body_md.trim().length === 0) {
    throw new WorksheetExerciseError('Model JSON did not contain a non-empty "body_md".', 502);
  }
  const imageSlots: AuthoredImageSlot[] = Array.isArray(obj.image_slots)
    ? obj.image_slots.map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return {
          subject: typeof o.subject === 'string' ? o.subject.trim() : '',
          brief: typeof o.brief === 'string' ? o.brief.trim() : '',
        };
      })
    : [];
  // items[] is optional and additive: an absent (or empty) array → the markdown path,
  // null so the row carries nothing rather than an empty array.
  const parsedItems = Array.isArray(obj.items) ? obj.items.map(parseItem).filter((it) => Object.keys(it).length > 0) : [];
  const items = parsedItems.length > 0 ? parsedItems : null;
  const passage = typeof obj.passage === 'string' && obj.passage.trim().length > 0 ? obj.passage.trim() : null;
  return { bodyMd: obj.body_md, imageSlots, items, passage };
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

  let composed: Awaited<ReturnType<typeof composeContextStack>>;
  try {
    composed = await composeContextStack({ tool: 'worksheet_builder', subjectId: context.subjectId });
  } catch (err) {
    // Fail closed: surface the composer's "not configured" as a clean 503, not a 500.
    if (err instanceof ContextStackError) throw new WorksheetExerciseError(err.message, err.status);
    throw err;
  }
  const { system, docsUsed } = composed;
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

  const { bodyMd, imageSlots, items, passage } = parseReply(extractText(message));
  return { bodyMd, imageSlots, items, passage, docsUsed, model: MODEL, promptHash: promptHash(userPrompt) };
}
