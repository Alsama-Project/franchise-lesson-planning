'use client';

import { cn } from '@/lib/cn';
import { WEEKDAYS, WEEKDAY_LABELS } from '@/lib/week';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import { CardShell } from '@/components/weekly-overview/CardShell';
import { OwnerAvatar } from '@/components/weekly-overview/OwnerAvatar';
import { cardsForWeekday, timeLabel, type LessonCard } from '@/components/weekly-overview/cards';
import { useCreateLesson } from '@/components/create-lesson/CreateLessonContext';
import type { ClassWeek } from '@/types/weekly-overview';

/**
 * Calendar view — a column per weekday (Mon–Fri). Each column has a day + date
 * header (today marked with a teal "TODAY" pill and a teal underline) and the
 * day's planned lesson cards, stacked by time of day. A card carries its time
 * line, class, status badge and the owner's avatar; it opens the editor.
 *
 * A fully-unplanned day shows a single dashed "+ Plan" card that opens the create
 * dialog pre-seeded with that date. A day that already has plans shows only those
 * (no per-class blanks — those gaps surface in the Status "Not started" column).
 */
export function CalendarView({ classes }: { classes: ClassWeek[] }) {
  const { openCreate } = useCreateLesson();

  // The five weekdays carry the same date for every class, so read each day's
  // date/today flag off the first class's slot.
  const sample = classes[0];

  const days = WEEKDAYS.map((weekday) => {
    const slot = sample.slots.find((s) => s.weekday === weekday);
    // Only planned cards show in Calendar; "not started" gaps live in Status.
    const planned = cardsForWeekday(classes, weekday).filter((c) => c.planId);
    return {
      weekday,
      dayName: WEEKDAY_LABELS[weekday],
      date: slot?.date ?? null,
      dateNum: slot ? Number(slot.date.slice(8, 10)) : null,
      isToday: slot?.isToday ?? false,
      cards: planned,
    };
  });

  return (
    <div>
      <div className="grid grid-cols-5 items-start gap-[14px]">
        {days.map((day) => (
          <div key={day.weekday} className="flex flex-col gap-[11px]">
            <div
              className={cn(
                'flex items-baseline gap-[7px] border-b-2 px-[2px] pb-[10px]',
                day.isToday ? 'border-teal' : 'border-neutral-200',
              )}
            >
              <span
                className={cn(
                  'text-[14px] font-bold',
                  day.isToday ? 'text-status-submitted' : 'text-ink',
                )}
              >
                {day.dayName} {day.dateNum}
              </span>
              {day.isToday ? (
                <span className="rounded-[5px] bg-status-submitted-bg px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.04em] text-teal">
                  Today
                </span>
              ) : null}
            </div>

            {day.cards.length === 0 ? (
              <button
                type="button"
                onClick={() => day.date && openCreate({ date: day.date })}
                className="flex items-center justify-center gap-[6px] rounded-[13px] border-[1.5px] border-dashed border-border-strong px-[14px] py-[16px] text-[12.5px] font-semibold text-teal transition-colors hover:bg-surface-subtle"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F7A6C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Plan
              </button>
            ) : (
              day.cards.map((card) => <CalendarCard key={card.key} card={card} />)
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarCard({ card }: { card: LessonCard }) {
  return (
    <CardShell planId={card.planId}>
      <div className="text-[11.5px] font-semibold text-text-faint">{timeLabel(card.period)}</div>
      <div className="mb-[9px] mt-[3px] text-[14px] font-semibold">{card.classLabel}</div>
      <div className="flex items-center justify-between gap-2">
        <StatusChip status={card.status} />
        {card.owner ? <OwnerAvatar owner={card.owner} /> : null}
      </div>
    </CardShell>
  );
}
