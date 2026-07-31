'use client';

import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The ordered step registry — the SOLE source of step identity and display order.
 * The lesson editor walks these in the order the lesson is actually taught. Display
 * numbers derive from a step's position here; NO step number is hardcoded anywhere.
 * `optional: true` marks a step that never blocks `Next` and never enters any
 * completeness check. No step is optional today (Homework check, the former
 * optional step, was folded into Recap); the flag + its render branch are kept for
 * any future optional step.
 */
export const STEPS = [
  { id: 'objective', optional: false },
  { id: 'recap', optional: false },
  { id: 'newContent', optional: false },
  { id: 'cfu', optional: false },
  { id: 'practice', optional: false },
  { id: 'exitTicket', optional: false },
  { id: 'review', optional: false },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export const STEP_IDS = STEPS.map((s) => s.id) as StepId[];
/** 0-based position of a step in the registry (the badge number is this + 1). */
export const stepIndex = (id: StepId): number => STEP_IDS.indexOf(id);
export const FIRST_STEP: StepId = STEPS[0].id;
export const LAST_STEP: StepId = STEPS[STEPS.length - 1].id;
/** The step that carries the "→ Review" advance label (the one before Review). */
export const PENULTIMATE_STEP: StepId = STEPS[STEPS.length - 2].id;

/**
 * The pipeline tracker: a row of eight equal-width step nodes (numbered circles +
 * wrapping labels) with the Back + Next/Submit group pinned to the right. Nodes are
 * laid out on an equal-column grid so the row can never reflow between steps, and
 * each label sits in a fixed-height box (two-line wrap max) so node height is
 * constant on every step. Node states map to the fixed semantic palette:
 *   • completed → teal circle + white ✓, muted ink label
 *   • current   → pink circle + white number, strong ink label
 *   • upcoming  → cream circle + faint number, faint label
 * On the final step the Next button is replaced by the SubmitControl (`submitSlot`).
 */
export function Stepper({
  currentId,
  onGo,
  onBack,
  onNext,
  nextLabel,
  submitSlot,
  advanceBlocked = false,
  gateHint = null,
}: {
  currentId: StepId;
  onGo: (id: StepId) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  /** Rendered in place of "Next" on the final step (the submit control). */
  submitSlot: ReactNode;
  /** When true, forward advancement is gated (the objective has not passed its
   *  SMARTT check): the Next control is disabled and every node AHEAD of the
   *  current step is rendered inert/greyed. Back and same-or-earlier nodes stay
   *  live. The actual navigation block lives in `goStep`; this only reflects it. */
  advanceBlocked?: boolean;
  /** A single teal gate-reason line rendered below the tracker row when the advance
   *  control is disabled for gate reasons. Already localised by the caller. */
  gateHint?: ReactNode;
}) {
  const t = useTranslations('wizard');
  const curIdx = stepIndex(currentId);
  const isFirst = curIdx === 0;
  const isLast = curIdx === STEPS.length - 1;

  return (
    <div className="border-b border-[#EFE8DD] px-[22px] py-[9px] lg:px-[30px]">
      <div className="flex w-full items-start gap-4">
        {/* Node track — an explicit grid of 15 columns: eight `auto` node columns
            (each sized to the fixed 96px label box) alternating with seven `1fr`
            connector columns. The `1fr` columns absorb ALL slack, so the connectors —
            never the nodes — grow with the viewport, the nodes stay pixel-stable
            across steps, and node 8 sits at the track's right edge against the action
            cluster. The 15 direct children (node, conn, node, conn, … node) map 1:1
            to the columns via grid auto-placement. */}
        <div
          className="grid w-full min-w-0 flex-1 items-start"
          style={{ gridTemplateColumns: 'repeat(7, auto 1fr) auto' }}
        >
          {STEPS.map((s, i) => {
            const no = i + 1;
            const isDone = curIdx > i;
            const isCur = curIdx === i;
            // A node ahead of the current step while advancement is gated: inert +
            // greyed so it reads as "not yet reachable". `goStep` already no-ops the
            // jump; this just makes the block visible. Same-or-earlier nodes stay live.
            const isGatedAhead = advanceBlocked && i > curIdx;
            const showConn = i < STEPS.length - 1;
            return (
              <Fragment key={s.id}>
                <button
                  type="button"
                  onClick={() => onGo(s.id)}
                  disabled={isGatedAhead}
                  aria-disabled={isGatedAhead || undefined}
                  aria-current={isCur ? 'step' : undefined}
                  className={
                    'flex shrink-0 flex-col items-center pt-[1px] text-center' +
                    (isGatedAhead ? ' cursor-not-allowed opacity-50' : '')
                  }
                >
                  <span
                    className={
                      'flex size-[22px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ' +
                      (isDone
                        ? 'bg-teal text-white'
                        : isCur
                          ? 'bg-pink text-white'
                          : 'border border-[#E4DACB] bg-[#F3ECE2] text-[#A79E94]')
                    }
                  >
                    {isDone ? '✓' : no}
                  </span>
                  {/* Fixed-WIDTH, fixed-height label box, identical on every node — so
                      no node ever changes width and the row height never changes
                      between steps. 96px fits the longest label, "Check for
                      understanding", on two lines ("understanding" is the widest single
                      word, ~92px). The optional micro-affordance sits inside the same
                      box. Hidden below `xl`, where eight 96px nodes plus the action
                      cluster no longer fit — a narrower viewport then shows circle-only
                      nodes, still uniform, never overflowing. */}
                  <span className="mt-[5px] hidden h-[36px] w-[96px] flex-col items-center justify-start leading-[1.12] xl:flex">
                    <span
                      dir="auto"
                      className={
                        'line-clamp-2 px-[2px] text-[11.5px] ' +
                        (isCur
                          ? 'font-semibold text-[#2A2422]'
                          : isDone
                            ? 'font-medium text-[#5C544E]'
                            : 'font-medium text-[#A79E94]')
                      }
                    >
                      {t(`steps.${s.id}`)}
                    </span>
                    {s.optional ? (
                      <span className="mt-[1px] text-[9.5px] font-medium uppercase tracking-[0.04em] text-[#B4A99B]">
                        {t('steps.optional')}
                      </span>
                    ) : null}
                  </span>
                </button>
                {showConn ? (
                  // Connector: it carries NO width or flex property — its `1fr` grid
                  // column governs its width (so it grows with the viewport). `w-full`
                  // fills that column; `self-start` + `mt` align it to the circle centre.
                  <span
                    aria-hidden
                    className={
                      'mt-[10px] h-0.5 w-full self-start ' +
                      (isDone ? 'bg-teal' : 'bg-[#E0D6C7]')
                    }
                  />
                ) : null}
              </Fragment>
            );
          })}
        </div>

        <div className="flex w-[300px] shrink-0 items-center justify-end gap-[9px] pt-[1px]">
          {/* Always rendered so the cluster keeps an identical width on every step —
              on the first step it is hidden (but still occupies its box) and made
              inert, so the tracker band doesn't reflow at the 1 ↔ 2 transition. */}
          <button
            type="button"
            onClick={onBack}
            disabled={isFirst}
            tabIndex={isFirst ? -1 : undefined}
            aria-hidden={isFirst ? true : undefined}
            className={
              'rounded-[9px] border border-border-strong bg-surface px-[15px] py-[9px] text-[13px] font-medium text-ink hover:bg-surface-subtle' +
              (isFirst ? ' invisible' : '')
            }
          >
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t('nav.back')}
          </button>
          {isLast ? (
            submitSlot
          ) : (
            <button
              type="button"
              onClick={onNext}
              disabled={advanceBlocked}
              aria-disabled={advanceBlocked || undefined}
              className="min-w-[92px] rounded-[9px] border-none bg-teal px-4 py-[9px] text-center text-[13px] font-semibold text-white hover:bg-[#1a6a5d] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-teal"
            >
              {nextLabel} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
            </button>
          )}
        </div>
      </div>

      {/* Gate reason — one teal line under the tracker, right-aligned beneath the
          advance control, shown only when Next is disabled for gate reasons. */}
      {gateHint ? (
        <div dir="auto" className="mt-1.5 flex justify-end text-[12px] font-medium text-teal">
          <span>{gateHint}</span>
        </div>
      ) : null}
    </div>
  );
}
