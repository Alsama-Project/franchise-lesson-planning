import { cn } from '@/lib/cn';
import { WEEKDAYS, WEEKDAY_LABELS } from '@/lib/week';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import { CardShell } from '@/components/weekly-overview/CardShell';
import { cardsForWeekday, timeLabel, type LessonCard } from '@/components/weekly-overview/cards';
import type { ClassWeek } from '@/types/weekly-overview';

/**
 * Calendar view — a column per weekday (Mon–Fri). Each column has a day + date
 * header (today marked with a teal "TODAY" pill and a teal underline) and its
 * lesson cards stacked by time of day. Each card carries its time line, class and
 * status badge; planned cards open the editor, "Not started" cards are inert.
 */
export function CalendarView({ classes }: { classes: ClassWeek[] }) {
  // The five weekdays carry the same date for every class, so read each day's
  // date/today flag off the first class's slot.
  const sample = classes[0];

  const days = WEEKDAYS.map((weekday) => {
    const slot = sample.slots.find((s) => s.weekday === weekday);
    return {
      weekday,
      dayName: WEEKDAY_LABELS[weekday],
      dateNum: slot ? Number(slot.date.slice(8, 10)) : null,
      isToday: slot?.isToday ?? false,
      cards: cardsForWeekday(classes, weekday),
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
              <div className="py-[14px] text-center text-[12px] text-text-faint">
                No sessions
              </div>
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
      <div className="text-[11.5px] font-semibold text-text-faint">
        {timeLabel(card.period)}
      </div>
      <div className="mb-[9px] mt-[3px] text-[14px] font-semibold">{card.classLabel}</div>
      <StatusChip status={card.status} />
    </CardShell>
  );
}
