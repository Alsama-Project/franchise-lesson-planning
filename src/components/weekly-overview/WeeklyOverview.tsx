'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarView } from '@/components/weekly-overview/CalendarView';
import { StatusView } from '@/components/weekly-overview/StatusView';
import { WeekNav } from '@/components/weekly-overview/WeekNav';
import { ViewToggle } from '@/components/weekly-overview/ViewToggle';
import { YearFilter, ALL_YEARS } from '@/components/weekly-overview/YearFilter';
import { ScopeChooserProvider } from '@/components/weekly-overview/ScopeChooser';
import { BoardReturnProvider } from '@/components/weekly-overview/BoardReturn';
import { DownloadWeek } from '@/components/weekly-overview/DownloadWeek';
import { boardWeekQuery } from '@/lib/board-nav';
import { formatDate, formatNumber } from '@/lib/format';
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
  const t = useTranslations('board');
  const locale = useLocale();
  const [view, setView] = useState<View>(initialView);
  // Year-group filter: ALL_YEARS (default) or a single taught year. A pure view
  // filter over the loaded year bands — no re-fetch.
  const [yearGroup, setYearGroup] = useState<number | typeof ALL_YEARS>(ALL_YEARS);

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

  // The year bands actually shown, after the year-group filter. The whole-week PDF
  // export still targets every band (it mirrors the curriculum week, not the view).
  const visibleYears = useMemo(
    () => (yearGroup === ALL_YEARS ? data.years : data.years.filter((b) => b.year === yearGroup)),
    [data.years, yearGroup],
  );
  // Distinct taught years across every band (a year can appear in several subjects
  // / centres on a user-wide board) — the year-group filter's options.
  const yearOptions = useMemo(
    () => [...new Set(data.years.map((b) => b.year))].sort((a, b) => a - b),
    [data.years],
  );

  // Only offer the export when the board has a real coordinate with subjects to
  // export (otherwise there is nothing on screen to download).
  const canDownloadWeek =
    data.hasClasses && data.coordinate.month !== '' && data.downloadSubjects.length > 0;

  // Plans shown after the year-group filter (Not started cards are unaffected).
  const planCount = useMemo(() => {
    if (yearGroup === ALL_YEARS) return data.planCount;
    let n = 0;
    for (const band of visibleYears) n += band.plans.length;
    return n;
  }, [visibleYears, data.planCount, yearGroup]);

  // The board's current coordinate as a URL query, so every link into a plan can
  // return to this exact week. Tracks the view toggle (which `changeView` also folds
  // into the URL), so a "back to overview" restores calendar/status too.
  const returnQuery = useMemo(() => boardWeekQuery(data.coordinate, view), [data.coordinate, view]);

  return (
    <BoardReturnProvider query={returnQuery}>
    <ScopeChooserProvider>
      <div>
        {/* Header: context + filters + week nav + view toggle */}
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[25px] font-semibold tracking-[-0.01em]">{t('title')}</h1>
            <p className="mt-1 text-[13.5px] text-neutral-600">
              {data.context ? (
                <>
                  <span dir="auto">{data.context}</span> ·{' '}
                </>
              ) : null}
              {t.rich('plannedThisWeek', {
                count: planCount,
                value: formatNumber(planCount, locale),
                b: (chunks) => <b className="font-semibold text-neutral-800">{chunks}</b>,
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[14px]">
            <YearFilter years={yearOptions} value={yearGroup} onChange={setYearGroup} />
            {/* §1 — the shown week's real Monday (from `term_week`) is folded into
                the picker as muted secondary text ("Week 36 · Dec 15"); no separate
                "Week of …" label. Null while the table is empty (no fabricated
                dates), in which case the picker just shows the week number. */}
            <WeekNav
              weekNo={data.weekNo}
              isCurrent={data.isCurrent}
              mondayLabel={
                data.mondayDate
                  ? formatDate(data.mondayDate, locale, { month: 'short', day: 'numeric' })
                  : null
              }
              coordinateLabel={data.coordinateLabel}
              coordinate={data.coordinate}
              weeks={data.weeks}
              prev={data.prev}
              next={data.next}
              view={view}
            />
            <ViewToggle view={view} onChange={changeView} />
            {/* Recycle bin — the per-teacher trash of soft-deleted lessons. */}
            <Link
              href="/trash"
              aria-label={t('trash.link')}
              title={t('trash.link')}
              className="inline-flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] border border-border text-text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </Link>
            {/* §1 — compact download control. A single-subject board keeps the plain
                icon button; a user-wide board turns it into a subject picker (each
                choice exports that subject's week via the same /api/pdf/week route). */}
            {canDownloadWeek ? (
              <DownloadWeek
                subjects={data.downloadSubjects}
                month={data.coordinate.month}
                week={data.coordinate.week}
                weekNo={data.weekNo}
              />
            ) : null}
          </div>
        </div>

        {/* Body */}
        {!data.hasClasses ? (
          <EmptyClasses />
        ) : data.years.length === 0 || data.coordinate.month === '' ? (
          <EmptyCurriculum subjectNames={data.subjectNames} />
        ) : view === 'status' ? (
          <StatusView
            years={visibleYears}
            ownerId={null}
            readOnly={data.boardReadOnly}
            spansMultipleCentres={data.spansMultipleCentres}
          />
        ) : (
          <CalendarView
            years={visibleYears}
            ownerId={null}
            mondayDate={data.mondayDate}
            readOnly={data.boardReadOnly}
            spansMultipleSubjects={data.spansMultipleSubjects}
            spansMultipleCentres={data.spansMultipleCentres}
          />
        )}
      </div>
    </ScopeChooserProvider>
    </BoardReturnProvider>
  );
}

/** Shown when the signed-in teacher teaches no classes yet. */
function EmptyClasses() {
  const t = useTranslations('board');
  return (
    <div className="rounded-[14px] border border-border px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">{t('emptyClasses.title')}</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
        {t.rich('emptyClasses.body', {
          settings: (chunks) => (
            <a href="/settings" className="font-semibold text-teal underline underline-offset-2">
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}

/**
 * Shown when NONE of the user's subjects have synced curriculum for the years they
 * teach. User-wide: it names every subject the user is in (not a single "Arabic"),
 * and keeps the coordinator-sync guidance.
 */
function EmptyCurriculum({ subjectNames }: { subjectNames: string[] }) {
  const t = useTranslations('board');
  return (
    <div className="rounded-[14px] border border-border px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">{t('emptyCurriculum.title')}</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
        {t.rich('emptyCurriculum.body', {
          count: subjectNames.length,
          subjects: subjectNames.join(', '),
          s: (chunks) => <span dir="auto">{chunks}</span>,
        })}
      </p>
    </div>
  );
}
