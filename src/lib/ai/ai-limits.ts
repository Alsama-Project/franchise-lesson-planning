// Limits on AI use (H8). Pure values and helpers, so they are unit-tested directly;
// the route-side guard is src/lib/ai/usage-guard.ts.

export type AiFeature = 'objective_check' | 'resource' | 'worksheet_plan' | 'worksheet_exercise' | 'worksheet_image';

/**
 * Uses per user per day (UTC). Generous for normal planning — a teacher planning a
 * full week stays well under them — but they stop one account looping paid calls.
 * Override per feature with AI_DAILY_LIMIT_<FEATURE>, e.g. AI_DAILY_LIMIT_WORKSHEET_IMAGE=50.
 */
export const DEFAULT_DAILY_LIMITS: Record<AiFeature, number> = {
  objective_check: 150,
  resource: 60,
  worksheet_plan: 60,
  worksheet_exercise: 250,
  worksheet_image: 120,
};

/** Upper bound on the text a user can put into one AI request (characters). Server-loaded
 *  plan content is not counted, so a long plan is never refused. */
export const MAX_AI_INPUT_CHARS = 30_000;

export function dailyLimit(feature: AiFeature, env: Record<string, string | undefined> = process.env): number {
  const raw = env[`AI_DAILY_LIMIT_${feature.toUpperCase()}`];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_LIMITS[feature];
}

/** Total characters of the request values that reach the model (objects as JSON). */
export function inputSize(values: unknown[]): number {
  let total = 0;
  for (const v of values) {
    if (v === undefined || v === null) continue;
    total += typeof v === 'string' ? v.length : JSON.stringify(v).length;
  }
  return total;
}
