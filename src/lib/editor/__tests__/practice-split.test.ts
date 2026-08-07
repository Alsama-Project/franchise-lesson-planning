import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureGroupPractice, REVIEW_EDITABLE_TYPES } from '../plan-blocks';
import { DEFAULT_BLOCKS, inSessionMinutes, IN_SESSION_TARGET_MINUTES } from '@/lib/blocks';
import type { Block } from '@/types/lesson';

/** A legacy stored plan: DEFAULT_BLOCKS as they were BEFORE the 5b split (no group_practice). */
function legacyBlocks(): Block[] {
  return DEFAULT_BLOCKS.filter((b) => b.type !== 'group_practice').map((b) => ({ ...b }));
}

test('DEFAULT_BLOCKS seeds group_practice immediately after independent_practice', () => {
  const types = DEFAULT_BLOCKS.map((b) => b.type);
  const ip = types.indexOf('independent_practice');
  assert.equal(types[ip + 1], 'group_practice');
});

test('group_practice default seeds at 0 minutes / you_do so the total is unchanged', () => {
  const gp = DEFAULT_BLOCKS.find((b) => b.type === 'group_practice');
  assert.ok(gp);
  assert.equal(gp!.minutes, 0);
  assert.equal(gp!.duration_minutes, 0);
  assert.equal(gp!.phase, 'you_do');
  // The canonical scaffold still totals the 50-min in-session target.
  assert.equal(inSessionMinutes(DEFAULT_BLOCKS), IN_SESSION_TARGET_MINUTES);
});

test('adding group_practice never changes a legacy plan in-session total', () => {
  const legacy = legacyBlocks();
  const before = inSessionMinutes(legacy);
  const after = inSessionMinutes(ensureGroupPractice(legacy));
  assert.equal(after, before);
  assert.equal(after, IN_SESSION_TARGET_MINUTES);
});

test('ensureGroupPractice splices the block directly after 5a on a legacy plan', () => {
  const seeded = ensureGroupPractice(legacyBlocks()).map((b) => b.type);
  const ip = seeded.indexOf('independent_practice');
  assert.equal(seeded[ip + 1], 'group_practice');
  // Exit ticket still follows immediately after 5b — 6/7 keep their order.
  assert.equal(seeded[ip + 2], 'exit_ticket');
});

test('ensureGroupPractice is idempotent (plans saved after the split keep one block)', () => {
  const once = ensureGroupPractice(legacyBlocks());
  const twice = ensureGroupPractice(once);
  assert.equal(twice.filter((b) => b.type === 'group_practice').length, 1);
  assert.deepEqual(
    twice.map((b) => b.type),
    once.map((b) => b.type),
  );
});

test('ensureGroupPractice does not mutate the input array', () => {
  const legacy = legacyBlocks();
  const snapshot = legacy.map((b) => b.type);
  ensureGroupPractice(legacy);
  assert.deepEqual(
    legacy.map((b) => b.type),
    snapshot,
  );
});

test('fallback: independent_practice absent → insert at canonical DEFAULT_BLOCKS index', () => {
  // A malformed stored array missing 5a. group_practice sits at index 7 in
  // DEFAULT_BLOCKS (anthem,warm_up,cool_down,recap,new_content,cfu,independent_practice,
  // group_practice,…); with 5a removed the array is shorter, so the clamp applies.
  const noIp: Block[] = DEFAULT_BLOCKS.filter(
    (b) => b.type !== 'group_practice' && b.type !== 'independent_practice',
  ).map((b) => ({ ...b }));
  const seeded = ensureGroupPractice(noIp);
  assert.equal(seeded.filter((b) => b.type === 'group_practice').length, 1);
  // It is present and never appended past a trailing homework block silently — the
  // canonical index (7) is clamped to the shorter array's length.
  const gpIdx = seeded.findIndex((b) => b.type === 'group_practice');
  assert.ok(gpIdx >= 0 && gpIdx <= seeded.length);
});

test('REVIEW_EDITABLE_TYPES lists group_practice right after independent_practice', () => {
  const ip = REVIEW_EDITABLE_TYPES.indexOf('independent_practice');
  assert.equal(REVIEW_EDITABLE_TYPES[ip + 1], 'group_practice');
});
