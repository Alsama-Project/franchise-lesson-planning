import { NextResponse, type NextRequest } from 'next/server';
import {
  openObjectiveCheckStream,
  finalizeStreamedCheck,
  createLetterScanner,
  ObjectiveCheckError,
  type ObjectiveCheckContext,
} from '@/lib/ai/check-objective';

/**
 * POST /api/check-objective
 *
 * Backend-only endpoint that runs Claude against a teacher's SMARTT lesson
 * objective and streams structured, per-letter feedback. The prompt, model call,
 * validation, and the per-letter scanner all live in `@/lib/ai/check-objective`;
 * this handler is the HTTP boundary — it validates the request body, then relays
 * the Anthropic stream to the browser as Server-Sent Events.
 *
 * Transport: a `text/event-stream` response with three frame types —
 *   - `pill`   {key,status,note}  — a SMARTT letter resolved as its object closes
 *                                    in the accumulating JSON (liveness only).
 *   - `result` <ObjectiveCheckResult> — the validated result at stream end. This
 *                                    is authoritative and sets all six pills.
 *   - `error`  {error,status}     — a late failure (validation/API) once we've
 *                                    already committed to a 200 stream.
 * Pre-flight failures (bad body, empty objective, missing key) are returned as a
 * plain JSON error with the same status codes as before, before any stream opens.
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

  // Pre-flight (missing key / empty input) throws before any stream opens, so it
  // still maps to the same HTTP status as before. Once streaming starts we've
  // committed to a 200 SSE response; late failures arrive as an `error` frame.
  let stream: Awaited<ReturnType<typeof openObjectiveCheckStream>>;
  try {
    stream = await openObjectiveCheckStream(body.objective, parseContext(body.context));
  } catch (err) {
    if (err instanceof ObjectiveCheckError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unexpected error checking objective.' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const scanner = createLetterScanner();

  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // TEMPORARY timing instrumentation (remove with the usage log after George
      // reads it): does structured-output decoding actually stream deltas across
      // the wall clock (progressive reveal works) or cluster at the very end
      // (buffering — the SSE build wins nothing on its own)?
      const t0 = Date.now();
      let firstDeltaMs: number | null = null;
      let lastDeltaMs = 0;
      let deltaCount = 0;
      let buffer = '';
      let scannerOk = true;

      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            if (firstDeltaMs === null) firstDeltaMs = Date.now() - t0;
            lastDeltaMs = Date.now() - t0;
            deltaCount++;
            buffer += event.delta.text;
            // Liveness frames. If the scanner ever throws, disable it for the rest
            // of the stream — pills simply stay pulsing until the result frame.
            if (scannerOk && !scanner.done()) {
              try {
                for (const frame of scanner.scan(buffer)) send('pill', frame);
              } catch {
                scannerOk = false;
              }
            }
          }
        }

        const message = await stream.finalMessage();
        console.log(
          `[check-objective] stream firstDeltaMs=${firstDeltaMs} lastDeltaMs=${lastDeltaMs} deltaCount=${deltaCount} totalMs=${Date.now() - t0}`,
        );
        console.log('[check-objective] usage', message.usage);

        // Authoritative: the validated result sets all six pills, resolving any
        // stragglers the scanner missed. Unchanged floor — throws 502 on malformed.
        const result = finalizeStreamedCheck(message);
        send('result', result);
      } catch (err) {
        const status =
          err instanceof ObjectiveCheckError && typeof err.status === 'number' ? err.status : 502;
        const message =
          err instanceof Error ? err.message : 'Unexpected error checking objective.';
        send('error', { error: message, status });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
