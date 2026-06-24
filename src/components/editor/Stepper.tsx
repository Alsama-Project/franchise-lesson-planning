'use client';

import type { ReactNode } from 'react';

export const WIZARD_STEPS: { label: string }[] = [
  { label: 'Objective' },
  { label: 'Teach it' },
  { label: 'Practise' },
  { label: 'Link it' },
  { label: 'Review' },
];

export const STEP_COUNT = WIZARD_STEPS.length;

/**
 * The stepper band: five clickable steps (done = teal check, current = pink
 * halo, upcoming = muted) joined by connectors that fill teal as you advance,
 * with the Back + Next/Submit group pinned to the right end.
 */
export function Stepper({
  step,
  onGo,
  onBack,
  onNext,
  nextLabel,
  submitSlot,
}: {
  step: number;
  onGo: (n: number) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  /** Rendered in place of "Next" on the final step (the submit control). */
  submitSlot: ReactNode;
}) {
  const isLast = step === STEP_COUNT;
  return (
    <div className="border-b border-[#EFE8DD] px-[22px] py-[15px] lg:px-[30px]">
      <div className="flex items-center">
        {WIZARD_STEPS.map((s, i) => {
          const no = i + 1;
          const isDone = step > no;
          const isCur = step === no;
          const showConn = i < STEP_COUNT - 1;
          return (
            <div
              key={s.label}
              className={showConn ? 'flex min-w-0 flex-1 items-center' : 'flex shrink-0 items-center'}
            >
              <button
                type="button"
                onClick={() => onGo(no)}
                className="flex items-center gap-[10px] text-left"
              >
                <span
                  className={
                    'flex size-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ' +
                    (isDone
                      ? 'bg-teal text-white'
                      : isCur
                        ? 'bg-pink text-white shadow-[0_0_0_5px_rgba(182,42,92,0.14)]'
                        : 'border border-[#E4DACB] bg-[#F3ECE2] text-neutral-400')
                  }
                >
                  {isDone ? '✓' : no}
                </span>
                <span
                  className={
                    'hidden text-[13px] sm:block ' +
                    (isCur ? 'font-semibold text-ink' : isDone ? 'font-medium text-neutral-800' : 'font-medium text-neutral-400')
                  }
                >
                  {s.label}
                </span>
              </button>
              {showConn ? (
                <span
                  className={
                    'mx-1.5 h-0.5 min-w-[14px] flex-1 ' + (isDone ? 'bg-teal' : 'bg-[#E0D6C7]')
                  }
                />
              ) : null}
            </div>
          );
        })}

        <div className="ml-5 flex shrink-0 gap-[9px]">
          {step > 1 ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-[9px] border border-border-strong bg-surface px-[15px] py-[9px] text-[13px] font-medium text-ink hover:bg-surface-subtle"
            >
              ← Back
            </button>
          ) : null}
          {isLast ? (
            submitSlot
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="min-w-[92px] rounded-[9px] border-none bg-teal px-4 py-[9px] text-center text-[13px] font-semibold text-white hover:bg-[#1a6a5d]"
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
