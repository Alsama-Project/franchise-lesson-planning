'use client';

// The board's planned-lesson card — one visual language shared by the Calendar
// (day-column) and Status (kanban) views, ported from the grouped Status-board
// design. A single `PlannedCard` renders both; the thin `CalendarLessonCard` /
// `StatusLessonCard` wrappers keep the two call sites named.
//
// Anatomy (top → bottom):
//   • top row:  subject (muted label) over "Year N" (bold)   ·  assignee avatar
//   • meta row: "Mon · P2" (day · period)                     ·  topic (2 lines)
//   • foot row: status pill                                   ·  Open / Review
//
// The topic line is the daily learning outcome (stem-cleaned); when a lesson has
// none it degrades to "Lesson N" so the line is never empty. The action label is
// role-driven: a teacher opens the editor ("Open"), a coordinator opens the
// read-only review surface ("Review") — driven by the same `readOnly` flag that
// already routes the card's link, not a bespoke prop. "Not started" slots are not
// cards here — they render as the grouped accordion (see NotStartedGroups).

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { CardShell } from '@/components/weekly-overview/CardShell';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import { OwnerAvatar } from '@/components/weekly-overview/OwnerAvatar';
import type { PlanCard } from '@/components/weekly-overview/cards';
import { formatNumber } from '@/lib/format';
import { WEEKDAYS, type Weekday } from '@/lib/week';

/** The Mon–Fri key (1..5 → 'mon'..'fri') for a card's weekday, clamped in range. */
function weekdayKey(weekday: number): Weekday {
  const i = Math.min(5, Math.max(1, Math.trunc(weekday))) - 1;
  return WEEKDAYS[i];
}

/**
 * The shared planned-lesson card. The whole card is a link to the plan (the editor
 * or the read-only review view), so the "Open / Review" pill is a styled affordance,
 * not a nested button.
 */
function PlannedCard({
  card,
  readOnly = false,
  showSchedule = true,
}: {
  card: PlanCard;
  readOnly?: boolean;
  /**
   * Show the "Mon · P2" day·period line. True on the Status view (the
   * differentiator within a status column); false on the Calendar view, where the
   * day and period already live in the column header.
   */
  showSchedule?: boolean;
}) {
  const t = useTranslations('board');
  const locale = useLocale();

  const dayPeriod = t('card.dayPeriod', {
    day: t(`weekday.${weekdayKey(card.weekday)}`),
    n: formatNumber(card.period, locale),
  });
  const topic = card.topic.trim() || t('card.lessonN', { n: formatNumber(card.period, locale) });

  return (
    <CardShell planId={card.planId} canEdit={card.canEdit} readOnly={readOnly}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div dir="auto" className="truncate text-[12px] font-medium text-text-faint">
            {card.subjectName}
            {card.centreName ? <span className="text-text-faint"> · {card.centreName}</span> : null}
          </div>
          <div className="mt-[2px] text-[16px] font-bold leading-[1.1] text-ink">
            {t('card.year', { n: formatNumber(card.year, locale) })}
          </div>
        </div>
        {card.owner ? <OwnerAvatar owner={card.owner} size={38} /> : null}
      </div>

      <div className="mt-[11px]">
        {showSchedule ? (
          <div className="text-[11px] font-semibold text-text-faint">{dayPeriod}</div>
        ) : null}
        <p
          dir="auto"
          className={cn(
            'line-clamp-2 text-[13px] leading-[1.4] text-text-muted',
            showSchedule && 'mt-[3px]',
          )}
        >
          {topic}
        </p>
      </div>

      <div className="mt-[12px] flex items-center justify-between gap-2">
        <StatusChip status={card.status} />
        <span className="inline-flex flex-shrink-0 items-center rounded-[8px] border border-action-border px-[14px] py-[5px] text-[11.5px] font-semibold text-teal">
          {readOnly ? t('card.review') : t('card.open')}
        </span>
      </div>
    </CardShell>
  );
}

/** Calendar-view planned card. */
export function CalendarLessonCard({
  card,
  readOnly = false,
}: {
  card: PlanCard;
  readOnly?: boolean;
}) {
  // The Calendar column header already carries the day and period, so the card's
  // day·period line is redundant here — drop it (topic moves up under the header).
  return <PlannedCard card={card} readOnly={readOnly} showSchedule={false} />;
}

/** Status-view planned card (individual cards in the four real-status columns). */
export function StatusLessonCard({
  card,
  readOnly = false,
}: {
  card: PlanCard;
  readOnly?: boolean;
}) {
  return <PlannedCard card={card} readOnly={readOnly} />;
}
