// Pure, JSX-free derivation of the worksheet-progress step list from a `WorksheetRun`.
// Split out from WorksheetProgress.tsx so the honest state→step mapping — the whole point
// of this surface — is unit-testable under the plain Node test runner (which strips types
// but cannot transpile the component's JSX).
//
// The rules, all enforced here:
//   - Steps: 0 planning · 1 writing exercises · 2 drawing pictures · 3 putting on the page.
//   - A step is `current` only at the run's live `step`; earlier steps are `done`.
//   - Counts appear only once real: the writing count from planning-end, the picture count
//     only when the drawing loop starts (see WorksheetRun for why it cannot be earlier).
//   - The drawing row goes `partly` — warm neutral, never an error — when the run finished
//     past it with failures. "No pictures needed" when there were none to draw.

import type { useTranslations } from 'next-intl';
import type { WorksheetRun } from './useWorksheetGeneration';

export type StepState = 'done' | 'current' | 'waiting' | 'partly';
export type Pip = 'done' | 'pending' | 'failed';

export interface Step {
  key: number;
  state: StepState;
  label: string;
  tail?: string | null;
  pips?: Pip[] | null;
  landingIndex?: number;
  note?: string;
  hasRail: boolean;
  pad: number;
}

type Translate = ReturnType<typeof useTranslations<'worksheetGen'>>;

/** Derive the four rows from `run`. Counts appear only when real (see file header). */
export function buildSteps(run: WorksheetRun, t: Translate): Step[] {
  const { step, exercisesTotal: nEx, exercisesDone, picturesTotal: nPic, picturesDone, picturesFailed } = run;
  const drawn = picturesDone - picturesFailed.filter((i) => i < picturesDone).length;
  const stateAt = (i: number): StepState => (i < step ? 'done' : i === step ? 'current' : 'waiting');

  const rows: Omit<Step, 'pad'>[] = [];

  // 0 — planning (the one opaque /plan call, collapsed from the mockup's three rows).
  {
    const state = stateAt(0);
    rows.push({ key: 0, state, label: state === 'done' ? t('steps.planning.past') : t('steps.planning.live'), hasRail: true });
  }

  // 1 — writing the exercises.
  {
    const state = stateAt(1);
    let label = t('steps.exercises.live');
    let tail: string | null = null;
    let pips: Pip[] | null = null;
    let landingIndex = -1;
    if (state === 'current' && nEx) {
      label = t('steps.exercises.current');
      tail = ` ${t('steps.exercises.of', { n: Math.min(exercisesDone + 1, nEx), total: nEx })}`;
      pips = Array.from({ length: nEx }, (_, k): Pip => (k < exercisesDone ? 'done' : 'pending'));
      landingIndex = exercisesDone - 1;
    } else if (state === 'done') {
      label = t('steps.exercises.past', { n: nEx ?? 0 });
    }
    rows.push({ key: 1, state, label, tail, pips, landingIndex, hasRail: true });
  }

  // 2 — drawing the pictures.
  {
    let state = stateAt(2);
    if (step > 2 && picturesFailed.length) state = 'partly'; // finished, but some didn't come out
    let label = t('steps.pictures.live');
    let tail: string | null = null;
    let pips: Pip[] | null = null;
    let landingIndex = -1;
    let note = '';
    if (state === 'current' && nPic) {
      label = t('steps.pictures.current');
      tail = ` ${t('steps.pictures.of', { n: Math.min(picturesDone + 1, nPic), total: nPic })}`;
      pips = Array.from({ length: nPic }, (_, k): Pip =>
        k < picturesDone ? (picturesFailed.includes(k) ? 'failed' : 'done') : 'pending');
      landingIndex = picturesDone - 1;
    } else if (state === 'partly' && nPic) {
      label = t('steps.pictures.partly', { drawn, total: nPic });
      note = picturesFailed.length === 1 ? t('steps.pictures.blankOne') : t('steps.pictures.blankMany', { n: picturesFailed.length });
      pips = Array.from({ length: nPic }, (_, k): Pip => (picturesFailed.includes(k) ? 'failed' : 'done'));
    } else if (state === 'done') {
      // Finished with no failures: either drew some, or there were none to draw at all.
      label = nPic && nPic > 0 ? t('steps.pictures.past', { n: drawn }) : t('steps.pictures.none');
    }
    rows.push({ key: 2, state, label, tail, pips, landingIndex, note, hasRail: true });
  }

  // 3 — putting it on the page (compile).
  {
    const state = stateAt(3);
    rows.push({ key: 3, state, label: state === 'done' ? t('steps.page.past') : t('steps.page.live'), hasRail: false });
  }

  return rows.map((r, idx) => ({ ...r, pad: idx === rows.length - 1 ? 0 : r.pips ? 24 : 16 }));
}
