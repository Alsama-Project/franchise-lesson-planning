import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseWorksheetImages } from '../image-summary';
import type { ImageSlot, WorksheetExercise } from '@/types/worksheet-exercise';

// Fault 1 — "make the counter true", proven by behaviour.
//
// The counter must show requested/completed for THIS worksheet (not the raw cap), count
// failures, and surface the cap only when it is actually exceeded.

function slot(status: ImageSlot['status'], hasPath = status === 'ready'): ImageSlot {
  return {
    slot_id: Math.random().toString(36).slice(2),
    subject: 'a bus',
    brief: 'a friendly cartoon bus',
    status,
    storage_path: hasPath ? 'worksheet-images/u/x.png' : null,
  };
}

function exercise(slots: ImageSlot[]): WorksheetExercise {
  return {
    id: Math.random().toString(36).slice(2),
    lesson_plan_id: 'p',
    position: 1,
    title: 't',
    exercise_type: 'x',
    body_md: null,
    body_doc: null,
    status: 'ready',
    origin: 'generated',
    resource_id: null,
    image_slots: slots,
    generation: null,
    created_at: '',
    updated_at: '',
  };
}

test('denominator is what the worksheet requested, not the cap', () => {
  // Three slots, two ready — the honest reading is "2 of 3", never "2 of 8".
  const s = summariseWorksheetImages([exercise([slot('ready'), slot('ready'), slot('pending')])], 8);
  assert.equal(s.total, 3);
  assert.equal(s.requested, 3, 'requested is the worksheet total, capped by the ceiling');
  assert.equal(s.ready, 2);
  assert.equal(s.capped, 0, 'the cap is not exceeded, so it is not the teacher’s business');
});

test('a failed slot is counted and distinct from a ready one', () => {
  const s = summariseWorksheetImages([exercise([slot('ready'), slot('failed'), slot('pending')])], 8);
  assert.equal(s.ready, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.requested, 3);
});

test('a ready slot without a storage_path does not count as completed', () => {
  const s = summariseWorksheetImages([exercise([slot('ready', false)])], 8);
  assert.equal(s.ready, 0, 'ready requires an actual stored image');
});

test('the cap surfaces only when the worksheet exceeds it', () => {
  const many = Array.from({ length: 10 }, () => slot('ready'));
  const s = summariseWorksheetImages([exercise(many)], 8);
  assert.equal(s.total, 10);
  assert.equal(s.requested, 8, 'only the first cap slots are ever requested');
  assert.equal(s.capped, 2, 'the two over the cap are refused and named');
});

test('an empty worksheet tallies to zero across the board', () => {
  const s = summariseWorksheetImages([exercise([])], 8);
  assert.deepEqual(s, { total: 0, requested: 0, ready: 0, failed: 0, capped: 0 });
});
