import { CalendarView } from '@/components/weekly-overview/CalendarView';
import { StatusView } from '@/components/weekly-overview/StatusView';
import { WeekNav } from '@/components/weekly-overview/WeekNav';
import { ViewToggle } from '@/components/weekly-overview/ViewToggle';
import type { WeeklyOverview as WeeklyOverviewData } from '@/types/weekly-overview';

type View = 'calendar' | 'status';

/**
 * The Weekly Overview card: a header carrying the week context, week navigation
 * and the Calendar ⇄ Status toggle, over whichever view is selected. This is the
 * read view of the teacher's week; creating/editing plans comes in the editor
 * slice. Empty states stay calm and explicit.
 */
export function WeeklyOverview({
  data,
  view,
  thisMonday,
}: {
  data: WeeklyOverviewData;
  view: View;
  thisMonday: string;
}) {
  const summary = [data.context, `${data.planCount} planned this week`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      {/* Header: context + week nav + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-5 border-b border-neutral-100 p-5">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold">This week</div>
          <div className="text-[13px] text-text-muted">{summary}</div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <WeekNav
            weekStart={data.weekStart}
            weekLabel={data.weekLabel}
            thisMonday={thisMonday}
            view={view}
          />
          <ViewToggle weekStart={data.weekStart} view={view} />
        </div>
      </div>

      {/* Body */}
      {data.classes.length === 0 ? (
        <EmptyClasses />
      ) : view === 'status' ? (
        <StatusView classes={data.classes} />
      ) : (
        <CalendarView classes={data.classes} />
      )}
    </div>
  );
}

/** Shown when the signed-in teacher has no classes assigned yet. */
function EmptyClasses() {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">No classes assigned yet</p>
      <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] text-text-muted">
        Once a coordinator assigns you to classes, your week will appear here —
        a slot for each class on every weekday.
      </p>
    </div>
  );
}
