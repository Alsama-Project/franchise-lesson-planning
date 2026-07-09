// Client-safe types and helpers for the AI objective check.
//
// The server-side checker (`@/lib/ai/check-objective`) pulls in the Anthropic
// SDK, so it must never be imported into a Client Component. This module mirrors
// the wire shape returned by `POST /api/check-objective` and provides a typed
// fetch helper + runtime guard the editor can use without touching the SDK.

/** How a single SMARTT letter scored. */
export type LetterStatus = 'strong' | 'needs work';

/** Assessment of one of the six SMARTT letters. */
export interface SmarttLetterAssessment {
  status: LetterStatus;
  note: string;
}

/** The six canonical SMARTT dimension keys (the result's per-letter fields). */
export type SmarttDimensionKey =
  | 'specific'
  | 'measurable'
  | 'achievable'
  | 'relevant'
  | 'time_bound'
  | 'tangible';

/**
 * One overall suggestion, tagged with the single SMARTT dimension it addresses so
 * the editor can open each feedback bullet with that dimension in bold (item 4).
 */
export interface SmarttSuggestion {
  /** Which SMARTT dimension this note relates to. */
  dimension: SmarttDimensionKey;
  /** The teacher-facing suggestion text. */
  note: string;
}

/** Structured result of checking an objective (mirrors the API response). */
export interface ObjectiveCheckResult {
  specific: SmarttLetterAssessment;
  measurable: SmarttLetterAssessment;
  achievable: SmarttLetterAssessment;
  relevant: SmarttLetterAssessment;
  time_bound: SmarttLetterAssessment;
  tangible: SmarttLetterAssessment;
  suggestions: SmarttSuggestion[];
  improved_objective: string;
}

/** The six SMARTT letters, in display order, keyed to the result shape. */
export const SMARTT_LETTERS: { key: SmarttDimensionKey; label: string }[] = [
  { key: 'specific', label: 'Specific' },
  { key: 'measurable', label: 'Measurable' },
  { key: 'achievable', label: 'Achievable' },
  { key: 'relevant', label: 'Relevant' },
  { key: 'time_bound', label: 'Time-bound' },
  { key: 'tangible', label: 'Tangible' },
];

/** Display label for a SMARTT dimension key (e.g. `time_bound` → "Time-bound"). */
export function smarttDimensionLabel(key: SmarttDimensionKey): string {
  return SMARTT_LETTERS.find((l) => l.key === key)?.label ?? key;
}

/** The valid SMARTT dimension keys, for runtime validation. */
const SMARTT_DIMENSION_KEYS: readonly SmarttDimensionKey[] = SMARTT_LETTERS.map((l) => l.key);

function isSuggestion(value: unknown): value is SmarttSuggestion {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.note === 'string' &&
    SMARTT_DIMENSION_KEYS.includes(v.dimension as SmarttDimensionKey)
  );
}

/** Surrounding lesson context that sharpens the check. */
export interface ObjectiveCheckRequestContext {
  dailyOutcome?: string;
  grammarVocab?: string;
  theme?: string;
  year?: number;
}

function isLetter(value: unknown): value is SmarttLetterAssessment {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.status === 'strong' || v.status === 'needs work') && typeof v.note === 'string';
}

/** Runtime guard for a parsed/stored {@link ObjectiveCheckResult}. */
export function isObjectiveCheckResult(value: unknown): value is ObjectiveCheckResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const letters: (keyof ObjectiveCheckResult)[] = [
    'specific',
    'measurable',
    'achievable',
    'relevant',
    'time_bound',
    'tangible',
  ];
  if (!letters.every((key) => isLetter(v[key]))) return false;
  if (!Array.isArray(v.suggestions) || !v.suggestions.every(isSuggestion)) {
    return false;
  }
  return typeof v.improved_objective === 'string';
}

/** Thrown by {@link requestObjectiveCheck} when the check cannot be completed. */
export class ObjectiveCheckRequestError extends Error {}

/**
 * A single SMARTT letter resolved mid-stream, delivered as a `pill` SSE frame so
 * the editor can flip that pill from evaluating → met/unmet the moment its object
 * closes. Liveness only — the final validated result is authoritative.
 */
export interface SmarttPillFrame {
  key: SmarttDimensionKey;
  status: LetterStatus;
  note: string;
}

function isPillFrame(value: unknown): value is SmarttPillFrame {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    SMARTT_DIMENSION_KEYS.includes(v.key as SmarttDimensionKey) &&
    (v.status === 'strong' || v.status === 'needs work') &&
    typeof v.note === 'string'
  );
}

/**
 * POST the objective (and optional context) to `/api/check-objective` and read
 * the streamed assessment. Each `pill` frame is handed to {@link onPill} as it
 * arrives (progressive reveal); the promise resolves with the final validated
 * {@link ObjectiveCheckResult}. Throws {@link ObjectiveCheckRequestError} with a
 * teacher-facing message on any error frame, transport failure, or malformed reply.
 *
 * Pre-flight failures (bad body, empty objective, missing key) still come back as
 * a JSON error with a status code, and are surfaced the same way as before.
 */
export async function requestObjectiveCheck(
  objective: string,
  context?: ObjectiveCheckRequestContext,
  onPill?: (frame: SmarttPillFrame) => void,
): Promise<ObjectiveCheckResult> {
  let res: Response;
  try {
    res = await fetch('/api/check-objective', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective, context }),
    });
  } catch {
    throw new ObjectiveCheckRequestError('Could not reach the objective checker. Try again.');
  }

  const contentType = res.headers.get('content-type') ?? '';

  // Pre-flight errors (and any non-stream reply) come back as JSON, as before.
  if (!res.ok || !contentType.includes('text/event-stream') || !res.body) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message =
        body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
          ? (body as { error: string }).error
          : 'The objective check failed. Try again.';
      throw new ObjectiveCheckRequestError(message);
    }
    // 200 but not a stream: tolerate a plain JSON result if the shape validates.
    if (isObjectiveCheckResult(body)) return body;
    throw new ObjectiveCheckRequestError('The objective check returned an unexpected result.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let result: ObjectiveCheckResult | null = null;
  let errorMessage: string | null = null;

  const handleFrame = (raw: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length === 0) return;
    let data: unknown;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }
    if (event === 'pill') {
      if (onPill && isPillFrame(data)) onPill(data);
    } else if (event === 'result') {
      if (isObjectiveCheckResult(data)) result = data;
      else errorMessage = 'The objective check returned an unexpected result.';
    } else if (event === 'error') {
      errorMessage =
        data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : 'The objective check failed. Try again.';
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (frame.trim().length > 0) handleFrame(frame);
      }
    }
  } catch {
    throw new ObjectiveCheckRequestError('The objective check was interrupted. Try again.');
  }
  if (buf.trim().length > 0) handleFrame(buf); // flush a trailing frame without \n\n

  if (errorMessage) throw new ObjectiveCheckRequestError(errorMessage);
  if (!result) throw new ObjectiveCheckRequestError('The objective check did not complete. Try again.');
  return result;
}
