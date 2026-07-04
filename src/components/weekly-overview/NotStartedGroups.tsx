'use client';

// The "Not started" column body — a stack of collapsible group cards, one per
// class (subject, year), ported from the grouped Status-board design. A long flat
// roster of "Year N" slots isn't actionable; grouping by class and showing "N to
// plan" is. Groups are expanded by default and collapse to tidy.
//
// Each row is a fixed curriculum lesson with no plan yet, so the whole row opens
// the scope chooser (create-and-open) — the "Plan" pill is a styled affordance,
// not a nested button. This is the only "Not started" surface; the coordinator
// (read-only) board omits the column entirely.

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { useScopeChooser } from '@/components/weekly-overview/ScopeChooser';
import type { EmptySlotCard } from '@/components/weekly-overview/cards';
import { WEEKDAYS, type Weekday } from '@/lib/week';

/** The Mon–Fri key (1..5 → 'mon'..'fri') for a slot's weekday, clamped in range. */
function weekdayKey(weekday: number): Weekday {
  const i = Math.min(5, Math.max(1, Math.trunc(weekday))) - 1;
  return WEEKDAYS[i];
}

/** One class (subject, year) and its un-planned curriculum slots this week. */
interface ClassGroup {
  key: string;
  subjectName: string;
  centreName: string | null;
  year: number;
  rows: EmptySlotCard[];
}

/** Group the flat "Not started" cards by class = (subject, centre, year). */
function groupByClass(cards: EmptySlotCard[]): ClassGroup[] {
  const map = new Map<string, ClassGroup>();
  for (const c of cards) {
    const key = `${c.subjectCode}|${c.centreId}|${c.year}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        subjectName: c.subjectName,
        centreName: c.centreName,
        year: c.year,
        rows: [],
      };
      map.set(key, group);
    }
    group.rows.push(c);
  }
  const groups = [...map.values()];
  groups.sort(
    (a, b) =>
      a.subjectName.localeCompare(b.subjectName) ||
      (a.centreName ?? '').localeCompare(b.centreName ?? '') ||
      a.year - b.year,
  );
  for (const g of groups) g.rows.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
  return groups;
}

export function NotStartedGroups({ cards }: { cards: EmptySlotCard[] }) {
  const groups = groupByClass(cards);
  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <GroupCard key={group.key} group={group} />
      ))}
    </div>
  );
}

/** A collapsible group card — header (class + "N to plan" + chevron) over its rows. */
function GroupCard({ group }: { group: ClassGroup }) {
  const t = useTranslations('board');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface-subtle">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-[17px] py-[15px] text-start"
      >
        <div className="min-w-0">
          <div dir="auto" className="truncate text-[12px] font-medium text-text-faint">
            {group.subjectName}
            {group.centreName ? <span className="text-text-faint"> · {group.centreName}</span> : null}
          </div>
          <div className="mt-[1px] text-[16px] font-bold leading-[1.1] text-ink">
            {t('card.year', { n: formatNumber(group.year, locale) })}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-[8px]">
          <span className="text-[11.5px] font-semibold text-text-muted">
            {t('statusView.toPlan', { count: formatNumber(group.rows.length, locale) })}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={cn(
              'text-text-faint transition-transform rtl:-scale-x-100',
              expanded && 'rotate-90',
            )}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-neutral-100">
          {group.rows.map((row, i) => (
            <div key={row.key} className={cn(i > 0 && 'border-t border-neutral-100')}>
              <NotStartedRow card={row} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One un-planned slot row: day · period over its topic, with a "Plan" affordance. */
function NotStartedRow({ card }: { card: EmptySlotCard }) {
  const t = useTranslations('board');
  const locale = useLocale();
  const { openChooser } = useScopeChooser();

  const dayPeriod = t('card.dayPeriod', {
    day: t(`weekday.${weekdayKey(card.weekday)}`),
    n: formatNumber(card.period, locale),
  });
  const topic =
    card.dailyOutcome.trim() ||
    card.focusArea.trim() ||
    t('card.lessonN', { n: formatNumber(card.period, locale) });

  const open = () =>
    openChooser({
      lessonKey: card.lessonKey,
      year: card.year,
      centreId: card.centreId,
      dailyOutcome: card.dailyOutcome,
      weekday: card.weekday,
      period: card.period,
    });

  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center justify-between gap-3 px-[17px] py-[10px] text-start transition-colors hover:bg-surface-cream"
    >
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold text-text-faint">{dayPeriod}</div>
        <p dir="auto" className="mt-[2px] line-clamp-2 text-[12.5px] leading-[1.4] text-neutral-900">
          {topic}
        </p>
      </div>
      <span className="inline-flex flex-shrink-0 items-center rounded-[7px] border border-action-border px-[10px] py-[4px] text-[11.5px] font-semibold text-teal">
        {t('card.plan')}
      </span>
    </button>
  );
}
