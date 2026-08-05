import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COL_ORDER, poolWidth, weightedWidths, type ColKey } from '../table-widths';

// The proportional width model (Part A) replaced the single-winner FLEX_PRIORITY list,
// which pinned every column but one at a fixed px width and let the survivor sprawl
// (a URL wrapping one char per line in a ~110px Resources column). These tests pin the
// two invariants the fix rests on: the visible weighted columns TILE the pool exactly
// (no column starved, none sprawling), and the ceiling holds — including the lone-column
// case, where the remainder becomes a spacer rather than filling the whole width.

const approx = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

/** Total of every weighted fraction plus the spacer — the whole pool must be accounted for. */
function poolTotal(visible: ColKey[]): number {
  const { fraction, spacerFraction } = weightedWidths(visible);
  return Object.values(fraction).reduce((s, v) => s + (v ?? 0), 0) + spacerFraction;
}

test('period alone (no weighted columns) yields no fractions and no spacer', () => {
  const { fraction, spacerFraction } = weightedWidths(['period']);
  assert.deepEqual(fraction, {});
  assert.equal(spacerFraction, 0);
});

test('all five columns split the pool 4:2:2:2 with no spacer', () => {
  const { fraction, spacerFraction } = weightedWidths(COL_ORDER);
  approx(fraction.outcome!, 0.4);
  approx(fraction.skill!, 0.2);
  approx(fraction.topic!, 0.2);
  approx(fraction.resources!, 0.2);
  assert.equal(spacerFraction, 0);
  approx(poolTotal(COL_ORDER), 1);
});

test('Yoga W16 shape (period + topic + resources) splits the pool evenly', () => {
  const { fraction, spacerFraction } = weightedWidths(['period', 'topic', 'resources']);
  approx(fraction.topic!, 0.5);
  approx(fraction.resources!, 0.5);
  assert.equal(spacerFraction, 0);
});

test('outcome + one other: outcome is capped at the ceiling, remainder redistributed', () => {
  // Raw split would be 4:2 = 0.667 / 0.333; the ceiling clamps outcome to 0.5 and the
  // freed 0.167 flows to the only other column, giving a clean 0.5 / 0.5 (sum still 1).
  const { fraction, spacerFraction } = weightedWidths(['period', 'outcome', 'resources']);
  approx(fraction.outcome!, 0.5);
  approx(fraction.resources!, 0.5);
  assert.equal(spacerFraction, 0);
  approx(poolTotal(['period', 'outcome', 'resources']), 1);
});

test('three even weighted columns split into thirds', () => {
  const { fraction, spacerFraction } = weightedWidths(['period', 'skill', 'topic', 'resources']);
  approx(fraction.skill!, 1 / 3);
  approx(fraction.topic!, 1 / 3);
  approx(fraction.resources!, 1 / 3);
  assert.equal(spacerFraction, 0);
});

test('a lone weighted column hits the ceiling and leaves the rest as a spacer', () => {
  // The key Part A guarantee: a single survivor must NOT fill the whole pool.
  for (const only of ['outcome', 'skill', 'topic', 'resources'] as const) {
    const { fraction, spacerFraction } = weightedWidths(['period', only]);
    approx(fraction[only]!, 0.5);
    approx(spacerFraction, 0.5);
    approx(poolTotal(['period', only]), 1);
  }
});

test('no weighted column ever exceeds the ceiling, for every visible subset', () => {
  const weightedCols: ColKey[] = ['outcome', 'skill', 'topic', 'resources'];
  // All 15 non-empty subsets of the weighted columns (period is always present/fixed).
  for (let mask = 1; mask < 1 << weightedCols.length; mask += 1) {
    const visible: ColKey[] = ['period'];
    weightedCols.forEach((c, i) => {
      if (mask & (1 << i)) visible.push(c);
    });
    const { fraction } = weightedWidths(visible);
    for (const v of Object.values(fraction)) assert.ok((v ?? 0) <= 0.5 + 1e-9);
    approx(poolTotal(visible), 1);
  }
});

test('poolWidth reserves the fixed period column then scales by fraction', () => {
  assert.equal(poolWidth(0.4), 'calc((100% - 80px) * 0.4)');
  assert.equal(poolWidth(0.5), 'calc((100% - 80px) * 0.5)');
});
