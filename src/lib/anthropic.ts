import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Single source of truth for Anthropic clients.
 *
 * The app splits its Anthropic usage across TWO API keys so cost can be tracked
 * per function in the Anthropic Console:
 *   - `ANTHROPIC_API_KEY_SMARTT`    → SMARTT objective checking only
 *     ({@link getSmarttClient}, used by `src/lib/ai/check-objective.ts`).
 *   - `ANTHROPIC_API_KEY_RESOURCES` → resource generation only
 *     ({@link getResourcesClient}, used by `src/lib/ai/generate-resource.ts`).
 *
 * Keys must NOT be shared or swapped between functions — that would defect the
 * per-function cost tracking. Each getter reads ONLY its own key.
 *
 * Backend-only (`server-only`): these keys bypass no RLS but are secrets and must
 * never reach the browser. Clients are memoized so we build one per key per
 * process.
 *
 * A missing key throws immediately with a clear message, so a misconfigured
 * deploy fails loudly at first use instead of silently falling back to the other
 * function's key (or to no key at all).
 */

function requireKey(name: 'ANTHROPIC_API_KEY_SMARTT' | 'ANTHROPIC_API_KEY_RESOURCES'): string {
  const key = process.env[name];
  if (!key) {
    throw new Error(
      `${name} is not configured. This Anthropic key is required and is not ` +
        `interchangeable with the other function's key. Copy .env.example to ` +
        `.env.local (or set it in the Vercel project env) and fill it in.`,
    );
  }
  return key;
}

let smartt: Anthropic | undefined;
let resources: Anthropic | undefined;

/** Anthropic client for SMARTT objective checking. Uses `ANTHROPIC_API_KEY_SMARTT` only. */
export function getSmarttClient(): Anthropic {
  return (smartt ??= new Anthropic({ apiKey: requireKey('ANTHROPIC_API_KEY_SMARTT') }));
}

/** Anthropic client for resource generation. Uses `ANTHROPIC_API_KEY_RESOURCES` only. */
export function getResourcesClient(): Anthropic {
  return (resources ??= new Anthropic({ apiKey: requireKey('ANTHROPIC_API_KEY_RESOURCES') }));
}
