// Shared geometry for the exercise card surface.
//
// The A4 page geometry is single-sourced from the document editor's theme
// (PAGE_WIDTH / PAGE_HEIGHT), so the card surface and the continuous editor sit on
// an identically-proportioned page. The estimated-height map turns a spec's coarse
// `short` / `medium` / `tall` into the three skeleton heights CD drew, so a
// skeleton reserves roughly the room its filled exercise will occupy and the page
// barely reflows on reveal.

import type { ExerciseSpec } from '@/types/worksheet-exercise';

export { PAGE_WIDTH, PAGE_HEIGHT } from '../doc/theme';

/** Skeleton heights (px) for the three estimated footprints, at PAGE_WIDTH. */
export const ESTIMATED_HEIGHT_PX: Record<ExerciseSpec['estimated_height'], number> = {
  short: 132,
  medium: 232,
  tall: 400,
};

/** The height a skeleton reserves for a spec (defaults to medium if unset/unknown). */
export function skeletonHeight(estimated: ExerciseSpec['estimated_height'] | undefined): number {
  return ESTIMATED_HEIGHT_PX[estimated ?? 'medium'] ?? ESTIMATED_HEIGHT_PX.medium;
}

/** The reserved square-ish box an image slot always occupies, so a landing (or
 *  failing) picture never shifts the text around it. */
export const IMAGE_SLOT_HEIGHT = 200;
