'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarView } from '@/components/weekly-overview/CalendarView';
import { StatusView } from '@/components/weekly-overview/StatusView';
import { WeekNav } from '@/components/weekly-overview/WeekNav';
import { ViewToggle } from '@/components/weekly-overview/ViewToggle';
import { PeopleFilter, EVERYONE } from '@/components/weekly-overview/PeopleFilter';
import { CreateLessonProvider } from '@/components/create-lesson/CreateLessonContext';
import { AddLessonButton } from '@/components/create-lesson/AddLessonButton';
import type { ClassWeek, PlanOwner, WeeklyOverview as WeeklyOverviewData } from '@/types/weekly-overview';
import type { CreateSpaceGroup } from '@/components/create-lesson/types';

type View = 'calendar' | 'status';

/**
 * The Weekly Overview: a flat page header (people filter + week navigation + the
 * Calendar ⇄ Status toggle + the "+ Lesson" hero) over whichever view is selected.
 *
 * The two views are presentations of the SAME already-loaded `data`, so the
 * toggle is pure client state — instant, with no server round-trip or re-fetch.
 * The "Everyone" people filter is likewise a pure view filter over the loaded
 * plans (by owner). Changing the *week* still navigates (it needs different data).
 *
 * The whole tree is wrapped in CreateLessonProvider so the hero button, the
 * Calendar blank-day "+ Plan" card, and the Status "Not started" chips can all
 * open the same create dialog.
 */
export function WeeklyOverview({
  data,
  view: initialView,
  thisMonday,
  groups,
}: {
  data: WeeklyOverviewData;
  view: View;
  thisMonday: string;
  /** Classes the user can plan for, grouped by space — for the create dialog. */
  groups: CreateSpaceGroup[];
}) {
  const [view, setView] = useState<View>(initialView);
  const [owner, setOwner] = useState<string>(EVERYONE);

  const changeView = useCallback(
    (next: View) => {
      setView(next);
      // Keep the URL truthful without a navigation: no server component re-run.
      window.history.replaceState(null, '', `/?week=${data.weekStart}&view=${next}`);
    },
    [data.weekStart],
  );

  // Distinct plan owners present in the loaded week — the people-filter options.
  const owners = useMemo<PlanOwner[]>(() => {
    const byId = new Map<string, PlanOwner>();
    for (const c of data.classes) {
      for (const slot of c.slots) {
        if (slot.plan?.owner) byId.set(slot.plan.owner.id, slot.plan.owner);
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.classes]);

  // Apply the owner filter: a plan owned by someone else is hidden (its slot
  // reverts to "not started"). "Everyone" passes through unchanged.
  const filteredClasses = useMemo<ClassWeek[]>(() => {
    if (owner === EVERYONE) return data.classes;
    return data.classes.map((c) => ({
      ...c,
      slots: c.slots.map((slot) =>
        slot.plan && slot.plan.owner?.id !== owner
          ? { ...slot, plan: null, status: 'not_started' as const, target: null }
          : slot,
      ),
    }));
  }, [data.classes, owner]);

  const planCount = useMemo(
    () => filteredClasses.reduce((n, c) => n + c.slots.filter((s) => s.plan).length, 0),
    [filteredClasses],
  );

  return (
    <CreateLessonProvider groups={groups} weekStart={data.weekStart}>
      <div>
        {/* Header: context + filters + week nav + view toggle + hero */}
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[25px] font-semibold tracking-[-0.01em]">This week</h1>
            <p className="mt-1 text-[13.5px] text-neutral-600">
              {data.context ? <>{data.context} · </> : null}
              <b className="font-semibold text-neutral-800">{planCount}</b> planned this week
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[14px]">
            <PeopleFilter owners={owners} value={owner} onChange={setOwner} />
            <WeekNav
              weekStart={data.weekStart}
              weekLabel={data.weekLabel}
              thisMonday={thisMonday}
              view={view}
            />
            <ViewToggle view={view} onChange={changeView} />
            <AddLessonButton />
          </div>
        </div>

        {/* Body */}
        {data.classes.length === 0 ? (
          <EmptyClasses />
        ) : view === 'status' ? (
          <StatusView classes={filteredClasses} />
        ) : (
          <CalendarView classes={filteredClasses} />
        )}
      </div>
    </CreateLessonProvider>
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
