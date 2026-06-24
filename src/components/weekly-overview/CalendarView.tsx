'use client';

import { CalendarLessonCard, NotStartedLessonCard } from '@/components/weekly-overview/LessonCard';
import { useScopeChooser } from '@/components/weekly-overview/ScopeChooser';
import type { BoardSlot, BoardYear } from '@/types/weekly-overview';

/**
 * Calendar view — one band per year the teacher teaches, each a row of the
 * curriculum period slots (P1..P5). Every slot renders as the restored lesson
 * card: each plan covering it is a CalendarLessonCard; a slot with no plan of any
 * scope is the "Not started" card. A covered slot also offers a quiet "+ make your
 * own" so a teacher can add a class plan alongside a shared centre/org one.
 */
export function CalendarView({
  years,
  ownerId,
}: {
  years: BoardYear[];
  ownerId: string | null;
}) {
  return (
    <div className="flex flex-col gap-[26px]">
      {years.map((band) => (
        <div key={band.year}>
          <h2 className="mb-[12px] text-[15px] font-bold text-ink">Year {band.year}</h2>
          {band.slots.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-border-strong px-[14px] py-[14px] text-[12.5px] text-text-muted">
              No curriculum lessons for Year {band.year} this week.
            </div>
          ) : (
            <div
              className="grid items-start gap-[14px]"
              style={{ gridTemplateColumns: `repeat(${band.slots.length}, minmax(0, 1fr))` }}
            >
              {band.slots.map((slot) => (
                <PeriodCell key={slot.lessonKey} slot={slot} ownerId={ownerId} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PeriodCell({ slot, ownerId }: { slot: BoardSlot; ownerId: string | null }) {
  const { openChooser } = useScopeChooser();
  const visible = ownerId ? slot.plans.filter((p) => p.owner?.id === ownerId) : slot.plans;
  const covered = slot.plans.length > 0;

  if (!covered) {
    return (
      <div className="flex flex-col gap-[11px]">
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
      </div>
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
      <button
        type="button"
        onClick={() =>
          openChooser({ lessonKey: slot.lessonKey, year: slot.year, dailyOutcome: slot.dailyOutcome })
        }
        className="inline-flex items-center justify-center gap-[5px] text-[11.5px] font-semibold text-teal transition-colors hover:text-teal-deep"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1F7A6C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Make your own
      </button>
    </div>
  );
}
