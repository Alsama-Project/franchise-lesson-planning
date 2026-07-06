'use client';

// The coordinator/admin Curriculum → Insights page: four read-only analytics over one
// subject's scheme of work. It mirrors the Explorer's design language (cards, teal ramp,
// pill selectors, logical-property RTL) rather than the taxonomy-shaped mock, because the
// verified per-subject data reality differs from it:
//
//   1. Hours per month     ← `hoursPerMonth` (calendar count; live for every subject).
//   2. Hours by focus area ← focus_area/theme (`TopicsData`); english falls back to a
//      "by theme" breakdown with a relabelled card. Live today.
//   3. Spiralling          ← focus_area/theme presence per year; taught vs not-taught
//      ONLY (no depth gradient — no depth signal exists).
//   4. Coverage & gaps     ← focus_area/theme hour counts per year; a red cross marks a
//      zero-teaching year, and the narrative callout is generated from the ACTUAL
//      present→absent→present pattern.
//
// Each card owns its own empty state, so a subject that genuinely lacks an analytic's
// data shows "not available yet" instead of a misleading full-looking chart. Nothing here
// is hardcoded to look populated; the taxonomy S0/K0 flat artefact never reaches this
// layer (TopicsData is focus_area/theme, already de-artefacted in #99).

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { SubjectOption } from './explorer-ui';
import type { HoursPerMonth, TopicsData } from '@/lib/curriculum/composition';
import {
  hoursPerMonthForYear,
  hoursByFocusArea,
  topicMatrix,
  gapNotes,
  tealStop,
  LOW_MONTH_MEDIAN_FRACTION,
  type MatrixView,
} from '@/lib/curriculum/insights';

/** The single "taught" tone for the spiral matrix — one flat teal, NOT a magnitude ramp
 *  (there is no depth signal to encode). */
const TAUGHT_TONE = 'var(--color-chart-teal-4)';

export function CurriculumInsights({
  subjects,
  subjectCode,
  subjectName,
  years,
  year,
  hoursPerMonth,
  topics,
}: {
  subjects: SubjectOption[];
  subjectCode: string;
  subjectName: string;
  years: number[];
  year: number;
  hoursPerMonth: HoursPerMonth[];
  topics: TopicsData;
}) {
  const t = useTranslations('insights');

  const explorerHref = (tab: 'calendar' | 'topics') => {
    const sp = new URLSearchParams({ tab, subject: subjectCode, year: String(year) });
    return `/curriculum?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <div className="flex items-center gap-[10px]">
            <h1 className="text-[22px] font-semibold text-ink">{t('title')}</h1>
            <span className="rounded-full border border-border-strong bg-surface-subtle px-[9px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-600">
              {t('readOnly')}
            </span>
          </div>
          <p dir="auto" className="mt-[4px] text-[13.5px] text-text-muted">
            {t('subtitle', { subject: subjectName })}
          </p>
        </div>
        <Link
          href="/curriculum"
          className="inline-flex items-center gap-[6px] rounded-[10px] border border-border-strong bg-surface px-[13px] py-[9px] text-[13px] font-medium text-neutral-800 transition-colors hover:bg-surface-subtle"
        >
          <ArrowIcon className="rtl:-scale-x-100" flip />
          {t('backToExplorer')}
        </Link>
      </div>

      <Selector
        subjects={subjects}
        subjectCode={subjectCode}
        years={years}
        year={year}
      />

      <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <HoursPerMonthCard hoursPerMonth={hoursPerMonth} year={year} openHref={explorerHref('calendar')} />
        <FocusAreaCard topics={topics} openHref={explorerHref('topics')} />
        <div className="lg:col-span-2">
          <SpiralCard topics={topics} year={year} openHref={explorerHref('topics')} />
        </div>
        <div className="lg:col-span-2">
          <CoverageCard topics={topics} year={year} openHref={explorerHref('topics')} />
        </div>
      </div>
    </div>
  );
}

// ── Selector: subject dropdown + year lens ──────────────────────────────────────────

function Selector({
  subjects,
  subjectCode,
  years,
  year,
}: {
  subjects: SubjectOption[];
  subjectCode: string;
  years: number[];
  year: number;
}) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const router = useRouter();

  const go = (patch: { subject?: string; year?: number }) => {
    const sp = new URLSearchParams({
      subject: patch.subject ?? subjectCode,
      year: String(patch.year ?? year),
    });
    router.push(`/curriculum/insights?${sp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-[12px] rounded-[16px] border border-border bg-surface px-[18px] py-[14px] shadow-card">
      <label className="relative inline-flex">
        <span className="sr-only">{t('subjectLabel')}</span>
        <select
          value={subjectCode}
          onChange={(e) => go({ subject: e.target.value })}
          className="appearance-none rounded-[10px] border border-border-strong bg-surface py-[9px] pe-[34px] ps-[13px] text-[14px] font-medium text-ink transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          {subjects.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-[12px] top-1/2 -translate-y-1/2 text-[#A79E94]" />
      </label>

      {years.length > 0 ? (
        <div className="ms-auto flex flex-wrap items-center gap-[6px]">
          <span className="me-[2px] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#A79E94]">
            {t('yearLabel')}
          </span>
          {years.map((y) => {
            const active = y === year;
            return (
              <button
                key={y}
                type="button"
                onClick={() => go({ year: y })}
                aria-pressed={active}
                className={cn(
                  'rounded-full px-[12px] py-[5px] text-[12.5px] font-semibold transition-colors',
                  active
                    ? 'bg-teal text-white'
                    : 'border border-border-strong bg-surface text-neutral-700 hover:bg-surface-subtle',
                )}
              >
                {t('year', { n: formatNumber(y, locale) })}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ── Card shell ───────────────────────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  note,
  openHref,
  children,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  openHref?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('insights');
  return (
    <section className="flex h-full flex-col rounded-[18px] border border-border bg-surface p-[20px] shadow-card">
      <div className="mb-[14px] flex items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle ? <p dir="auto" className="mt-[3px] text-[12.5px] text-text-muted">{subtitle}</p> : null}
          {note ? (
            <p dir="auto" className="mt-[6px] inline-block rounded-[7px] bg-surface-cream px-[8px] py-[3px] text-[11.5px] text-[#8A6D57]">
              {note}
            </p>
          ) : null}
        </div>
        {openHref ? (
          <Link
            href={openHref}
            className="inline-flex shrink-0 items-center gap-[5px] text-[12.5px] font-medium text-teal transition-colors hover:text-teal-deep"
          >
            {t('openInExplorer')}
            <ArrowIcon className="rtl:-scale-x-100" />
          </Link>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  const t = useTranslations('insights');
  return (
    <div className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-[12px] border border-dashed border-border-strong bg-surface-subtle px-[18px] py-[28px] text-center">
      <p dir="auto" className="text-[13px] text-text-muted">{message}</p>
      <p className="mt-[6px] text-[11.5px] text-text-faint">{t('fillsInNote')}</p>
    </div>
  );
}

// ── 1) Hours per month ──────────────────────────────────────────────────────────────

function HoursPerMonthCard({
  hoursPerMonth,
  year,
  openHref,
}: {
  hoursPerMonth: HoursPerMonth[];
  year: number;
  openHref: string;
}) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const view = useMemo(() => hoursPerMonthForYear(hoursPerMonth, year), [hoursPerMonth, year]);
  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', calendar: 'gregory', numberingSystem: 'latn' }),
    [locale],
  );
  const monthLabel = (name: string) => {
    const idx = MONTHS.indexOf(name);
    return idx === -1 ? name : monthFmt.format(new Date(Date.UTC(2001, idx, 1)));
  };

  const hasLow = view.bars.some((b) => b.low);

  return (
    <Card
      title={t('card1.title')}
      subtitle={t('card1.subtitle', { year: t('year', { n: formatNumber(year, locale) }) })}
      openHref={openHref}
    >
      {view.bars.length === 0 ? (
        <EmptyState message={t('card1.empty')} />
      ) : (
        <div>
          <div className="flex items-end gap-[10px] overflow-x-auto pb-[6px]" style={{ minHeight: 168 }}>
            {view.bars.map((b) => {
              const heightPct = view.maxHours > 0 ? Math.max(6, (b.hours / view.maxHours) * 100) : 6;
              return (
                <div key={b.month} className="flex min-w-[34px] flex-1 flex-col items-center gap-[6px]">
                  <span className={cn('text-[11px] font-semibold', b.low ? 'text-gap' : 'text-neutral-700')}>
                    {formatNumber(b.hours, locale)}
                  </span>
                  <div className="flex h-[120px] w-full items-end">
                    <div
                      className={cn('w-full rounded-t-[6px]', b.low && 'ring-1 ring-inset ring-gap')}
                      style={{
                        height: `${heightPct}%`,
                        background: b.low ? 'var(--color-gap-bg)' : tealStop(b.hours, view.maxHours),
                      }}
                      title={b.low ? t('card1.flagNote', { pct: Math.round(LOW_MONTH_MEDIAN_FRACTION * 100), median: formatNumber(view.median, locale) }) : undefined}
                    />
                  </div>
                  <span dir="auto" className="text-[10.5px] text-text-faint">{monthLabel(b.month)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-[12px] flex flex-wrap items-center gap-x-[16px] gap-y-[6px] border-t border-border pt-[10px] text-[11.5px]">
            <span className="text-text-muted">
              {t('card1.medianCaption', { median: formatNumber(view.median, locale) })}
            </span>
            {hasLow ? (
              <span className="inline-flex items-center gap-[6px] text-gap">
                <span className="size-[9px] rounded-[3px] border border-gap-border bg-gap-bg" />
                {t('card1.flagLabel')} · {t('card1.flagNote', { pct: Math.round(LOW_MONTH_MEDIAN_FRACTION * 100), median: formatNumber(view.median, locale) })}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── 2) Hours by focus area / theme ──────────────────────────────────────────────────

function FocusAreaCard({ topics, openHref }: { topics: TopicsData; openHref: string }) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const view = useMemo(() => hoursByFocusArea(topics), [topics]);
  const isTheme = view.groupedBy === 'theme';
  const maxHours = view.bars[0]?.hours ?? 0;

  return (
    <Card
      title={isTheme ? t('card2.titleTheme') : t('card2.titleFocus')}
      subtitle={isTheme ? t('card2.subtitleTheme') : t('card2.subtitleFocus')}
      note={isTheme ? t('card2.themeNote') : undefined}
      openHref={openHref}
    >
      {view.bars.length === 0 ? (
        <EmptyState message={t('card2.empty')} />
      ) : (
        <div className="flex flex-col gap-[14px]">
          {view.bars.map((b, i) => {
            const widthPct = maxHours > 0 ? Math.max(3, (b.hours / maxHours) * 100) : 3;
            const topicMax = b.topics[0]?.hours ?? 0;
            return (
              <div key={`${b.label ?? 'ungrouped'}-${i}`}>
                <div className="mb-[5px] flex items-baseline justify-between gap-[10px]">
                  <span dir="auto" className="min-w-0 truncate text-[13px] font-medium text-ink">
                    {b.label ?? t('card2.titleTheme')}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-text-muted">
                    {t('hoursShort', { n: formatNumber(b.hours, locale) })} · {t('card2.ofTotal', { pct: formatNumber(Math.round(b.pct), locale) })}
                  </span>
                </div>
                <div className="h-[12px] w-full overflow-hidden rounded-full" style={{ background: 'var(--color-chart-track)' }}>
                  <div
                    className="flex h-full overflow-hidden rounded-full"
                    style={{ width: `${widthPct}%`, background: tealStop(b.hours, maxHours) }}
                  >
                    {/* Topic breakdown: proportional segments within the focus-area bar. */}
                    {b.topics.map((tp, ti) => (
                      <span
                        key={`${tp.topic}-${ti}`}
                        title={`${tp.topic} · ${t('hoursShort', { n: formatNumber(tp.hours, locale) })}`}
                        className={cn('h-full', ti > 0 && 'border-s border-white/50')}
                        style={{
                          width: `${b.hours > 0 ? (tp.hours / b.hours) * 100 : 0}%`,
                          background: tealStop(tp.hours, topicMax),
                        }}
                      />
                    ))}
                  </div>
                </div>
                {b.topics.length > 0 ? (
                  <div className="mt-[5px] text-[11px] text-text-faint">
                    {t('card2.topicsCount', { count: b.topics.length })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── 3) Spiralling across years (taught vs not-taught) ───────────────────────────────

function SpiralCard({ topics, year, openHref }: { topics: TopicsData; year: number; openHref: string }) {
  const t = useTranslations('insights');
  const view = useMemo(() => topicMatrix(topics), [topics]);

  return (
    <Card title={t('card3.title')} subtitle={t('card3.subtitle')} openHref={openHref}>
      {view.groups.length === 0 ? (
        <EmptyState message={t('card3.empty')} />
      ) : (
        <div>
          <Matrix
            view={view}
            year={year}
            renderCell={(hours) =>
              hours !== undefined ? (
                <span
                  className="block size-full rounded-[5px]"
                  style={{ background: TAUGHT_TONE }}
                  aria-label={t('card3.taught')}
                />
              ) : (
                <span
                  className="block size-full rounded-[5px] border border-dashed border-border-strong"
                  aria-label={t('card3.notTaught')}
                />
              )
            }
          />
          <Legend
            items={[
              { swatch: <span className="size-[11px] rounded-[3px]" style={{ background: TAUGHT_TONE }} />, label: t('card3.taught') },
              { swatch: <span className="size-[11px] rounded-[3px] border border-dashed border-border-strong" />, label: t('card3.notTaught') },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

// ── 4) Coverage & gaps (hour counts + red cross + narrative) ────────────────────────

function CoverageCard({ topics, year, openHref }: { topics: TopicsData; year: number; openHref: string }) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const view = useMemo(() => topicMatrix(topics), [topics]);
  const notes = useMemo(() => gapNotes(view), [view]);

  const yearWord = (y: number) => t('year', { n: formatNumber(y, locale) });
  const gapText = (gapYears: number[]) =>
    gapYears.length === 1
      ? yearWord(gapYears[0])
      : t('yearsRange', { from: formatNumber(gapYears[0], locale), to: formatNumber(gapYears[gapYears.length - 1], locale) });

  const shown = notes.slice(0, 4);

  return (
    <Card title={t('card4.title')} subtitle={t('card4.subtitle')} openHref={openHref}>
      {view.groups.length === 0 ? (
        <EmptyState message={t('card4.empty')} />
      ) : (
        <div>
          <Matrix
            view={view}
            year={year}
            renderCell={(hours) =>
              hours !== undefined ? (
                <span
                  className="flex size-full items-center justify-center rounded-[5px] text-[11px] font-semibold tabular-nums text-white"
                  style={{ background: tealStop(hours, view.maxCell) }}
                >
                  {formatNumber(hours, locale)}
                </span>
              ) : (
                <span
                  className="flex size-full items-center justify-center rounded-[5px] border border-gap-border bg-gap-bg text-gap"
                  aria-label={t('card4.gapAria')}
                >
                  <CrossIcon />
                </span>
              )
            }
          />
          <Legend
            items={[
              { swatch: <span className="size-[11px] rounded-[3px]" style={{ background: 'var(--color-chart-teal-2)' }} />, label: t('hoursShort', { n: '1+' }) },
              { swatch: <span className="size-[11px] rounded-[3px]" style={{ background: 'var(--color-chart-teal-5)' }} />, label: t('hoursShort', { n: formatNumber(view.maxCell, locale) }) },
              { swatch: <span className="flex size-[11px] items-center justify-center rounded-[3px] border border-gap-border bg-gap-bg text-gap"><CrossIcon small /></span>, label: t('card4.gapAria') },
            ]}
          />

          {shown.length > 0 ? (
            <div className="mt-[14px] rounded-[12px] border border-gap-border bg-gap-bg/50 p-[13px]">
              <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.05em] text-[#9A5A47]">
                {t('card4.noteHeading')}
              </div>
              <ul className="space-y-[5px]">
                {shown.map((n, i) => (
                  <li key={`${n.topic}-${i}`} dir="auto" className="text-[12.5px] leading-[1.45] text-neutral-800 [overflow-wrap:anywhere]">
                    {t('card4.gapNarrative', {
                      topic: n.topic,
                      gap: gapText(n.gapYears),
                      reappear: yearWord(n.reappear),
                    })}
                  </li>
                ))}
                {notes.length > shown.length ? (
                  <li className="text-[11.5px] text-text-faint">{t('card4.moreNotes', { count: notes.length - shown.length })}</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

// ── Shared matrix (topic rows × year columns) ────────────────────────────────────────

function Matrix({
  view,
  year,
  renderCell,
}: {
  view: MatrixView;
  year: number;
  renderCell: (hours: number | undefined) => React.ReactNode;
}) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const cols = `minmax(150px, 1.5fr) repeat(${view.years.length}, minmax(40px, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Header row: topic label spacer + year columns (selected year highlighted). */}
        <div className="grid items-center gap-[6px]" style={{ gridTemplateColumns: cols }}>
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">{t('card3.topicHeading')}</span>
          {view.years.map((y) => (
            <span
              key={y}
              className={cn(
                'rounded-[6px] py-[3px] text-center text-[11px] font-semibold',
                y === year ? 'bg-teal-tint text-teal-deep' : 'text-neutral-700',
              )}
            >
              {t('yearShort', { n: formatNumber(y, locale) })}
            </span>
          ))}
        </div>

        {view.groups.map((g, gi) => (
          <div key={`${g.faLabel ?? 'group'}-${gi}`} className="mt-[8px]">
            {g.faLabel ? (
              <div dir="auto" className="mb-[4px] mt-[6px] text-[11px] font-semibold text-[#9A7B5C]">
                {g.faLabel}
              </div>
            ) : null}
            {g.rows.map((row, ri) => (
              <div key={`${row.topic}-${ri}`} className="grid items-stretch gap-[6px] py-[3px]" style={{ gridTemplateColumns: cols }}>
                <span dir="auto" className="flex items-center pe-[8px] text-[12.5px] text-neutral-800 [overflow-wrap:anywhere]">
                  {row.topic}
                </span>
                {view.years.map((y) => (
                  <div
                    key={y}
                    className={cn('h-[26px]', y === year && 'rounded-[6px] ring-1 ring-inset ring-teal/25')}
                  >
                    {renderCell(row.byYear[y])}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ items }: { items: { swatch: React.ReactNode; label: string }[] }) {
  return (
    <div className="mt-[12px] flex flex-wrap items-center gap-x-[16px] gap-y-[6px] border-t border-border pt-[10px] text-[11.5px] text-text-muted">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-[6px]">
          {it.swatch}
          <span dir="auto">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

// ── Icons + constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ArrowIcon({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {flip ? <path d="M19 12H5M11 6l-6 6 6 6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CrossIcon({ small }: { small?: boolean }) {
  const s = small ? 8 : 12;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
