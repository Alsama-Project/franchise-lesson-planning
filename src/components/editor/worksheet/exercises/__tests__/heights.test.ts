import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeletonHeight, ESTIMATED_HEIGHT_PX, IMAGE_SLOT_HEIGHT } from '../heights';

// Fault 3 — the skeletons reserve roughly the room the filled exercise will take, so
// the page barely reflows on the atomic reveal. This pins the height machinery the
// overlay draws from (previously a zero-consumer module).

test('estimated footprints order short < medium < tall', () => {
  assert.ok(ESTIMATED_HEIGHT_PX.short < ESTIMATED_HEIGHT_PX.medium);
  assert.ok(ESTIMATED_HEIGHT_PX.medium < ESTIMATED_HEIGHT_PX.tall);
});

test('skeletonHeight maps each footprint and defaults to medium', () => {
  assert.equal(skeletonHeight('short'), ESTIMATED_HEIGHT_PX.short);
  assert.equal(skeletonHeight('tall'), ESTIMATED_HEIGHT_PX.tall);
  assert.equal(skeletonHeight(undefined), ESTIMATED_HEIGHT_PX.medium, 'unknown/absent → medium');
});

test('an image slot reserves a fixed square so a landing picture never reflows text', () => {
  assert.ok(IMAGE_SLOT_HEIGHT > 0);
});
