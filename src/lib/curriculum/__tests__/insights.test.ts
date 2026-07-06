import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hoursPerMonthForYear,
  hoursByFocusArea,
  topicMatrix,
  gapNotes,
  tealStop,
  LOW_MONTH_MEDIAN_FRACTION,
} from '../insights';
import type { TopicsData, TopicThreadYear } from '../composition';

// Minimal thread builder — only the fields the derivations read.
function thread(year: number, hours: number): TopicThreadYear {
  return { year, hours, lessonKey: `k${year}`, dailyOutcome: null, strandLabel: null, resources: [] };
}

// ── 1) Hours per month + the low-month flag ─────────────────────────────────────────

test('hoursPerMonthForYear orders by calendar and filters to the year', () => {
  const view = hoursPerMonthForYear(
    [
      { year: 1, month: 'March', hours: 10 },
      { year: 1, month: 'January', hours: 8 },
      { year: 2, month: 'January', hours: 99 }, // other year — excluded
    ],
    1,
  );
  assert.deepEqual(view.bars.map((b) => b.month), ['January', 'March']);
  assert.equal(view.bars.every((b) => !b.low), true); // 8 and 10 — neither below 60% of median 9
});

test('a month below 60% of the year median is flagged low', () => {
  // median of [10,10,10,3] = 10; threshold = 6; only the 3 falls below.
  const view = hoursPerMonthForYear(
    [
      { year: 1, month: 'January', hours: 10 },
      { year: 1, month: 'February', hours: 10 },
      { year: 1, month: 'March', hours: 10 },
      { year: 1, month: 'April', hours: 3 },
    ],
    1,
  );
  const low = view.bars.filter((b) => b.low).map((b) => b.month);
  assert.deepEqual(low, ['April']);
  assert.equal(view.median, 10);
  assert.equal(LOW_MONTH_MEDIAN_FRACTION, 0.6);
});

test('a single teaching month is never flagged low (no meaningful median)', () => {
  const view = hoursPerMonthForYear([{ year: 1, month: 'June', hours: 1 }], 1);
  assert.equal(view.bars.length, 1);
  assert.equal(view.bars[0].low, false);
});

// ── 2) Hours by focus area / theme ──────────────────────────────────────────────────

test('focus-area mode sums topic hours, sorts desc, and computes share of total', () => {
  const data: TopicsData = {
    subject: 'maths',
    groupedBy: 'focusArea',
    years: [1, 2],
    focusAreas: [
      { focusArea: 'Number', topics: [{ topic: 'Fractions', years: [thread(1, 3), thread(2, 1)] }] }, // 4
      { focusArea: 'Geometry', topics: [{ topic: 'Angles', years: [thread(1, 12)] }] }, // 12
    ],
  };
  const view = hoursByFocusArea(data);
  assert.equal(view.groupedBy, 'focusArea');
  assert.equal(view.total, 16);
  assert.deepEqual(view.bars.map((b) => b.label), ['Geometry', 'Number']); // sorted desc
  assert.equal(Math.round(view.bars[0].pct), 75);
});

test('theme mode (english) makes each theme a top-level bar with no sub-breakdown', () => {
  const data: TopicsData = {
    subject: 'english',
    groupedBy: 'theme',
    years: [1],
    focusAreas: [
      {
        focusArea: null,
        topics: [
          { topic: 'Academic language', years: [thread(1, 5)] },
          { topic: 'Narrative', years: [thread(1, 2)] },
        ],
      },
    ],
  };
  const view = hoursByFocusArea(data);
  assert.equal(view.groupedBy, 'theme');
  assert.deepEqual(view.bars.map((b) => b.label), ['Academic language', 'Narrative']);
  assert.equal(view.bars.every((b) => b.topics.length === 0), true);
});

// ── 3 & 4) Matrix + gap narrative ───────────────────────────────────────────────────

test('topicMatrix drops all-empty groups and records byYear presence', () => {
  const data: TopicsData = {
    subject: 'maths',
    groupedBy: 'focusArea',
    years: [1, 2, 3],
    focusAreas: [
      { focusArea: 'Number', topics: [{ topic: 'Fractions', years: [thread(1, 2), thread(3, 4)] }] },
      { focusArea: 'Empty', topics: [] },
    ],
  };
  const view = topicMatrix(data);
  assert.equal(view.groups.length, 1);
  assert.equal(view.maxCell, 4);
  const row = view.groups[0].rows[0];
  assert.equal(row.byYear[1], 2);
  assert.equal(row.byYear[2], undefined); // not taught in year 2
  assert.equal(row.byYear[3], 4);
});

test('gapNotes reports a genuine present→absent→present gap, widest first', () => {
  const data: TopicsData = {
    subject: 'maths',
    groupedBy: 'focusArea',
    years: [1, 2, 3, 4, 5],
    focusAreas: [
      {
        focusArea: 'Number',
        topics: [
          { topic: 'Fractions', years: [thread(1, 2), thread(4, 2), thread(5, 1)] }, // gap in 2–3
          { topic: 'Counting', years: [thread(1, 1), thread(2, 1), thread(3, 1)] }, // no interior gap
        ],
      },
    ],
  };
  const notes = gapNotes(topicMatrix(data));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].topic, 'Fractions');
  assert.deepEqual(notes[0].gapYears, [2, 3]);
  assert.equal(notes[0].reappear, 4);
});

test('a trailing drop-off (never reappears) is NOT reported as a gap', () => {
  const data: TopicsData = {
    subject: 'maths',
    groupedBy: 'focusArea',
    years: [1, 2, 3],
    focusAreas: [{ focusArea: 'A', topics: [{ topic: 'Once', years: [thread(1, 1)] }] }],
  };
  assert.equal(gapNotes(topicMatrix(data)).length, 0);
});

// ── magnitude ramp ──────────────────────────────────────────────────────────────────

test('tealStop maps 0 to the faintest stop and the max to the deepest', () => {
  assert.equal(tealStop(0, 10), 'var(--color-chart-teal-1)');
  assert.equal(tealStop(10, 10), 'var(--color-chart-teal-5)');
  assert.equal(tealStop(5, 0), 'var(--color-chart-teal-1)'); // guard against divide-by-zero
});
