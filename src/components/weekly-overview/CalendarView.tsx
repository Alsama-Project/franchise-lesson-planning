'use client';

import { CalendarLessonCard, NotStartedLessonCard } from '@/components/weekly-overview/LessonCard';
import { WEEKDAYS, WEEKDAY_LABELS, todayISO, weekdayOf, type Weekday } from '@/lib/week';
import type { BoardSlot, BoardYear } from '@/types/weekly-overview';

/**
 * Calendar view — the school week laid out as five weekday columns (Mon–Fri).
 * Each curriculum period maps to a weekday (P1 = Mon … P5 = Fri), so a column
 * stacks every taught year's lesson for that day, top to bottom — there are no
 * year-group headings; the period reads from each card's "Period #" subtitle.
 * Today's column is marked with the teal TODAY pill.
 *
 * Each slot still renders the restored lesson card: every plan covering it is a
 * CalendarLessonCard; an uncovered slot is the "Not started" card (the per-slot
 * "+ Plan" affordance). A covered slot keeps the quiet "+ make your own".
 */
export function CalendarView({
  years,
  ownerId,
}: {
  years: BoardYear[];
  ownerId: string | null;
}) {
  // Highlight today's weekday column. weekdayOf returns null on weekends, so no
  // column is marked then — which is correct for a Mon–Fri school week.
  const today = weekdayOf(todayISO());

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-5 items-start gap-[14px]">
        {WEEKDAYS.map((weekday) => (
          <DayHeader key={`head-${weekday}`} weekday={weekday} isToday={weekday === today} />
        ))}
        {WEEKDAYS.map((weekday, i) => (
          <DayColumn key={`col-${weekday}`} period={i + 1} years={years} ownerId={ownerId} />
        ))}
      </div>
    </div>
  );
}

/** A weekday column header — the day label plus a TODAY pill on today's column. */
function DayHeader({ weekday, isToday }: { weekday: Weekday; isToday: boolean }) {
  return (
    <div className="mb-[12px] flex items-center gap-[8px] border-b border-border pb-[10px]">
      <span className="text-[13px] font-bold text-ink">{WEEKDAY_LABELS[weekday]}</span>
      {isToday ? (
        <span className="inline-flex items-center rounded-badge bg-teal px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em] text-white">
          Today
        </span>
      ) : null}
    </div>
  );
}

/**
 * One weekday column: the matching curriculum period (P1..P5) for every taught
 * year, stacked top to bottom in year order. A day with no curriculum slot for
 * any taught year shows a quiet "+ Plan" placeholder.
 */
function DayColumn({
  period,
  years,
  ownerId,
}: {
  period: number;
  years: BoardYear[];
  ownerId: string | null;
}) {
  const slots = years
    .map((band) => band.slots.find((slot) => slot.period === period))
    .filter((slot): slot is BoardSlot => !!slot);

  if (slots.length === 0) {
    return <EmptyDay />;
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {slots.map((slot) => (
        <PeriodCell key={slot.lessonKey} slot={slot} ownerId={ownerId} />
      ))}
    </div>
  );
}

/** A day with no curriculum slot for any taught year — a calm "+ Plan" hint. */
function EmptyDay() {
  return (
    <div className="flex items-center justify-center rounded-[12px] border border-dashed border-border-strong px-[13px] py-[16px] text-[11.5px] font-semibold text-text-faint">
      + Plan
    </div>
  );
}

function PeriodCell({ slot, ownerId }: { slot: BoardSlot; ownerId: string | null }) {
  const visible = ownerId ? slot.plans.filter((p) => p.owner?.id === ownerId) : slot.plans;
  const covered = slot.plans.length > 0;

  if (!covered) {
    return (
      <NotStartedLessonCard
        card={{
          key: slot.lessonKey,
          lessonKey: slot.lessonKey,
          year: slot.year,
          period: slot.period,
          dailyOutcome: slot.dailyOutcome,
          focusArea: slot.focusArea,
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[11px]">
      {visible.map((plan) => (
        <CalendarLessonCard
          key={plan.id}
          card={{
            key: plan.id,
            planId: plan.id,
            year: slot.year,
            period: slot.period,
            status: plan.status,
            scope: plan.scope,
            owner: plan.owner,
            canEdit: plan.canEdit,
            reviewNote: plan.reviewNote,
          }}
        />
      ))}
    </div>
  );
}
