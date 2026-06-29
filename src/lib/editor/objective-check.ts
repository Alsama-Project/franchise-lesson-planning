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
 * POST the objective (and optional context) to `/api/check-objective` and return
 * the structured assessment. Throws {@link ObjectiveCheckRequestError} with a
 * teacher-facing message on any non-OK response or malformed reply.
 */
export async function requestObjectiveCheck(
  objective: string,
  context?: ObjectiveCheckRequestContext,
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

  if (!isObjectiveCheckResult(body)) {
    throw new ObjectiveCheckRequestError('The objective check returned an unexpected result.');
  }
  return body;
}
