'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { LinkPending } from '@/components/ui/LinkPending';
import { formatNumber } from '@/lib/format';
import type { BoardCoordinate, BoardWeekOption } from '@/types/weekly-overview';

type View = 'calendar' | 'status';

function href(coord: { month: string; week: number }, view: View): string {
  return `/?month=${encodeURIComponent(coord.month)}&week=${coord.week}&view=${view}`;
}

/**
 * Curriculum-week navigation: prev / next arrows step through the scheme of work
 * by (month, week) — NOT by calendar date — and the centre label opens a month →
 * week picker that jumps straight to any coordinate. Both routes set the SAME
 * `?month=&week=` params, so the picker and the arrows share one numbering (each
 * option carries its flat `weekNo`, derived from the same ordered scheme of work).
 *
 * The label shows the 1-based teaching "Week {n}" (e.g. "Week 36"), with
 * "· current" appended only when today falls in the shown week (proven by a
 * `term_week` row; never shown while that table is empty). The curriculum
 * coordinate ("March · Week 2") rides along as the tooltip. An arrow is disabled
 * at the start/end of the synced curriculum. The selected view is carried along so
 * navigating keeps it.
 */
export function WeekNav({
  weekNo,
  isCurrent,
  coordinateLabel,
  coordinate,
  weeks,
  prev,
  next,
  view,
}: {
  weekNo: number;
  isCurrent: boolean;
  coordinateLabel: string;
  coordinate: BoardCoordinate;
  weeks: BoardWeekOption[];
  prev: BoardCoordinate | null;
  next: BoardCoordinate | null;
  view: View;
}) {
  const t = useTranslations('board');
  return (
    <div className="flex items-center gap-[6px]">
      <NavButton
        href={prev ? href(prev, view) : null}
        label={t('weekNav.previousWeek')}
        dir="left"
      />
      <WeekPicker
        weekNo={weekNo}
        isCurrent={isCurrent}
        coordinateLabel={coordinateLabel}
        coordinate={coordinate}
        weeks={weeks}
        view={view}
      />
      <NavButton href={next ? href(next, view) : null} label={t('weekNav.nextWeek')} dir="right" />
    </div>
  );
}

/**
 * The centre label as a picker trigger. Click it to open a two-step menu — choose
 * a month, then a week within it — which navigates to that coordinate. Falls back
 * to a plain label when no curriculum is synced (nothing to pick).
 */
function WeekPicker({
  weekNo,
  isCurrent,
  coordinateLabel,
  coordinate,
  weeks,
  view,
}: {
  weekNo: number;
  isCurrent: boolean;
  coordinateLabel: string;
  coordinate: BoardCoordinate;
  weeks: BoardWeekOption[];
  view: View;
}) {
  const t = useTranslations('board');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Which month's weeks are shown in step two; defaults to the current month.
  const [month, setMonth] = useState<string | null>(coordinate.month || null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Months in scheme-of-work order (the weeks list is already ordered), deduped.
  const months = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of weeks) {
      if (!seen.has(w.month)) {
        seen.add(w.month);
        out.push(w.month);
      }
    }
    return out;
  }, [weeks]);

  const activeMonth = month && months.includes(month) ? month : months[0] ?? null;
  const monthWeeks = useMemo(
    () => weeks.filter((w) => w.month === activeMonth),
    [weeks, activeMonth],
  );

  const labelText =
    weekNo > 0 ? t('weekNav.weekNumber', { n: formatNumber(weekNo, locale) }) : t('weekNav.empty');

  // No curriculum to pick from → keep the static label (matches the old behaviour).
  if (weeks.length === 0) {
    return (
      <span
        className="min-w-[150px] text-center text-[14px] font-semibold"
        title={coordinateLabel}
      >
        {labelText}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setMonth(coordinate.month || null);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={coordinateLabel}
        className="inline-flex min-w-[150px] items-center justify-center gap-[5px] rounded-[8px] px-[8px] py-[5px] text-[14px] font-semibold transition-colors hover:bg-surface-subtle"
      >
        <span>{labelText}</span>
        {isCurrent ? (
          <span className="font-normal text-neutral-500">{t('weekNav.current')}</span>
        ) : null}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A79E94"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute start-1/2 z-30 mt-[4px] flex max-h-[300px] w-[300px] -translate-x-1/2 overflow-hidden rounded-[12px] border border-border bg-surface shadow-card rtl:translate-x-1/2">
          {/* Step one: months */}
          <div className="w-1/2 overflow-y-auto border-e border-border py-[4px]">
            <p className="px-[12px] pb-[4px] pt-[6px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-faint">
              {t('weekNav.picker.month')}
            </p>
            {months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonth(m)}
                className={cn(
                  'flex w-full items-center justify-between px-[12px] py-[7px] text-start text-[12.5px] transition-colors hover:bg-surface-subtle',
                  m === activeMonth ? 'font-semibold text-teal-deep' : 'text-neutral-900',
                )}
              >
                <span dir="auto">{m}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="text-text-faint rtl:-scale-x-100"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>

          {/* Step two: weeks in the chosen month */}
          <div className="w-1/2 overflow-y-auto py-[4px]">
            <p className="px-[12px] pb-[4px] pt-[6px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-faint">
              {t('weekNav.picker.week')}
            </p>
            {monthWeeks.map((w) => {
              const active = w.month === coordinate.month && w.week === coordinate.week;
              return (
                <Link
                  key={`${w.month}-${w.week}`}
                  href={href(w, view)}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block px-[12px] py-[7px] text-start text-[12.5px] transition-colors hover:bg-surface-subtle',
                    active ? 'font-semibold text-teal-deep' : 'text-neutral-900',
                  )}
                >
                  {t('weekNav.weekNumber', { n: formatNumber(w.weekNo, locale) })}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavButton({
  href,
  label,
  dir,
}: {
  href: string | null;
  label: string;
  dir: 'left' | 'right';
}) {
  const t = useTranslations('board');
  const arrow = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="rtl:-scale-x-100"
    >
      {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );

  if (!href) {
    return (
      <span
        aria-label={t('weekNav.unavailable', { label })}
        aria-disabled="true"
        className="inline-flex size-8 cursor-not-allowed items-center justify-center rounded-[8px] border border-border bg-surface text-text-faint opacity-40"
      >
        {arrow}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="relative inline-flex size-8 items-center justify-center rounded-[8px] border border-border bg-surface transition-colors hover:bg-surface-subtle"
    >
      <LinkPending size={15} className="absolute inset-0 items-center justify-center" />
      {arrow}
    </Link>
  );
}
