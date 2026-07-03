'use client';

// The per-column "+ Add lesson" affordance. Clicking a day column already fixes
// the period (the column = a curriculum period), the month and the week, so the
// curriculum lesson is fully determined once a year group is chosen — no need for
// the full NEW LESSON popup with its period-card picker. This is that lightweight
// year-group dropdown: pick a year, the lesson for (subject, year, current month,
// current week, this period) is created/opened directly at whole-centre scope.
//
// This replaced the old NEW LESSON popup entirely — every per-column add resolves
// its curriculum lesson here, and all-centres planning needs no separate entry.
//
// The menu opens inline (in the column's flow) rather than as an absolute overlay:
// the board scrolls horizontally (`overflow-x-auto`), which makes vertical overflow
// a scroll/clip boundary, so an absolutely-positioned dropdown from the bottom-of-
// column button would be clipped. An inline panel grows the column instead.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { createScopedPlan } from '@/lib/actions/create-lesson';
import { usePlanHref } from '@/components/weekly-overview/BoardReturn';
import { formatNumber } from '@/lib/format';

/** One band offered for this column, resolved to its curriculum lesson. */
export interface AddYearChoice {
  /** Stable band identity (`centreId|subjectCode|year`) — the choice key. */
  bandKey: string;
  year: number;
  /** The subject this choice creates against (board can span subjects). */
  subjectName: string;
  /** The centre to create against; label shown only when the board spans centres. */
  centreId: string;
  centreName: string | null;
  /** The lesson for this (band, period), or null when the curriculum has none. */
  lessonKey: string | null;
  /** The day-ordinal sort hint to write (next in this band's stack for the column). */
  period: number;
}

export function AddLessonMenu({
  weekday,
  choices,
  spansMultipleSubjects,
}: {
  /** The Mon–Fri column (1..5) — also the curriculum period the lessons resolve to. */
  weekday: number;
  /** The teacher's bands, each resolved to this column's curriculum lesson. */
  choices: AddYearChoice[];
  /** Whether the board spans subjects — decides "Year N" vs "Subject · Year N" labels. */
  spansMultipleSubjects: boolean;
}) {
  const t = useTranslations('board');
  const locale = useLocale();
  const router = useRouter();
  const planHref = usePlanHref();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (choice: AddYearChoice) => {
    if (!choice.lessonKey || busyKey !== null) return;
    setBusyKey(choice.bandKey);
    setError(null);
    // Whole-centre scope: the column fixes the period/day, month and week, and the
    // slot names its own centre; the create action resolves subject/year server-side
    // from the locked key and creates against the passed centre.
    const res = await createScopedPlan({
      lessonKey: choice.lessonKey,
      scope: 'centre',
      schoolId: choice.centreId,
      weekday,
      period: choice.period,
    });
    if (res.ok) {
      // Carry the current week so the new plan's "back to overview" returns here.
      router.push(planHref(`/plan/${res.planId}`));
      return; // keep the menu up through the navigation
    }
    setError(res.error);
    setBusyKey(null);
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center justify-center gap-[5px] rounded-[10px] border border-dashed px-[12px] py-[10px] text-[11.5px] font-semibold transition-colors',
          open
            ? 'border-teal text-teal'
            : 'border-border-strong text-text-muted hover:border-teal hover:text-teal',
        )}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t('addLesson')}
      </button>

      {open ? (
        <div className="rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_28px_-14px_rgba(0,0,0,0.4)]">
          <div className="px-[9px] pb-[4px] pt-[5px] text-[10px] font-bold uppercase tracking-[0.05em] text-text-faint">
            {spansMultipleSubjects ? t('add.chooseLesson') : t('add.chooseYear')}
          </div>
          {choices.map((c) => {
            const unavailable = !c.lessonKey;
            const busy = busyKey === c.bandKey;
            const disabled = unavailable || busyKey !== null;
            const yearLabel = t('card.year', { n: formatNumber(c.year, locale) });
            const label = spansMultipleSubjects ? `${c.subjectName} · ${yearLabel}` : yearLabel;
            return (
              <button
                key={c.bandKey}
                type="button"
                onClick={() => choose(c)}
                disabled={disabled}
                className={cn(
                  'flex w-full items-center justify-between gap-[8px] rounded-[8px] px-[9px] py-[8px] text-start text-[12.5px] font-semibold transition-colors',
                  disabled
                    ? 'cursor-not-allowed text-text-faint'
                    : 'text-ink hover:bg-teal-tint hover:text-teal-deep',
                )}
              >
                <span className="min-w-0 truncate" dir="auto">
                  {label}
                  {c.centreName ? (
                    <span className="font-normal text-text-faint"> · {c.centreName}</span>
                  ) : null}
                </span>
                {busy ? (
                  <span className="text-[11px] font-medium text-text-muted">{t('add.opening')}</span>
                ) : unavailable ? (
                  <span className="text-[11px] font-medium text-text-faint">{t('add.noLesson')}</span>
                ) : null}
              </button>
            );
          })}

          {error ? (
            <p className="mx-[5px] mb-[4px] mt-[3px] rounded-[7px] bg-status-review-bg px-[9px] py-[6px] text-[11.5px] text-status-review">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
