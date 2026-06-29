'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarView } from '@/components/weekly-overview/CalendarView';
import { StatusView } from '@/components/weekly-overview/StatusView';
import { WeekNav } from '@/components/weekly-overview/WeekNav';
import { ViewToggle } from '@/components/weekly-overview/ViewToggle';
import { PeopleFilter, EVERYONE } from '@/components/weekly-overview/PeopleFilter';
import { ScopeChooserProvider } from '@/components/weekly-overview/ScopeChooser';
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

  // "Download week" target: the board's currently-viewed coordinate, passed to the
  // /api/pdf/week route exactly as state the board already holds (subject space,
  // resolved years, month/week, and the teaching-week number for the date header).
  // No new state, no coordinate picker — it mirrors what's on screen.
  const weekPdfHref = useMemo(() => {
    const params = new URLSearchParams({
      subject: data.subjectCode,
      subjectName: data.subjectName,
      years: data.years.map((band) => band.year).join(','),
      month: data.coordinate.month,
      week: String(data.coordinate.week),
      weekNo: String(data.weekNo),
    });
    return `/api/pdf/week?${params.toString()}`;
  }, [data.subjectCode, data.subjectName, data.years, data.coordinate, data.weekNo]);

  // Only offer the export when the board has a real coordinate with year bands to
  // export (otherwise there is nothing on screen to download).
  const canDownloadWeek =
    data.hasClasses && data.coordinate.month !== '' && data.years.length > 0;

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
            <PeopleFilter owners={data.owners} value={owner} onChange={setOwner} />
            <WeekNav
              weekNo={data.weekNo}
              isCurrent={data.isCurrent}
              coordinateLabel={data.coordinateLabel}
              coordinate={data.coordinate}
              weeks={data.weeks}
              prev={data.prev}
              next={data.next}
              view={view}
            />
            {/* §3 — the shown week's real Monday from `term_week`, or a neutral
                placeholder while the table is empty (no fabricated dates). */}
            <span className="text-[13px] text-neutral-600">
              {data.mondayDate
                ? t.rich('weekOf', {
                    date: formatDate(data.mondayDate, locale, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }),
                    b: (chunks) => (
                      <b className="font-semibold text-neutral-800">{chunks}</b>
                    ),
                  })
                : t('weekOfEmpty')}
            </span>
            <ViewToggle view={view} onChange={changeView} />
            {canDownloadWeek ? (
              <a
                href={weekPdfHref}
                target="_blank"
                rel="noopener noreferrer"
                title={t('downloadWeekTitle')}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-surface px-[14px] py-[7px] text-[13px] font-medium text-neutral-700 transition-colors hover:text-ink"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 1.5v8.5M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
                </svg>
                {t('downloadWeek')}
              </a>
            ) : null}
          </div>
        </div>

        {/* Body */}
        {!data.hasClasses ? (
          <EmptyClasses />
        ) : data.years.length === 0 || data.coordinate.month === '' ? (
          <EmptyCurriculum subjectName={data.subjectName} />
        ) : view === 'status' ? (
          <StatusView
            years={data.years}
            ownerId={ownerId}
            subjectName={data.subjectName}
            readOnly={data.boardReadOnly}
          />
        ) : (
          <CalendarView
            years={data.years}
            ownerId={ownerId}
            subjectName={data.subjectName}
            mondayDate={data.mondayDate}
            readOnly={data.boardReadOnly}
          />
        )}
      </div>
    </ScopeChooserProvider>
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

/** Shown when the teacher's subject/years have no synced curriculum yet. */
function EmptyCurriculum({ subjectName }: { subjectName: string }) {
  const t = useTranslations('board');
  return (
    <div className="rounded-[14px] border border-border px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">{t('emptyCurriculum.title')}</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
        {t.rich('emptyCurriculum.body', {
          hasSubject: subjectName ? 'yes' : 'no',
          subject: subjectName,
          s: (chunks) => <span dir="auto">{chunks}</span>,
        })}
      </p>
    </div>
  );
}
