import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, type Step } from '../progressSteps';
import type { WorksheetRun } from '../useWorksheetGeneration';

// A stand-in for next-intl's `t`: echoes the key, appending the params so a test can
// assert a count actually ticked. The real strings are Kadria's; the state machine is ours.
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as unknown as Parameters<typeof buildSteps>[1];

const rows = (run: WorksheetRun): Step[] => buildSteps(run, t);
const states = (run: WorksheetRun): string[] => rows(run).map((s) => s.state);

// The exact `run`-states `generateAll` emits, in order, for a 6-exercise / 5-picture run.
// Driving the REAL buildSteps through them is the closest this environment can get to
// watching a live generation: if a step turns current before its work starts, or a count
// fails to tick, or the run doesn't finish in its true end-state, an assertion here fails.

const RUN_START: WorksheetRun = { step: 0, exercisesTotal: null, exercisesDone: 0, picturesTotal: null, picturesDone: 0, picturesFailed: [] };

test('planning: only the one collapsed planning row is current; the rest wait', () => {
  assert.deepEqual(states(RUN_START), ['current', 'waiting', 'waiting', 'waiting']);
  // No counts exist yet — writing and drawing are plain labels, no placeholder number.
  const r = rows(RUN_START);
  assert.equal(r[1].label, 'steps.exercises.live');
  assert.equal(r[1].tail, null);
  assert.equal(r[2].label, 'steps.pictures.live');
  assert.equal(r[2].tail, null);
});

test('writing: planning is done, writing is current and ticks; drawing shows NO count yet', () => {
  // The picture count is unknowable during writing (rows still have empty image_slots),
  // so the drawing row must stay a plain label with no number the whole way through.
  for (let done = 0; done < 6; done++) {
    const run: WorksheetRun = { step: 1, exercisesTotal: 6, exercisesDone: done, picturesTotal: null, picturesDone: 0, picturesFailed: [] };
    assert.deepEqual(states(run), ['done', 'current', 'waiting', 'waiting']);
    const r = rows(run);
    assert.equal(r[1].label, 'steps.exercises.current');
    // "writing exercise (done+1) of 6" — the live count tracks the real loop.
    assert.ok(r[1].tail?.includes(`"n":${done + 1}`), `n should be ${done + 1}, got ${r[1].tail}`);
    assert.ok(r[1].tail?.includes('"total":6'));
    // done pips so far, rest pending, and the just-written one lands.
    assert.equal(r[1].pips?.filter((p) => p === 'done').length, done);
    assert.equal(r[1].landingIndex, done - 1);
    // The drawing row is still silent — no count leaked in early.
    assert.equal(r[2].label, 'steps.pictures.live');
    assert.equal(r[2].tail, null);
  }
});

test('drawing: writing is done with its final count; drawing is current and ticks', () => {
  const r0 = rows({ step: 2, exercisesTotal: 6, exercisesDone: 6, picturesTotal: 5, picturesDone: 0, picturesFailed: [] });
  assert.deepEqual(r0.map((s) => s.state), ['done', 'done', 'current', 'waiting']);
  assert.ok(r0[1].label.startsWith('steps.exercises.past') && r0[1].label.includes('"n":6'), r0[1].label);
  assert.ok(r0[1].tail === null); // past label carries the count inline, no animated tail
  // The picture count appears now, for the first time, and equals the loop's own total.
  assert.equal(r0[2].label, 'steps.pictures.current');
  assert.ok(r0[2].tail?.includes('"n":1') && r0[2].tail?.includes('"total":5'));

  for (let done = 1; done <= 5; done++) {
    const r = rows({ step: 2, exercisesTotal: 6, exercisesDone: 6, picturesTotal: 5, picturesDone: done, picturesFailed: [] });
    const shown = Math.min(done + 1, 5);
    assert.ok(r[2].tail?.includes(`"n":${shown}`), `picture n should be ${shown}, got ${r[2].tail}`);
    assert.equal(r[2].pips?.filter((p) => p === 'done').length, done);
    assert.equal(r[2].landingIndex, done - 1);
  }
});

test('finish clean: the run ends with every step done and a real drew-count', () => {
  const r = rows({ step: 3, exercisesTotal: 6, exercisesDone: 6, picturesTotal: 5, picturesDone: 5, picturesFailed: [] });
  assert.deepEqual(r.map((s) => s.state), ['done', 'done', 'done', 'current']);
  assert.ok(r[2].label.startsWith('steps.pictures.past') && r[2].label.includes('"n":5'), r[2].label);
  assert.ok(r[2].tail === null);
});

test('partly done: images finished with failures → warm partly state, count kept, blanks noted', () => {
  // The real outcome from last week: 2 of 5 images failed. A tick here would be a lie.
  const run: WorksheetRun = { step: 3, exercisesTotal: 6, exercisesDone: 6, picturesTotal: 5, picturesDone: 5, picturesFailed: [1, 3] };
  const r = rows(run);
  assert.equal(r[2].state, 'partly');
  // Drew 3 of 5 (5 attempted, 2 failed), and the two blanks are named.
  assert.ok(r[2].label.includes('"drawn":3') && r[2].label.includes('"total":5'), r[2].label);
  assert.equal(r[2].note, 'steps.pictures.blankMany {"n":2}');
  assert.equal(r[2].pips?.filter((p) => p === 'failed').length, 2);
  assert.equal(r[2].pips?.filter((p) => p === 'done').length, 3);
});

test('partly done, single failure: the note is the singular string', () => {
  const r = rows({ step: 3, exercisesTotal: 6, exercisesDone: 6, picturesTotal: 5, picturesDone: 5, picturesFailed: [2] });
  assert.equal(r[2].state, 'partly');
  assert.equal(r[2].note, 'steps.pictures.blankOne');
});

test('no images (disabled / capped / no subject): drawing never turns current, ends "none"', () => {
  // fillImagesFor emits no progress, so step jumps 1 → 3 with picturesTotal still null.
  // The drawing step must NEVER have appeared current, and reads as nothing-to-draw.
  const midWriting = states({ step: 1, exercisesTotal: 4, exercisesDone: 2, picturesTotal: null, picturesDone: 0, picturesFailed: [] });
  assert.equal(midWriting[2], 'waiting');
  const finished = rows({ step: 3, exercisesTotal: 4, exercisesDone: 4, picturesTotal: null, picturesDone: 0, picturesFailed: [] });
  assert.equal(finished[2].state, 'done');
  assert.equal(finished[2].label, 'steps.pictures.none');
  assert.equal(finished[2].tail, null);
  assert.equal(finished[2].pips, null);
});
