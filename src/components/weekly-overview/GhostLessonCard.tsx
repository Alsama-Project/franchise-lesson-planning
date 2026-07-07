'use client';

// The Calendar grid's "not started" curriculum lesson — a GHOST card. It fills its
// (year, period) cell as a fill-less, dotted placeholder against the solid plan
// cards, still showing WHICH lesson it is (subject · year over the daily outcome),
// so the teacher selects a real, identifiable lesson rather than creating from a
// blank picker. This replaces the old dashed "+ Add lesson" button + dropdown.
//
// Selecting a ghost runs the EXACT SAME create path the retired add-menu used —
// `createTeacherPlan` → `createScopedPlan` → route into the editor — binding the
// plan to one of the teacher's OWN classes for the slot: auto when they teach
// exactly one such class, an inline pick when they teach several, a quiet blocked
// note when they teach none (never a read-only centre plan).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { createTeacherPlan, type EligibleClass } from '@/lib/actions/create-lesson';
import { usePlanHref } from '@/components/weekly-overview/BoardReturn';
import { formatNumber } from '@/lib/format';
import type { EmptySlotCard } from '@/components/weekly-overview/cards';

/** The quiet blocked state: the teacher teaches no class for this slot. */
function BlockedNote({ subjectName, year }: { subjectName: string; year: number }) {
  const t = useTranslations('board');
  const locale = useLocale();
  return (
    <p
      dir="auto"
      className="flex h-full flex-col justify-center rounded-[12px] border-[1.5px] border-dashed border-border-strong px-[12px] py-[11px] text-[12px] leading-[1.45] text-text-muted"
    >
      {t('add.noClass', { subject: subjectName, year: formatNumber(year, locale) })}
    </p>
  );
}

/**
 * One ghost card for a not-started curriculum lesson. Mirrors the solid plan card's
 * anatomy (subject · year header over the daily-outcome topic) so the two read as
 * one visual language, but fill-less with only a light dotted border to signal
 * locked curriculum content the teacher can turn into an editable plan.
 */
export function GhostLessonCard({ card }: { card: EmptySlotCard }) {
  const t = useTranslations('board');
  const locale = useLocale();
  const router = useRouter();
  const planHref = usePlanHref();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the teacher teaches several eligible classes for this slot — pick one.
  const [pick, setPick] = useState<EligibleClass[] | null>(null);
  // Set when the teacher teaches no class for this slot — creation is blocked.
  const [blocked, setBlocked] = useState<{ subjectName: string; year: number } | null>(null);

  const topic =
    card.dailyOutcome.trim() ||
    card.focusArea.trim() ||
    t('card.lessonN', { n: formatNumber(card.period, locale) });

  // Create for this slot, binding to the teacher's class. `classId` is set only
  // after the teacher picks from the multi-class picker. Same handler the retired
  // add-menu invoked, with the same arguments.
  const create = async (classId?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await createTeacherPlan({
      lessonKey: card.lessonKey,
      centreId: card.centreId,
      weekday: card.weekday,
      period: card.period,
      classId,
    });
    if (res.ok) {
      // Carry the current week so the new plan's "back to overview" returns here.
      router.push(planHref(`/plan/${res.planId}`));
      return; // keep the card up through the navigation
    }
    setBusy(false);
    if (res.reason === 'pick') {
      setBlocked(null);
      setPick(res.classes);
    } else if (res.reason === 'none') {
      setPick(null);
      setBlocked({ subjectName: res.subjectName, year: res.year });
    } else {
      setError(res.error);
    }
  };

  // No class for this slot — degrade to a quiet blocked note (never throw).
  if (blocked) {
    return <BlockedNote subjectName={blocked.subjectName} year={blocked.year} />;
  }

  const classLabel = (c: EligibleClass): string =>
    `${t('card.year', { n: formatNumber(c.year, locale) })} · ${t(`literacy.${c.literacy}`)}`;

  return (
    <div className="flex h-full flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => create()}
        disabled={busy}
        aria-label={t('card.planAria', { topic })}
        className={cn(
          'group flex w-full flex-1 flex-col rounded-[12px] border-[1.5px] border-dashed border-border-strong px-[12px] py-[11px] text-start transition-colors',
          'hover:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
          busy && 'cursor-not-allowed',
        )}
      >
        <div className="min-w-0">
          <div dir="auto" className="truncate text-[11.5px] font-medium text-text-faint">
            {card.subjectName}
            {card.centreName ? <span className="text-text-faint"> · {card.centreName}</span> : null}
          </div>
          <div className="mt-[1px] text-[17px] font-bold leading-[1.05] text-text-faint">
            {t('card.year', { n: formatNumber(card.year, locale) })}
          </div>
        </div>

        <p dir="auto" className="mt-[7px] line-clamp-2 flex-1 text-[12.5px] leading-[1.45] text-text-muted">
          {topic}
        </p>

        <div className="mt-[9px] flex items-center justify-between gap-[8px]">
          <span className="inline-flex items-center gap-[6px] whitespace-nowrap text-[12px] font-medium text-text-muted">
            <span
              aria-hidden
              className="inline-block h-[8px] w-[8px] rounded-full border-[1.5px] border-status-idle-dot"
            />
            {t('status.not_started')}
          </span>
          <span className="inline-flex flex-shrink-0 items-center rounded-[8px] border border-action-border px-[12px] py-[5px] text-[12px] font-semibold text-teal transition-colors group-hover:border-teal">
            {busy ? t('add.opening') : t('card.plan')}
          </span>
        </div>
      </button>

      {/* The teacher teaches several classes for this slot — pick one, then create. */}
      {pick ? (
        <div className="rounded-[10px] border border-border bg-surface p-[5px]">
          <div className="px-[9px] pb-[4px] pt-[5px] text-[10px] font-bold uppercase tracking-[0.05em] text-text-faint">
            {t('add.chooseClass')}
          </div>
          {pick.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => create(cls.id)}
              disabled={busy}
              className={cn(
                'flex w-full items-center justify-between gap-[8px] rounded-[8px] px-[9px] py-[8px] text-start text-[12.5px] font-semibold transition-colors',
                busy ? 'cursor-not-allowed text-text-faint' : 'text-ink hover:bg-teal-tint hover:text-teal-deep',
              )}
            >
              <span dir="auto">{classLabel(cls)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-[7px] bg-status-review-bg px-[9px] py-[6px] text-[11.5px] text-status-review">
          {error}
        </p>
      ) : null}
    </div>
  );
}
