'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarView } from '@/components/weekly-overview/CalendarView';
import { StatusView } from '@/components/weekly-overview/StatusView';
import { WeekNav } from '@/components/weekly-overview/WeekNav';
import { ViewToggle } from '@/components/weekly-overview/ViewToggle';
import { PeopleFilter, EVERYONE } from '@/components/weekly-overview/PeopleFilter';
import { ScopeChooserProvider } from '@/components/weekly-overview/ScopeChooser';
import type { BoardData } from '@/types/weekly-overview';

type View = 'calendar' | 'status';

/**
 * The planning board: a flat header (people filter + curriculum-week navigation +
 * the Calendar ⇄ Status toggle) over whichever view is selected.
 *
 * The board auto-populates from the curriculum for the years the teacher teaches —
 * there is no "+ Lesson" hero; creation happens on the board itself (a "Not
 * started" card or a "+ make your own" affordance opens the inline scope chooser).
 * The two views are presentations of the SAME loaded `data`, so the toggle and the
 * "Everyone" owner filter are pure client state — no re-fetch. Changing the
 * curriculum week still navigates (it needs different data).
 */
export function WeeklyOverview({ data, view: initialView }: { data: BoardData; view: View }) {
  const [view, setView] = useState<View>(initialView);
  const [owner, setOwner] = useState<string>(EVERYONE);

  const changeView = useCallback(
    (next: View) => {
      setView(next);
      // Keep the URL truthful without a navigation: no server component re-run.
      const { month, week } = data.coordinate;
      window.history.replaceState(
        null,
        '',
        `/?month=${encodeURIComponent(month)}&week=${week}&view=${next}`,
      );
    },
    [data.coordinate],
  );

  const ownerId = owner === EVERYONE ? null : owner;

  // Plans shown after the owner filter (Not started cards are unaffected).
  const planCount = useMemo(() => {
    if (ownerId === null) return data.planCount;
    let n = 0;
    for (const band of data.years) {
      for (const p of band.plans) if (p.owner?.id === ownerId) n++;
    }
    return n;
  }, [data.years, data.planCount, ownerId]);

  return (
    <ScopeChooserProvider
      subjectName={data.subjectName}
      subjectCode={data.subjectCode}
      context={data.context}
      coordinate={data.coordinate}
      classesByYear={data.myClassesByYear}
    >
      <div>
        {/* Header: context + filters + week nav + view toggle */}
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[25px] font-semibold tracking-[-0.01em]">This week</h1>
            <p className="mt-1 text-[13.5px] text-neutral-600">
              {data.context ? <>{data.context} · </> : null}
              <b className="font-semibold text-neutral-800">{planCount}</b> planned this week
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[14px]">
            <PeopleFilter owners={data.owners} value={owner} onChange={setOwner} />
            <WeekNav
              coordinateLabel={data.coordinateLabel}
              prev={data.prev}
              next={data.next}
              view={view}
            />
            <ViewToggle view={view} onChange={changeView} />
          </div>
        </div>

        {/* Body */}
        {!data.hasClasses ? (
          <EmptyClasses />
        ) : data.years.length === 0 || data.coordinate.month === '' ? (
          <EmptyCurriculum subjectName={data.subjectName} />
        ) : view === 'status' ? (
          <StatusView years={data.years} ownerId={ownerId} />
        ) : (
          <CalendarView years={data.years} ownerId={ownerId} />
        )}
      </div>
    </ScopeChooserProvider>
  );
}

/** Shown when the signed-in teacher teaches no classes yet. */
function EmptyClasses() {
  return (
    <div className="rounded-[14px] border border-border px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">No classes assigned yet</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
        Pick the classes you teach in{' '}
        <a href="/settings" className="font-semibold text-teal underline underline-offset-2">
          Settings
        </a>{' '}
        and your curriculum board will appear here — one section per year you teach.
      </p>
    </div>
  );
}

/** Shown when the teacher's subject/years have no synced curriculum yet. */
function EmptyCurriculum({ subjectName }: { subjectName: string }) {
  return (
    <div className="rounded-[14px] border border-border px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">No curriculum synced yet</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
        {subjectName ? `${subjectName} has` : 'This subject has'} no curriculum lessons synced
        for the years you teach. Once a coordinator syncs the curriculum, your board will fill in.
      </p>
    </div>
  );
}
