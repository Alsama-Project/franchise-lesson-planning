'use client';

import { useCallback, useState } from 'react';
import { CalendarView } from '@/components/weekly-overview/CalendarView';
import { StatusView } from '@/components/weekly-overview/StatusView';
import { WeekNav } from '@/components/weekly-overview/WeekNav';
import { ViewToggle } from '@/components/weekly-overview/ViewToggle';
import type { WeeklyOverview as WeeklyOverviewData } from '@/types/weekly-overview';

type View = 'calendar' | 'status';

/**
 * The Weekly Overview: a flat page header (context + week navigation + the
 * Calendar ⇄ Status toggle) over whichever view is selected.
 *
 * The two views are presentations of the SAME already-loaded `data`, so the
 * toggle is pure client state — instant, with no server round-trip or re-fetch.
 * Changing the *week* still navigates (it needs different data), which is why the
 * week nav stays a set of links. The view is mirrored into the URL via a shallow
 * `history.replaceState` so it survives a refresh/share and is carried onto the
 * week-nav links, without re-running the server component.
 */
export function WeeklyOverview({
  data,
  view: initialView,
  thisMonday,
}: {
  data: WeeklyOverviewData;
  view: View;
  thisMonday: string;
}) {
  const [view, setView] = useState<View>(initialView);

  const changeView = useCallback(
    (next: View) => {
      setView(next);
      // Keep the URL truthful without a navigation: no server component re-run,
      // no Supabase re-query. The next full navigation (week nav) reads this.
      window.history.replaceState(null, '', `/?week=${data.weekStart}&view=${next}`);
    },
    [data.weekStart],
  );

  return (
    <div>
      {/* Header: context + week nav + view toggle */}
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[25px] font-semibold tracking-[-0.01em]">This week</h1>
          <p className="mt-1 text-[13.5px] text-neutral-600">
            {data.context ? <>{data.context} · </> : null}
            <b className="font-semibold text-neutral-800">{data.planCount}</b> planned this
            week
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[14px]">
          <WeekNav
            weekStart={data.weekStart}
            weekLabel={data.weekLabel}
            thisMonday={thisMonday}
            view={view}
          />
          <ViewToggle view={view} onChange={changeView} />
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
    <div className="rounded-[14px] border border-border px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">No classes assigned yet</p>
      <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] text-text-muted">
        Once a coordinator assigns you to classes, your week will appear here — a
        slot for each class on every weekday.
      </p>
    </div>
  );
}
