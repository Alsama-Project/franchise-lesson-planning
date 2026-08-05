import type { WorksheetExercise } from '@/types/worksheet-exercise';

// The true per-worksheet image tally that drives the pane counter and its notices.
//
// The old counter read "{ready} of {IMAGE_CAP}" — the numerator was ready slots in
// hook state and the denominator was the hardcoded cap, two unrelated quantities that
// also matched neither the requested set nor the rendered document. This computes what
// the teacher actually needs: how many images THIS worksheet asked for, how many
// completed, how many failed, and (only when it is exceeded) how many the cap refused.
//
// Pure and unit-tested so "make the counter true" is verified by behaviour.

export interface WorksheetImageSummary {
  /** Every image slot the worksheet defines, across all exercises. */
  total: number;
  /** Slots actually attempted — the first `cap` in whole-worksheet order. */
  requested: number;
  /** Slots that generated a stored image (`ready` with a `storage_path`). */
  ready: number;
  /** Slots that were requested and came back failed. */
  failed: number;
  /** Slots refused positionally by the cap (`total − cap`, never negative). Only
   *  these make the cap the teacher's business. */
  capped: number;
}

/**
 * Tally a worksheet's image slots against the per-worksheet cap. `cap` is the route's
 * authoritative `WORKSHEET_IMAGE_CAP`; slots beyond it are never requested.
 */
export function summariseWorksheetImages(
  exercises: WorksheetExercise[],
  cap: number,
): WorksheetImageSummary {
  let total = 0;
  let ready = 0;
  let failed = 0;
  for (const e of exercises) {
    const slots = Array.isArray(e.image_slots) ? e.image_slots : [];
    total += slots.length;
    for (const s of slots) {
      if (s.status === 'ready' && s.storage_path) ready += 1;
      else if (s.status === 'failed') failed += 1;
    }
  }
  return {
    total,
    requested: Math.min(total, cap),
    ready,
    failed,
    capped: Math.max(0, total - cap),
  };
}
