// Pure image-slot helpers for the worksheet generator — no React, no server imports, so
// they are unit-testable in isolation (the hook that consumes them drags in server
// actions and cannot be imported under the plain Node test runner).

import type { WorksheetExercise } from '@/types/worksheet-exercise';

/** The per-slot picture cap. Mirrors the route's `WORKSHEET_IMAGE_CAP` default (8);
 *  the route is authoritative and refuses server-side, so this is only for the
 *  running count and the positional refused-state render. */
export const IMAGE_CAP = 8;

/** A slot with its whole-worksheet flattened index, for the positional cap/refusal. */
export interface FlatSlotRef {
  exerciseId: string;
  slotId: string;
  index: number;
}

/** Flatten every row's slots in whole-worksheet order (position, then array order). */
export function flattenSlots(rows: WorksheetExercise[]): FlatSlotRef[] {
  const flat: FlatSlotRef[] = [];
  for (const row of rows) {
    const slots = Array.isArray(row.image_slots) ? row.image_slots : [];
    for (const slot of slots) {
      flat.push({ exerciseId: row.id, slotId: slot.slot_id, index: flat.length });
    }
  }
  return flat;
}

/**
 * The slots among `rows` that a fill WILL actually draw: present on the row AND under the
 * whole-worksheet positional cap (its flattened index — computed over `allRowsInOrder` —
 * is `< IMAGE_CAP`; the route refuses the rest). The single source of truth for both the
 * "picture n of total" denominator and the regenerate's "will a picture be drawn?" test,
 * so the count the teacher sees can never drift from what the loop does. Order preserved.
 */
export function drawableSlots(
  rows: WorksheetExercise[],
  allRowsInOrder: WorksheetExercise[],
): FlatSlotRef[] {
  const targetIds = new Set(rows.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return flattenSlots(allRowsInOrder).filter(
    (f) =>
      targetIds.has(f.exerciseId) &&
      f.index < IMAGE_CAP &&
      !!byId.get(f.exerciseId)?.image_slots.find((s) => s.slot_id === f.slotId),
  );
}
