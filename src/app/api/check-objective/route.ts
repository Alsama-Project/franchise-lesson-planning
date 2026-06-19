import { NextResponse, type NextRequest } from 'next/server';
import {
  checkObjective,
  ObjectiveCheckError,
  type ObjectiveCheckContext,
} from '@/lib/ai/check-objective';

/**
 * POST /api/check-objective
 *
 * Backend-only endpoint that runs Claude against a teacher's SMARTT lesson
 * objective and returns structured, per-letter feedback. The prompt, model call,
 * and parsing all live in `@/lib/ai/check-objective`; this handler is just the
 * HTTP boundary — it validates the request body, delegates, and maps errors to
 * status codes.
 *
 * Request body:
 *   {
 *     "objective": string,
 *     "context"?: {
 *       "dailyOutcome"?: string,
 *       "grammarVocab"?: string,
 *       "theme"?: string,
 *       "year"?: number
 *     }
 *   }
 *
 * Requires `ANTHROPIC_API_KEY` in the environment (locally and on Vercel).
 */

/** Shape we accept on the wire (validated before use). */
interface CheckObjectiveBody {
  objective?: unknown;
  context?: unknown;
}

/** Coerce an unknown `context` value into a typed, sanitised context object. */
function parseContext(value: unknown): ObjectiveCheckContext | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const context: ObjectiveCheckContext = {};
  if (typeof v.dailyOutcome === 'string') context.dailyOutcome = v.dailyOutcome;
  if (typeof v.grammarVocab === 'string') context.grammarVocab = v.grammarVocab;
  if (typeof v.theme === 'string') context.theme = v.theme;
  if (typeof v.year === 'number' && Number.isFinite(v.year)) context.year = v.year;
  return Object.keys(context).length > 0 ? context : undefined;
}

export async function POST(request: NextRequest) {
  let body: CheckObjectiveBody;
  try {
    body = (await request.json()) as CheckObjectiveBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (typeof body.objective !== 'string' || body.objective.trim().length === 0) {
    return NextResponse.json(
      { error: 'Field "objective" is required and must be a non-empty string.' },
      { status: 400 },
    );
  }

  try {
    const result = await checkObjective(body.objective, parseContext(body.context));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ObjectiveCheckError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unexpected error checking objective.' }, { status: 500 });
  }
}
