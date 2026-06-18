import Link from 'next/link';
import { cn } from '@/lib/cn';
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from '@/lib/week';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import type { ClassWeek, WeekSlot } from '@/types/weekly-overview';

/**
 * Variant A — the week matrix: sessions down, weekdays across. Each cell shows
 * the curriculum target headline (or "Not started") plus a status chip. Cells
 * with a plan link to the editor; empty cells are inert in this slice.
 */
export function CalendarView({ classes }: { classes: ClassWeek[] }) {
  // Which weekday (if any) is today, so we can tint that whole column.
  const todayWeekday: Weekday | null =
    classes[0]?.slots.find((s) => s.isToday)?.weekday ?? null;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-[150px_repeat(5,1fr)]">
        {/* Header row: "Sessions" corner label + weekday labels */}
        <div className="border-b border-neutral-100 bg-surface-subtle px-[14px] py-[11px] text-[12px] font-semibold uppercase tracking-[0.04em] text-text-faint">
          Sessions
        </div>
        {WEEKDAYS.map((wd) => (
          <HeaderCell
            key={wd}
            label={WEEKDAY_LABELS[wd]}
            isToday={wd === todayWeekday}
          />
        ))}

        {/* One row per class */}
        {classes.map((c, rowIdx) => {
          const last = rowIdx === classes.length - 1;
          return (
            <div key={c.classId} className="contents">
              <div
                className={cn(
                  'flex flex-col justify-center p-[14px]',
                  !last && 'border-b border-neutral-100',
                )}
              >
                <div className="text-[13.5px] font-semibold">{c.label}</div>
                <div className="text-[11.5px] text-text-faint">{c.subjectName}</div>
              </div>
              {c.slots.map((slot) => (
                <SlotCell key={slot.weekday} slot={slot} last={last} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeaderCell({ label, isToday }: { label: string; isToday: boolean }) {
  return (
    <div
      className={cn(
        'border-b border-l px-[14px] py-[11px] text-[12px] font-semibold',
        isToday
          ? 'border-neutral-150 bg-surface-cream text-ink'
          : 'border-neutral-100 bg-surface-subtle text-text-muted',
      )}
    >
      {isToday ? `${label} · today` : label}
    </div>
  );
}

function SlotCell({ slot, last }: { slot: WeekSlot; last: boolean }) {
  const headline = slot.target?.dailyLO || (slot.plan ? 'Lesson plan' : 'Not started');

  const body = (
    <>
      <div
        className="mb-2 line-clamp-2 text-[12.5px] leading-[1.35] text-neutral-900"
        title={slot.target?.dailyLO || undefined}
      >
        {headline}
      </div>
      <StatusChip status={slot.status} />
    </>
  );

  const base = cn(
    'border-l border-neutral-100 p-[11px]',
    !last && 'border-b border-neutral-100',
    slot.isToday && 'bg-surface-subtle',
  );

  if (slot.plan) {
    return (
      <Link
        href={`/plan/${slot.plan.id}`}
        className={cn(base, 'block transition-colors hover:bg-cream')}
      >
        {body}
      </Link>
    );
  }

  return <div className={base}>{body}</div>;
}
