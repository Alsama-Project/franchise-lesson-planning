'use client';

import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/** Step keys, in order, into the `wizard.steps` message namespace. */
export const WIZARD_STEPS: { key: string }[] = [
  { key: 'objective' },
  { key: 'teachIt' },
  { key: 'practise' },
  { key: 'linkIt' },
  { key: 'review' },
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
  const t = useTranslations('wizard');
  const isLast = step === STEP_COUNT;
  return (
    <div className="border-b border-[#EFE8DD] px-[22px] py-[15px] lg:px-[30px]">
      {/* Each stage is a shrink-0 cluster (30px circle + its label, sized to the
          label so "SMARTT objective" shows in full — never truncated). The
          connectors between stages are flex-1 SIBLINGS, so they each take an equal
          share of the leftover width: the connector lines stay visible and evenly
          spaced regardless of how wide any one label is. The action cluster keeps a
          FIXED width so swapping Next → Review → Submit never reflows the row. */}
      <div className="flex items-center">
        {WIZARD_STEPS.map((s, i) => {
          const no = i + 1;
          const isDone = step > no;
          const isCur = step === no;
          const showConn = i < STEP_COUNT - 1;
          return (
            <Fragment key={s.key}>
              <button
                type="button"
                onClick={() => onGo(no)}
                className="flex shrink-0 items-center gap-[10px] text-start"
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
                    'hidden whitespace-nowrap text-[13px] sm:block ' +
                    (isCur ? 'font-semibold text-ink' : isDone ? 'font-medium text-neutral-800' : 'font-medium text-neutral-400')
                  }
                >
                  {t(`steps.${s.key}`)}
                </span>
              </button>
              {showConn ? (
                <span
                  className={
                    'mx-[10px] h-0.5 min-w-[14px] flex-1 rounded-full ' +
                    (isDone ? 'bg-teal' : 'bg-[#E0D6C7]')
                  }
                />
              ) : null}
            </Fragment>
          );
        })}

        <div className="ms-4 flex w-[300px] shrink-0 items-center justify-end gap-[9px]">
          {/* Always rendered so the cluster keeps an identical width on every
              step — on Step 1 it is hidden (but still occupies its box) and
              made inert, so the stepper band doesn't reflow at the 1 ↔ 2
              transition. */}
          <button
            type="button"
            onClick={onBack}
            disabled={step === 1}
            tabIndex={step === 1 ? -1 : undefined}
            aria-hidden={step === 1 ? true : undefined}
            className={
              'rounded-[9px] border border-border-strong bg-surface px-[15px] py-[9px] text-[13px] font-medium text-ink hover:bg-surface-subtle' +
              (step === 1 ? ' invisible' : '')
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
              className="min-w-[92px] rounded-[9px] border-none bg-teal px-4 py-[9px] text-center text-[13px] font-semibold text-white hover:bg-[#1a6a5d]"
            >
              {nextLabel} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
