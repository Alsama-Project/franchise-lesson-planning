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
 * SPLIT (Phase 1): the floor is now exported in two parts — the always-in-code
 * visual/output CONTRACT (`IMAGE_OUTPUT_CONTRACT`: the override line, STYLE and
 * CONTEXT) and the SAFEGUARDING block (`IMAGE_SAFEGUARDING`). The safeguarding
 * block is the code FALLBACK for the editable `ai_context_doc` safeguarding row
 * (layer = 'safeguarding', tool = 'worksheet_image'); it is permanent, not
 * scaffolding. `IMAGE_FLOOR` remains the reassembled whole (contract + safeguarding),
 * byte-identical to before the split, for any consumer that wants the full floor.
 *
 * STYLE_VERSION participates in the image cache key
 * (`sha256(normalise(brief) + ':' + STYLE_VERSION)`), so bumping it when the floor
 * or house style changes materially invalidates every cached image and forces a
 * fresh generation.
 */

/** Bump when the floor / house style changes enough to warrant re-generating. */
export const STYLE_VERSION = 'wsimg-v1';

/** The image OUTPUT CONTRACT — the override line, illustration style, and Levantine
 *  context. Always in code; never editable. `worksheet_image`'s entry in
 *  `OUTPUT_CONTRACT` (`@/lib/ai/floor`). */
export const IMAGE_OUTPUT_CONTRACT = `IMAGE FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.

STYLE:
- Flat illustration: clean, vector-style line art. Never photorealistic, never a 3D render.

CONTEXT:
- Ground people, dress, food, streets, and objects in a Levantine, Beirut-appropriate setting. Do not default to Western or Gulf visual cues.`;

/** The image SAFEGUARDING block — the absolute red lines. Code FALLBACK for the
 *  editable safeguarding doc (`worksheet_image`); permanent, not scaffolding. */
export const IMAGE_SAFEGUARDING = `SAFEGUARDING (absolute):
- No identifiable real people — no public figures, no recognisable individuals.
- No military, no weapons, no uniforms of any kind.
- No religious iconography.
- No distress, injury, blood, or scenes of harm.`;

/** The full image floor: contract + safeguarding, in that order. Byte-identical to
 *  the pre-split constant. Appended last (highest authority) by the composer. */
export const IMAGE_FLOOR = `${IMAGE_OUTPUT_CONTRACT}

${IMAGE_SAFEGUARDING}`;
