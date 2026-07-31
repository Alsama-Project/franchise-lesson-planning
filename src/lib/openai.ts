import 'server-only';
import OpenAI from 'openai';

/**
 * Single source of truth for the OpenAI client.
 *
 * Worksheet image generation is the only OpenAI usage in the app, and it has its
 * OWN key so its cost can be tracked separately in the OpenAI dashboard:
 *   - `OPENAI_API_KEY_IMAGES` → worksheet image generation only
 *     ({@link getImagesClient}, used by `POST /api/worksheet/image`).
 *
 * Backend-only (`server-only`): the key is a secret and must never reach the
 * browser. The client is memoized so we build one per key per process.
 *
 * A missing key throws immediately with a clear message, so a misconfigured deploy
 * fails loudly at first use instead of silently proceeding. (Mirrors the posture of
 * `src/lib/anthropic.ts`.)
 */

function requireKey(name: 'OPENAI_API_KEY_IMAGES'): string {
  const key = process.env[name];
  if (!key) {
    throw new Error(
      `${name} is not configured. This OpenAI key is required for worksheet image ` +
        `generation. Copy .env.example to .env.local (or set it in the Vercel ` +
        `project env) and fill it in.`,
    );
  }
  return key;
}

let images: OpenAI | undefined;

/** OpenAI client for worksheet image generation. Uses `OPENAI_API_KEY_IMAGES` only. */
export function getImagesClient(): OpenAI {
  return (images ??= new OpenAI({ apiKey: requireKey('OPENAI_API_KEY_IMAGES') }));
}
