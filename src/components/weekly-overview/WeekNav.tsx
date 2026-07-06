'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { WeekPicker, type WeekPickerOption } from '@/components/common/WeekPicker';
import type { BoardCoordinate, BoardWeekOption } from '@/types/weekly-overview';

type View = 'calendar' | 'status';

function href(coord: { month: string; week: number }, view: View): string {
  return `/?month=${encodeURIComponent(coord.month)}&week=${coord.week}&view=${view}`;
}

/**
 * Curriculum-week navigation for the board: prev / next arrows step through the
 * scheme of work by (month, week) — NOT by calendar date — and the centre label
 * opens a month → week picker that jumps straight to any coordinate. Both routes
 * set the SAME `?month=&week=` params, so the picker and the arrows share one
 * numbering (each option carries its flat `weekNo`, derived from the same ordered
 * scheme of work).
 *
 * The label shows the 1-based teaching "Week {n}" (e.g. "Week 36"). The shown
 * week's real Monday (`mondayLabel`, from `term_week`) is folded in as muted
 * secondary text — "Week 36 · Dec 15" — and "· current" is appended only when today
 * falls in the shown week. The curriculum coordinate ("March · Week 2") rides along
 * as the tooltip. An arrow is disabled at the start/end of the synced curriculum.
 * The selected view is carried along so navigating keeps it.
 *
 * The picker control itself is the shared {@link WeekPicker}, also used by the
 * Curriculum browser — this component only maps board data onto it.
 */
export function WeekNav({
  weekNo,
  isCurrent,
  mondayLabel,
  coordinateLabel,
  coordinate,
  weeks,
  prev,
  next,
  currentWeek,
  view,
}: {
  weekNo: number;
  isCurrent: boolean;
  /** The shown week's Monday, pre-formatted short (e.g. "Dec 15"); null when the
   *  `term_week` table has no row for it. */
  mondayLabel: string | null;
  coordinateLabel: string;
  coordinate: BoardCoordinate;
  weeks: BoardWeekOption[];
  prev: BoardCoordinate | null;
  next: BoardCoordinate | null;
  /** The coordinate the "This week" button jumps to (today's or nearest seeded term
   *  week); null when nothing maps, so the button is hidden. */
  currentWeek: BoardCoordinate | null;
  view: View;
}) {
  const t = useTranslations('board');
  const locale = useLocale();

  const label =
    weekNo > 0 ? t('weekNav.weekNumber', { n: formatNumber(weekNo, locale) }) : t('weekNav.empty');

  // Date (and the "current" marker) ride as muted secondary text stacked beneath
  // the "Week N" label — e.g. "Dec 15", "current", or "Dec 15 · current". No leading
  // separator: it sits on its own line under the label, not inline after it.
  const current = t('weekNav.current');
  let meta: string | undefined;
  if (mondayLabel && isCurrent) meta = `${mondayLabel} · ${current}`;
  else if (mondayLabel) meta = mondayLabel;
  else if (isCurrent) meta = current;

  const options: WeekPickerOption[] = weeks.map((w) => ({
    month: w.month,
    week: w.week,
    label: t('weekNav.weekNumber', { n: formatNumber(w.weekNo, locale) }),
    href: href(w, view),
    active: w.month === coordinate.month && w.week === coordinate.week,
  }));

  // The "This week" jump appears only when a real (current or nearest seeded) week
  // exists AND the board isn't already showing it — a one-click return to "now" after
  // browsing ahead. It never changes which week loads by default.
  const showThisWeek =
    currentWeek != null &&
    !(currentWeek.month === coordinate.month && currentWeek.week === coordinate.week);

  return (
    <div className="flex items-center gap-[10px]">
      <WeekPicker
        label={label}
        meta={meta}
        tooltip={coordinateLabel}
        defaultMonth={coordinate.month || null}
        options={options}
        prevHref={prev ? href(prev, view) : null}
        nextHref={next ? href(next, view) : null}
        labels={{
          previousWeek: t('weekNav.previousWeek'),
          nextWeek: t('weekNav.nextWeek'),
          unavailable: (label) => t('weekNav.unavailable', { label }),
          monthHeading: t('weekNav.picker.month'),
          weekHeading: t('weekNav.picker.week'),
        }}
      />
      {showThisWeek ? (
        <Link
          href={href(currentWeek, view)}
          className="inline-flex items-center rounded-[10px] border border-border px-[11px] py-[8px] text-[12.5px] font-semibold text-text-muted transition-colors hover:border-teal hover:text-teal"
        >
          {t('weekNav.thisWeek')}
        </Link>
      ) : null}
    </div>
  );
}
