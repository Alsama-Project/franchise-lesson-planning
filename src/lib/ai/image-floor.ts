import 'server-only';

/**
 * The IMAGE FLOOR — the non-negotiable base of the worksheet-image generation
 * prompt.
 *
 * This is the ONE thing the layered context stack (see `@/lib/ai/context-stack`)
 * cannot override. The ladder — org → academic → subject → tool — carries all the
 * *steerable* style guidance (see the placeholder seeded in migration 0068); this
 * floor sits beneath it and overrides all of it, because these lines are
 * safeguarding red lines and the visual contract the print path depends on.
 *
 * It lives in code, NOT in an uploaded document, precisely so a bad or
 * contradictory upload can never strip it. It is wired into `floorForTool`
 * (`@/lib/ai/floor`) so `composeContextStack` appends it LAST, under the FLOOR
 * header, as the highest-authority section — single-sourced from here.
 *
 * STYLE_VERSION participates in the image cache key
 * (`sha256(normalise(brief) + ':' + STYLE_VERSION)`), so bumping it when the floor
 * or house style changes materially invalidates every cached image and forces a
 * fresh generation.
 */

/** Bump when the floor / house style changes enough to warrant re-generating. */
export const STYLE_VERSION = 'wsimg-v1';

/** The image floor: illustration style, Levantine context, and the absolute
 *  safeguarding red lines. Appended last (highest authority) by the composer. */
export const IMAGE_FLOOR = `IMAGE FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.

STYLE:
- Flat illustration: clean, vector-style line art. Never photorealistic, never a 3D render.

CONTEXT:
- Ground people, dress, food, streets, and objects in a Levantine, Beirut-appropriate setting. Do not default to Western or Gulf visual cues.

SAFEGUARDING (absolute):
- No identifiable real people — no public figures, no recognisable individuals.
- No military, no weapons, no uniforms of any kind.
- No religious iconography.
- No distress, injury, blood, or scenes of harm.`;
