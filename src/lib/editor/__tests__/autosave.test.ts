// H9 · The editor's debounced autosave: save on leave, retry on failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutosave, type AutosaveState } from '../autosave';

/** Manual clock: timers run only when the test advances time. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn: () => void, ms: number) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clear: (id: unknown) => { timers.delete(id as number); },
    async advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) { timers.delete(id); t.fn(); await new Promise((r) => setImmediate(r)); }
      }
      await new Promise((r) => setImmediate(r));
    },
  };
}

function setup(results: boolean[] = []) {
  const clock = fakeClock();
  const saved: string[] = [];
  const states: AutosaveState[] = [];
  const autosave = createAutosave<string>({
    delayMs: 1500,
    retryDelaysMs: [2000, 5000],
    save: async (p) => { saved.push(p); return results.length ? results.shift()! : true; },
    onState: (s) => states.push(s),
    timers: { set: clock.set, clear: clock.clear },
  });
  return { clock, saved, states, autosave };
}

test('H9: edits save once the teacher pauses', async () => {
  const { clock, saved, autosave } = setup();
  autosave.schedule('a');
  autosave.schedule('ab');
  await clock.advance(1500);
  assert.deepEqual(saved, ['ab']);
});

test('H9: leaving the editor saves an edit the pause hasn\'t reached yet', async () => {
  const { saved, autosave } = setup();
  autosave.schedule('last words');
  assert.equal(autosave.hasPending(), true);
  await autosave.flush();                   // what the editor calls when it unmounts
  assert.deepEqual(saved, ['last words']);
  assert.equal(autosave.hasPending(), false);
});

test('H9: a failed save retries on its own, says so, and ends saved', async () => {
  const { clock, saved, states, autosave } = setup([false, false, true]);
  autosave.schedule('x');
  await clock.advance(1500);                // attempt 1 fails
  assert.equal(states.at(-1), 'retrying');
  assert.equal(autosave.hasPending(), true);
  await clock.advance(2000);                // attempt 2 fails
  await clock.advance(5000);                // attempt 3 succeeds
  assert.deepEqual(saved, ['x', 'x', 'x']);
  assert.equal(states.at(-1), 'saved');
  assert.equal(autosave.hasPending(), false);
});

test('H9: a newer edit made while retrying replaces the failed one', async () => {
  const { clock, saved, autosave } = setup([false, true]);
  autosave.schedule('old');
  await clock.advance(1500);                // 'old' fails
  autosave.schedule('new');
  await clock.advance(1500);
  assert.deepEqual(saved, ['old', 'new']);
  assert.equal(autosave.hasPending(), false);
});

test('H9: a thrown save counts as a failure, not a stuck "saving"', async () => {
  const clock = fakeClock();
  const states: AutosaveState[] = [];
  const autosave = createAutosave<string>({
    delayMs: 10, retryDelaysMs: [10],
    save: async () => { throw new Error('network'); },
    onState: (s) => states.push(s),
    timers: { set: clock.set, clear: clock.clear },
  });
  autosave.schedule('x');
  await clock.advance(10);
  assert.equal(states.at(-1), 'retrying');
});

test('H9: cancel drops the pending edit when Submit saves the same fields itself', async () => {
  const { clock, saved, autosave } = setup();
  autosave.schedule('draft');
  autosave.cancel();
  await clock.advance(5000);
  assert.deepEqual(saved, []);
  assert.equal(autosave.hasPending(), false);
});
