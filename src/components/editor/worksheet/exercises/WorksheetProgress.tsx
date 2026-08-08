'use client';

// The named step list that sits at the TOP of the worksheet pane while Aya builds a
// full sheet — above the skeleton page, so a teacher can see how far a multi-minute run
// has got instead of a single line of header copy and a page of static skeletons.
//
// Ported from Claude Design's approved mockup (the visual source of truth). Two honest
// deviations from that mockup, both because it was drawn before the real wiring was known
// (see the PR notes):
//   1. The mockup's THREE planning rows are collapsed to ONE. /plan is a single opaque
//      server call — three rows for one unobservable request is theatre. One row, current
//      while /plan runs, done when it returns.
//   2. The picture count appears only when the DRAWING step starts, not at planning-end.
//      /plan persists rows with empty image_slots; the real picture count is unknowable
//      until /exercise has authored the briefs. It is taken from the same drawableSlots
//      the draw loop iterates, so it never jumps.
//
// Rules kept from the mockup, exactly:
//   - No duration is ever implied. No bar, no percentage, no time remaining.
//   - Counts render only once real. Steps start as plain labels with no placeholder number.
//   - The only motion is a step landing, a mark filling, and one slow pulse on the live step.
//   - A step that finished with failures is "partly" — warm neutral, never red.

import { useTranslations } from 'next-intl';
import type { WorksheetRun } from './useWorksheetGeneration';
import { buildSteps, type Step, type StepState, type Pip } from './progressSteps';

/** The step list's own warm-neutral palette. Local to this one surface by design: it is a
 *  self-contained family, close to the cream floor tokens but distinct, and promoting it to
 *  global tokens would only invite the wrong neighbour being picked later. Teal / ink / cream
 *  values that DO map to theme tokens keep the mockup's hexes so the port is exact. */
const T = {
  cream: '#FBF8F3',
  creamBorder: '#EADFD1',
  teal: '#1F7A6C',
  tealDeep: '#186155',
  tealPale: '#E4F0ED',
  tealLine: '#CFE6E0',
  ink: '#2A2422',
  ink2: '#4A423C',
  doneInk: '#8A7C68',
  partlyInk: '#7A6E5C',
  waitInk: '#AFA79A',
  rail: '#E4DAC9',
  pipPending: '#E0D5C4',
  pipFailed: '#C9B89F',
  markerWait: '#DBD0BF',
} as const;

/** Drop once above the list. Motion is disabled under prefers-reduced-motion. */
const Keyframes = () => (
  <style>{`
    @keyframes wp-halo { 0% { transform: scale(1); opacity: .5 } 70%, 100% { transform: scale(1.7); opacity: 0 } }
    @keyframes wp-pip { 0% { transform: scale(.2); opacity: 0 } 65% { transform: scale(1.25); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
    @keyframes wp-tail { 0% { opacity: 0; transform: translateX(-5px) } 100% { opacity: 1; transform: none } }
    @media (prefers-reduced-motion: reduce) {
      [data-wp-motion] { animation: none !important }
    }
  `}</style>
);

const STATE: Record<StepState, { dotBg: string; dotBorder: string; color: string; size: number; weight: number; rail: string }> = {
  done: { dotBg: T.tealPale, dotBorder: `1px solid ${T.tealLine}`, color: T.doneInk, size: 16.5, weight: 500, rail: T.tealLine },
  current: { dotBg: T.teal, dotBorder: '0 solid transparent', color: T.teal, size: 19, weight: 600, rail: T.rail },
  waiting: { dotBg: 'transparent', dotBorder: `1.5px solid ${T.markerWait}`, color: T.waitInk, size: 16.5, weight: 400, rail: T.rail },
  partly: { dotBg: T.cream, dotBorder: `1px solid ${T.markerWait}`, color: T.partlyInk, size: 16.5, weight: 500, rail: T.tealLine },
};

const Tick = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
    <path d="M2 6.4L4.7 9L10 3.4" stroke={T.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 22px marker. */
const Marker = ({ state }: { state: StepState }) => {
  const s = STATE[state];
  return (
    <span style={{ position: 'relative', width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: s.dotBg, border: s.dotBorder }}>
      {state === 'current' && (
        <>
          <span data-wp-motion style={{ position: 'absolute', inset: -1, borderRadius: '50%', background: T.teal, animation: 'wp-halo 2.6s ease-out infinite' }} />
          <span style={{ position: 'relative', width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />
        </>
      )}
      {state === 'done' && <Tick />}
      {state === 'partly' && (
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: `linear-gradient(90deg, ${T.teal} 0%, ${T.teal} 50%, ${T.pipPending} 50%, ${T.pipPending} 100%)` }} />
      )}
    </span>
  );
};

/** One mark per exercise / picture. */
const Pips = ({ pips, landingIndex, note }: { pips: Pip[]; landingIndex: number; note?: string }) => (
  <div style={{ display: 'flex', gap: 7, marginTop: 11, alignItems: 'center' }}>
    {pips.map((p, i) => (
      <span
        key={i}
        data-wp-motion={i === landingIndex ? '' : undefined}
        style={{
          width: 9, height: 9, borderRadius: '50%', flex: 'none',
          background: p === 'done' ? T.teal : p === 'failed' ? 'transparent' : T.pipPending,
          border: p === 'failed' ? `1.5px solid ${T.pipFailed}` : '0 solid transparent',
          animation: i === landingIndex ? 'wp-pip .5s ease-out both' : undefined,
        }}
      />
    ))}
    {note && <span style={{ fontSize: 13.5, color: T.doneInk, marginInlineStart: 6 }}>{note}</span>}
  </div>
);

const StepRow = ({ state, label, tail, pips, landingIndex = -1, note, hasRail, pad }: Step) => {
  const s = STATE[state];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', columnGap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Marker state={state} />
        {hasRail && <span style={{ width: 2, flex: 1, margin: '4px 0', background: s.rail }} />}
      </div>
      <div style={{ paddingBottom: pad }}>
        <div style={{ lineHeight: 1.3, letterSpacing: '-0.008em', fontSize: s.size, fontWeight: s.weight, color: s.color }}>
          {label}
          {tail && <span data-wp-motion style={{ animation: 'wp-tail .45s ease-out both' }}>{tail}</span>}
        </div>
        {pips && <Pips pips={pips} landingIndex={landingIndex} note={note} />}
      </div>
    </div>
  );
};

/** The list card — Aya's avatar, a headline, and the four steps. Mounts above the
 *  skeleton page inside the generating overlay. */
export function WorksheetProgress({ run }: { run: WorksheetRun }) {
  const t = useTranslations('worksheetGen');
  const ready = run.step >= 4;
  return (
    <div style={{ background: T.cream, border: `1px solid ${T.creamBorder}`, borderRadius: 12, padding: '20px 22px 22px', color: T.ink }}>
      <Keyframes />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: T.tealPale, border: `1px solid ${T.tealLine}`, color: T.tealDeep, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {t('avatar')}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.ink2 }}>{ready ? t('readyHeadline') : t('buildingHeadline')}</span>
      </div>
      {buildSteps(run, t).map((s) => (
        <StepRow {...s} key={s.key} />
      ))}
    </div>
  );
}
