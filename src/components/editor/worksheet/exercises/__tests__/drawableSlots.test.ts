import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawableSlots, flattenSlots, IMAGE_CAP } from '../slots';
import type { ImageSlot, WorksheetExercise } from '@/types/worksheet-exercise';

// `drawableSlots` is the single source of truth for BOTH the "picture n of total"
// denominator the header ticks against AND the regenerate's "will a picture be drawn?"
// test. These prove its arithmetic — present-and-under-the-cap — so the count the teacher
// sees can never drift from what the fill loop actually does.

function slot(id: string): ImageSlot {
  return { slot_id: id, subject: 'a bus', brief: 'a friendly cartoon bus', status: 'pending', storage_path: null };
}

function exercise(id: string, slotIds: string[]): WorksheetExercise {
  return {
    id,
    lesson_plan_id: 'p',
    position: 1,
    title: 't',
    exercise_type: 'x',
    body_md: null,
    body_doc: null,
    status: 'ready',
    origin: 'generated',
    resource_id: null,
    image_slots: slotIds.map(slot),
    generation: null,
    created_at: '',
    updated_at: '',
  };
}

test('every present slot under the cap is drawable, in flattened order', () => {
  const rows = [exercise('a', ['a1', 'a2']), exercise('b', ['b1'])];
  const drawable = drawableSlots(rows, rows);
  assert.equal(drawable.length, 3, 'total is the real picture count, not the cap');
  assert.deepEqual(
    drawable.map((f) => f.slotId),
    ['a1', 'a2', 'b1'],
    'order follows the whole-worksheet flattening',
  );
});

test('slots past the whole-worksheet positional cap are not drawable', () => {
  // IMAGE_CAP + 2 slots on one exercise → only the first IMAGE_CAP draw.
  const many = Array.from({ length: IMAGE_CAP + 2 }, (_, i) => `s${i}`);
  const rows = [exercise('a', many)];
  const drawable = drawableSlots(rows, rows);
  assert.equal(drawable.length, IMAGE_CAP, 'the count is clamped to the cap the route enforces');
  assert.ok(
    drawable.every((f) => f.index < IMAGE_CAP),
    'no slot at or beyond the cap index is drawable',
  );
});

test('the cap is positional over the WHOLE sheet, not per target row', () => {
  // A leading exercise consumes cap-1 slots; the target row that follows has only ONE
  // slot left under the cap even though it declares two.
  const lead = Array.from({ length: IMAGE_CAP - 1 }, (_, i) => `L${i}`);
  const all = [exercise('lead', lead), exercise('target', ['t1', 't2'])];
  const target = all[1];
  const drawable = drawableSlots([target], all);
  assert.equal(drawable.length, 1, 'only the slot still under the whole-sheet cap draws');
  assert.equal(drawable[0].slotId, 't1');
});

test('regenerate willDraw: a target whose slots are ALL past the cap draws nothing', () => {
  // The leading exercise alone fills the cap; the target that follows is entirely refused.
  const lead = Array.from({ length: IMAGE_CAP }, (_, i) => `L${i}`);
  const all = [exercise('lead', lead), exercise('target', ['t1', 't2'])];
  const target = all[1];
  assert.equal(drawableSlots([target], all).length, 0, 'no picture → the "image" stage never shows');
});

test('a target row with no slots is not drawable (no image stage)', () => {
  const all = [exercise('a', []), exercise('b', ['b1'])];
  assert.equal(drawableSlots([all[0]], all).length, 0);
  assert.equal(drawableSlots([all[1]], all).length, 1);
});

test('drawableSlots never exceeds the raw flattened count', () => {
  const rows = [exercise('a', ['a1', 'a2', 'a3']), exercise('b', ['b1', 'b2'])];
  assert.ok(drawableSlots(rows, rows).length <= flattenSlots(rows).length);
});
