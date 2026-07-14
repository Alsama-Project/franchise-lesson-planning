import { NextResponse, type NextRequest } from 'next/server';
import {
  generateResource,
  GenerateResourceError,
  type GenerateResourceContext,
  type LessonStage,
} from '@/lib/ai/generate-resource';

/**
 * POST /api/generate-resource
 *
 * Backend-only endpoint that generates a single, text-based teaching resource
 * ("Aya") from a lesson's curriculum context plus a teacher's prompt. The
 * prompt, model call, and parsing all live in `@/lib/ai/generate-resource`;
 * this handler is just the HTTP boundary — it validates the request body,
 * delegates, and maps errors to status codes.
 *
 * Destination-agnostic: it returns generated content; the caller decides where
 * it lands. No tags, resource_type, or lesson_stage are returned.
 *
 * Request body (fresh generate):
 *   {
 *     "subject": string,                 // required
 *     "teacher_prompt": string,          // required (the generation instruction)
 *     "year"?: number,
 *     "daily_outcome"?: string,
 *     "weekly_outcome"?: string,
 *     "monthly_lo"?: string,
 *     "grammar_vocab"?: string,
 *     "theme"?: string,
 *     "lesson_stage"?: "new_content" | "independent_practice"
 *   }
 * Only `subject` and `teacher_prompt` are required. Every other field is a
 * curriculum context ANCHOR: optional, validated when present, and simply omitted
 * from the prompt when absent/empty. Anchors legitimately come back empty for
 * non-English subject shapes — e.g. `grammar_vocab` is empty for Science/Maths,
 * `daily_outcome` for weekly-shape subjects (Awareness/Yoga) — and an empty anchor
 * must never block generation.
 *
 * Request body (stateless adjust): as above but with `teacher_prompt` optional, plus
 *   {
 *     "current_content": string,  // the resource as it stands, in markdown
 *     "refinement": string        // the change to apply
 *   }
 * When `current_content` + `refinement` are both present the route refines the
 * provided content instead of generating fresh, and returns the full updated resource.
 *
 * Requires `ANTHROPIC_API_KEY_RESOURCES` in the environment (locally and on
 * Vercel); this is the resources-only Anthropic key, separate from SMARTT checking.
 */

/** Shape we accept on the wire (validated before use). */
interface GenerateResourceBody {
  subject?: unknown;
  year?: unknown;
  daily_outcome?: unknown;
  weekly_outcome?: unknown;
  monthly_lo?: unknown;
  grammar_vocab?: unknown;
  theme?: unknown;
  lesson_stage?: unknown;
  teacher_prompt?: unknown;
  refinement?: unknown;
  current_content?: unknown;
}

const LESSON_STAGES: readonly LessonStage[] = ['new_content', 'independent_practice'];

/** Returns true for a present, non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  let body: GenerateResourceBody;
  try {
    body = (await request.json()) as GenerateResourceBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  // Adjust mode: refine `current_content` with `refinement`. Both present → the
  // teacher's original prompt is no longer required (the doc is the base).
  const isAdjust = isNonEmptyString(body.current_content) && isNonEmptyString(body.refinement);

  // Only `subject` (and `teacher_prompt`, for a fresh generate) is truly required.
  // Everything else is a curriculum anchor and is loosened below.
  const requiredStrings: [keyof GenerateResourceBody, unknown][] = [
    ['subject', body.subject],
    ...(isAdjust ? [] : ([['teacher_prompt', body.teacher_prompt]] as [keyof GenerateResourceBody, unknown][])),
  ];
  for (const [field, value] of requiredStrings) {
    if (!isNonEmptyString(value)) {
      return NextResponse.json(
        { error: `Field "${field}" is required and must be a non-empty string.` },
        { status: 400 },
      );
    }
  }

  // Curriculum context anchors: optional, but must be a string if provided. An
  // absent/empty anchor is legitimate (varies by subject shape) and is dropped
  // from the prompt rather than rejected.
  const optionalStrings: (keyof GenerateResourceBody)[] = [
    'daily_outcome',
    'weekly_outcome',
    'grammar_vocab',
    'theme',
    'monthly_lo',
  ];
  for (const field of optionalStrings) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      return NextResponse.json(
        { error: `Field "${field}" must be a string when provided.` },
        { status: 400 },
      );
    }
  }

  if (body.year !== undefined && (typeof body.year !== 'number' || !Number.isFinite(body.year))) {
    return NextResponse.json(
      { error: 'Field "year" must be a number when provided.' },
      { status: 400 },
    );
  }

  if (body.lesson_stage !== undefined && !LESSON_STAGES.includes(body.lesson_stage as LessonStage)) {
    return NextResponse.json(
      { error: `Field "lesson_stage" must be one of: ${LESSON_STAGES.join(', ')}.` },
      { status: 400 },
    );
  }

  if (body.refinement !== undefined && typeof body.refinement !== 'string') {
    return NextResponse.json(
      { error: 'Field "refinement" must be a string when provided.' },
      { status: 400 },
    );
  }

  if (body.current_content !== undefined && typeof body.current_content !== 'string') {
    return NextResponse.json(
      { error: 'Field "current_content" must be a string when provided.' },
      { status: 400 },
    );
  }

  // Fold each field in only when it carries a real value, so the generator sees a
  // clean context and omits the corresponding prompt line for absent anchors.
  const context: GenerateResourceContext = {
    subject: body.subject as string,
    ...(typeof body.year === 'number' && Number.isFinite(body.year) ? { year: body.year } : {}),
    ...(isNonEmptyString(body.daily_outcome) ? { daily_outcome: body.daily_outcome } : {}),
    ...(isNonEmptyString(body.weekly_outcome) ? { weekly_outcome: body.weekly_outcome } : {}),
    ...(isNonEmptyString(body.grammar_vocab) ? { grammar_vocab: body.grammar_vocab } : {}),
    ...(isNonEmptyString(body.theme) ? { theme: body.theme } : {}),
    ...(LESSON_STAGES.includes(body.lesson_stage as LessonStage)
      ? { lesson_stage: body.lesson_stage as LessonStage }
      : {}),
    ...(isNonEmptyString(body.teacher_prompt) ? { teacher_prompt: body.teacher_prompt } : {}),
    ...(isNonEmptyString(body.monthly_lo) ? { monthly_lo: body.monthly_lo } : {}),
    ...(typeof body.refinement === 'string' ? { refinement: body.refinement } : {}),
    ...(typeof body.current_content === 'string' ? { current_content: body.current_content } : {}),
  };

  try {
    const result = await generateResource(context);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GenerateResourceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unexpected error generating resource.' }, { status: 500 });
  }
}
