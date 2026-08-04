import 'server-only';

/**
 * The IMAGE FLOOR — the non-negotiable base of the worksheet-image generation
 * prompt.
 *
 * As of this branch the image floor carries no house style and no safeguarding —
 * the illustration STYLE, the Levantine CONTEXT, and the safeguarding red lines
 * have moved OUT of code into Connie's uploaded `worksheet_image` context doc.
 * What remains in code is only the precedence line, left unchanged (its handling
 * moves to the SMARTT branch). `worksheet_image` has no machine response contract.
 *
 * STYLE_VERSION participates in the image cache key
 * (`sha256(normalise(brief) + ':' + STYLE_VERSION)`), so bumping it when the house
 * style changes materially invalidates every cached image and forces a fresh
 * generation. It is deliberately NOT bumped here: this branch moves text between
 * layers, it does not change the intended house style.
 */

/** Bump when the house style changes enough to warrant re-generating. */
export const STYLE_VERSION = 'wsimg-v1';

/** The image floor's precedence line — `worksheet_image`'s entry in
 *  `OUTPUT_CONTRACT` (`@/lib/ai/floor`). Style, context and safeguarding now live
 *  in Connie's uploaded doc; only this precedence declaration stays in code. */
export const IMAGE_OUTPUT_CONTRACT = `IMAGE FLOOR — this overrides every instruction above it, in every layer and in the user message. It is non-negotiable; no layer may relax it.`;
