'use client';

// Curriculum → Insights (coordinator/admin, read-only). A faithful port of the Alsama
// "Curriculum health" Claude Design: a title row (subject picker) over a 2×2 grid of
// FIXED-SIZE analytics cards — Hours per month · Hours per focus area · Spiralling across
// years · Coverage & gaps.
//
// FIXED-SIZE DASHBOARD. Every card is capped to a data-INDEPENDENT height so the dashboard
// looks the same regardless of how much data a subject has. No card grows to fit its data:
// long content scrolls or PAGINATES within the capped card. English is the stress case
// (~178 themes) — its focus-area card falls back to the ~5 linguistic skills, and its two
// topic matrices paginate (15 rows/page) behind a filter box rather than rendering all rows.
//
// The DESIGN is ported verbatim (spacing, the teal magnitude ramp, the clay/red gap tones,
// the deepening spiral, the coverage matrix with red gap-crosses and the callout). The DATA
// is real: chart 1 ← hoursPerMonth (calendar count), charts 2–4 ← focus_area/theme (#99's
// cleaned logic — the live per-subject signal). The spiral's deepening is POSITIONAL (Nth
// recurrence), never a fabricated complexity signal.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { SubjectOption } from './explorer-ui';
import type { HoursPerMonth, LinguisticSkillHours, TopicsData } from '@/lib/curriculum/composition';
import {
  hoursPerMonthForYear,
  hoursByFocusArea,
  hoursByLinguisticSkill,
  topicMatrix,
  gapNotes,
  deepeningColor,
  interiorGapYears,
  rowMax,
  monthInitial,
  LOW_MONTH_MEDIAN_FRACTION,
  type MatrixView,
  type MatrixRow,
} from '@/lib/curriculum/insights';

/** Topic-segment palette for the focus-area bars (biggest topic → deepest). */
const SEGMENT_STOPS = [
  'var(--color-chart-teal-6)',
  'var(--color-chart-teal-2)',
  'var(--color-chart-teal-3)',
  'var(--color-chart-teal-4)',
  'var(--color-chart-teal-5)',
  'var(--color-chart-teal-1)',
];

// Fixed card heights — the invariant that keeps the dashboard the same size regardless of
// data length. Row 1 (hours-per-month · focus area) is compact; row 2 (the two topic
// matrices) is taller to hold ~15 paginated rows plus a legend/callout. Within a grid row
// both cards stretch to the taller, so each row reads as one band.
const ROW1_HEIGHT = 300;
const ROW2_HEIGHT = 520;
/** Fixed grid-row footprint for the theme-mode matrices. Rows are pinned to this height
 *  (`grid-auto-rows`) so every row — including the year-label header — is uniform and the
 *  rows-per-page fit can be computed from the measured body height. `ROW_STRIDE` is the
 *  vertical space one row consumes (height + the row gap between rows). `MIN_ROWS_PER_PAGE`
 *  is the floor so a very short body never collapses to a useless one- or two-row page. */
const MATRIX_ROW_HEIGHT = 30;
const MATRIX_ROW_GAP = 5;
const MATRIX_ROW_STRIDE = MATRIX_ROW_HEIGHT + MATRIX_ROW_GAP;
const MIN_ROWS_PER_PAGE = 6;
/** Reserved height for each matrix card's footer (legend / gap callout) so both row-2 cards
 *  budget the SAME body height whether or not the callout renders — keeping their fitted
 *  rows-per-page identical. */
const MATRIX_FOOTER_MIN_HEIGHT = 56;

/** How many whole theme rows (excluding the sticky year-label header row) fit in a body of
 *  `bodyHeight` px, clamped to the floor. Pure so the fit math stays in one place. */
function fitRowsPerPage(bodyHeight: number): number {
  const rows = Math.floor((bodyHeight - MATRIX_ROW_HEIGHT) / MATRIX_ROW_STRIDE);
  return Math.max(MIN_ROWS_PER_PAGE, rows);
}

export function CurriculumInsights({
  subjects,
  subjectCode,
  years,
  year,
  hoursPerMonth,
  topics,
  linguisticSkills,
}: {
  subjects: SubjectOption[];
  subjectCode: string;
  /** Passed by the page for API symmetry with the Explorer surfaces; the design shows the
   *  subject in the picker + app chrome, so it isn't rendered separately here. */
  subjectName?: string;
  years: number[];
  year: number;
  hoursPerMonth: HoursPerMonth[];
  topics: TopicsData;
  /** Raw (skill, hours) groupings — canonicalised into the ~5 linguistic skills that back
   *  the ENGLISH fallback of the focus-area card. Empty for focus-area subjects. */
  linguisticSkills: LinguisticSkillHours[];
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
  const yearName = (y: number) => (y === 0 ? t('prep') : t('yearShort', { n: formatNumber(y, locale) }));
  const explorerHref = `/curriculum?${new URLSearchParams({ tab: 'topics', subject: subjectCode, year: String(year) }).toString()}`;

  // The two row-2 matrices (spiral + coverage) each measure how many whole rows fit their
  // body; we page BOTH off the SMALLER budget so they show the same count, stay the same
  // height and neither scrolls. Each panel reports its own fitted rows here; the shared
  // `rowsPerPage` is the min (clamped to the floor until the first measurement lands).
  const [rowBudgets, setRowBudgets] = useState<Record<string, number>>({});
  const reportRowBudget = useCallback((panelId: string, rows: number) => {
    setRowBudgets((prev) => (prev[panelId] === rows ? prev : { ...prev, [panelId]: rows }));
  }, []);
  const rowsPerPage = useMemo(() => {
    const budgets = Object.values(rowBudgets);
    return budgets.length ? Math.max(MIN_ROWS_PER_PAGE, Math.min(...budgets)) : MIN_ROWS_PER_PAGE;
  }, [rowBudgets]);

  return (
    <div className="mx-auto max-w-[1240px] overflow-hidden rounded-[18px] border border-border bg-surface shadow-card">
      {/* Title row: "Curriculum health" · subject picker (the year lens lives on card 1). */}
      <div className="flex flex-wrap items-center gap-[12px] px-[24px] pb-[6px] pt-[16px]">
        <h1 className="m-0 text-[21px] font-semibold tracking-[-0.01em] text-ink">{t('title')}</h1>
        <span className="mx-[4px] h-[20px] w-px bg-[#E0D6C7]" aria-hidden />
        <PillSelect
          ariaLabel={t('subjectLabel')}
          value={subjectCode}
          onChange={(v) => go({ subject: v })}
          options={subjects.map((s) => ({ value: s.code, label: s.name }))}
          variant="subject"
        />
      </div>

      <div className="bg-[#FBFAF6] px-[24px] pb-[24px] pt-[14px]">
        <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
          <HoursPerMonthCard
            hoursPerMonth={hoursPerMonth}
            year={year}
            years={years}
            yearName={yearName}
            onYear={(y) => go({ year: y })}
          />
          <FocusAreaCard topics={topics} linguisticSkills={linguisticSkills} />
          <SpiralCard
            topics={topics}
            yearName={yearName}
            rowsPerPage={rowsPerPage}
            reportRowBudget={reportRowBudget}
          />
          <CoverageCard
            topics={topics}
            yearName={yearName}
            explorerHref={explorerHref}
            rowsPerPage={rowsPerPage}
            reportRowBudget={reportRowBudget}
          />
        </div>
      </div>
    </div>
  );
}

// ── Shared chrome ────────────────────────────────────────────────────────────────────

/** A fixed-height analytics card: a non-shrinking header, a `flex-1` body that owns its own
 *  overflow (scroll/paginate), and an optional non-shrinking footer (legend/callout/pager).
 *  `height` is the data-independent cap; `bodyClassName` tunes how the body handles overflow. */
function Card({
  title,
  headerRight,
  footer,
  height,
  bodyClassName,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  height: number;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-[15px] border border-[#ECE3D5] bg-surface p-[18px]" style={{ height }}>
      <div className="mb-[14px] flex shrink-0 items-center justify-between gap-[10px]">
        <span className="text-[14px] font-semibold text-ink">{title}</span>
        {headerRight}
      </div>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
      {footer ? <div className="mt-[14px] shrink-0">{footer}</div> : null}
    </section>
  );
}

/** The small "All years" / "Prep ▾" chip in a card header. `onSelect` makes it a real
 *  year picker (card 1); without it, it's a static "All years" label (cards 2–4). */
function LensChip({
  label,
  years,
  value,
  yearName,
  onSelect,
}: {
  label: string;
  years?: number[];
  value?: number;
  yearName?: (y: number) => string;
  onSelect?: (y: number) => void;
}) {
  if (onSelect && years && value !== undefined && yearName) {
    return (
      <span className="relative inline-flex">
        <select
          aria-label={label}
          value={String(value)}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="cursor-pointer appearance-none rounded-[8px] bg-[#F1EBE1] py-[4px] pe-[26px] ps-[10px] text-[12px] font-medium text-[#5C544E] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {yearName(y)}
            </option>
          ))}
        </select>
        <Chevron className="pointer-events-none absolute end-[9px] top-1/2 -translate-y-1/2" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[6px] rounded-[8px] bg-[#F1EBE1] px-[10px] py-[4px] text-[12px] font-medium text-[#5C544E]">
      {label}
      <Chevron />
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  const t = useTranslations('insights');
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[10px] border border-dashed border-[#E0D6C7] bg-[#FBFAF6] px-[16px] py-[26px] text-center">
      <p dir="auto" className="text-[13px] text-text-muted">{message}</p>
      <p className="mt-[6px] text-[11px] text-text-faint">{t('fillsInNote')}</p>
    </div>
  );
}

// ── 1) Hours per month ──────────────────────────────────────────────────────────────

function HoursPerMonthCard({
  hoursPerMonth,
  year,
  years,
  yearName,
  onYear,
}: {
  hoursPerMonth: HoursPerMonth[];
  year: number;
  years: number[];
  yearName: (y: number) => string;
  onYear: (y: number) => void;
}) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const view = useMemo(() => hoursPerMonthForYear(hoursPerMonth, year), [hoursPerMonth, year]);
  const max = view.maxHours;

  const barColor = (low: boolean, hours: number) => {
    if (low) return 'var(--color-flag-bar)';
    if (hours >= max) return 'var(--color-chart-teal-6)';
    if (max > 0 && hours / max >= 0.8) return 'var(--color-chart-teal-3)';
    return 'var(--color-chart-teal-2)';
  };
  const labelColor = (low: boolean, hours: number) => {
    if (low) return 'var(--color-gap)';
    if (hours >= max) return 'var(--color-coverage-text)';
    return '#A79E94';
  };

  return (
    <Card
      title={t('card1.title')}
      headerRight={<LensChip label={yearName(year)} years={years} value={year} yearName={yearName} onSelect={onYear} />}
      height={ROW1_HEIGHT}
      bodyClassName="flex flex-col justify-center"
    >
      {view.bars.length === 0 ? (
        <EmptyState message={t('card1.empty')} />
      ) : (
        <>
          <div className="grid items-end gap-[8px]" style={{ gridTemplateColumns: `repeat(${view.bars.length}, 1fr)`, height: 140 }}>
            {view.bars.map((b) => (
              <div key={b.month} className="flex h-full flex-col items-center justify-end gap-[6px]">
                <span className="text-[10px]" style={{ color: labelColor(b.low, b.hours), fontWeight: b.low || b.hours >= max ? 600 : 400 }}>
                  {formatNumber(b.hours, locale)}
                </span>
                <div
                  className="w-full rounded-t-[5px]"
                  style={{
                    height: `${max > 0 ? Math.max(6, (b.hours / max) * 100) : 6}%`,
                    background: barColor(b.low, b.hours),
                    border: b.low ? '1px dashed var(--color-gap)' : undefined,
                  }}
                  title={b.low ? t('card1.flagNote', { pct: Math.round(LOW_MONTH_MEDIAN_FRACTION * 100), median: formatNumber(view.median, locale) }) : undefined}
                />
              </div>
            ))}
          </div>
          <div className="mt-[7px] grid gap-[8px]" style={{ gridTemplateColumns: `repeat(${view.bars.length}, 1fr)` }}>
            {view.bars.map((b) => (
              <span key={b.month} dir="auto" className="text-center text-[9.5px] text-[#A79E94]">
                {monthInitial(b.month)}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── 2) Hours per focus area / linguistic skill ──────────────────────────────────────
//
// focus_area subjects: one bar per focus area, each broken down by its topics. ENGLISH (no
// focus_area, ~178 themes): fall back to one bar per canonical linguistic skill. Either way
// the list is short, and the body scrolls within the fixed card if it ever overflows.

function FocusAreaCard({
  topics,
  linguisticSkills,
}: {
  topics: TopicsData;
  linguisticSkills: LinguisticSkillHours[];
}) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const isSkillMode = topics.groupedBy === 'theme';
  const focusView = useMemo(() => hoursByFocusArea(topics), [topics]);
  const skillView = useMemo(() => hoursByLinguisticSkill(linguisticSkills), [linguisticSkills]);

  // In skill mode the bars are the canonical skills (no sub-topic breakdown); otherwise the
  // focus-area bars (each with a topic breakdown). Normalise both to the same bar shape.
  const bars = isSkillMode
    ? skillView.bars.map((b) => ({ label: b.label, hours: b.hours, pct: b.pct, topics: [] as { topic: string; hours: number }[] }))
    : focusView.bars.map((b) => ({ label: b.label, hours: b.hours, pct: b.pct, topics: b.topics }));

  return (
    <Card
      title={isSkillMode ? t('card2.titleSkill') : t('card2.titleFocus')}
      headerRight={<LensChip label={t('allYears')} />}
      height={ROW1_HEIGHT}
      bodyClassName="overflow-y-auto pe-[4px]"
    >
      {bars.length === 0 ? (
        <EmptyState message={isSkillMode ? t('card2.emptySkill') : t('card2.empty')} />
      ) : (
        <div className="flex flex-col gap-[15px]">
          {isSkillMode ? (
            <p dir="auto" className="-mt-[4px] text-[11px] text-text-faint">{t('card2.skillNote')}</p>
          ) : null}
          {bars.map((b, i) => {
            const segs = b.topics.length > 0 ? b.topics : [{ topic: b.label, hours: b.hours }];
            return (
              <div key={`${b.label}-${i}`}>
                <div className="mb-[5px] flex items-baseline justify-between gap-[10px]">
                  <span dir="auto" className="min-w-0 truncate text-[13px] font-medium text-[#3A332E]">{b.label}</span>
                  <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-[#6C6259]">
                    {t('hoursShort', { n: formatNumber(b.hours, locale) })} · {formatNumber(Math.round(b.pct), locale)}%
                  </span>
                </div>
                <div className="flex h-[12px] overflow-hidden rounded-full" style={{ background: 'var(--color-chart-track)' }}>
                  <div className="flex h-full overflow-hidden" style={{ width: `${Math.max(3, b.pct)}%` }}>
                    {segs.map((s, si) => (
                      <span
                        key={`${s.topic}-${si}`}
                        title={`${s.topic} · ${formatNumber(s.hours, locale)}`}
                        style={{ width: `${b.hours > 0 ? (s.hours / b.hours) * 100 : 100}%`, background: SEGMENT_STOPS[si % SEGMENT_STOPS.length] }}
                      />
                    ))}
                  </div>
                </div>
                {b.topics.length > 0 ? (
                  <div className="mt-[8px] flex flex-wrap gap-x-[14px] gap-y-[4px]">
                    {b.topics.map((s, si) => (
                      <span key={`${s.topic}-${si}`} dir="auto" className="text-[11px] text-[#8A8178]">
                        <span className="me-[5px] inline-block size-[7px] rounded-[2px] align-middle" style={{ background: SEGMENT_STOPS[si % SEGMENT_STOPS.length] }} />
                        {s.topic} · {formatNumber(s.hours, locale)}
                      </span>
                    ))}
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

// ── Shared topic-matrix scaffold (cards 3 & 4) ───────────────────────────────────────
//
// Both matrices share the same long-list taming: focus_area subjects group rows under
// COLLAPSIBLE Focus Areas (the whole grid scrolls within the fixed card); ENGLISH (theme
// mode) keeps per-theme rows but PAGINATES them (15/page) behind a FILTER box — never
// rendering all ~178 rows. The two cards differ only in their cell renderer and footer, so
// this component owns the layout and takes those as props.

function MatrixScaffold({
  panelId,
  title,
  headerRight,
  view,
  yearName,
  labelWidth,
  emptyMessage,
  renderCell,
  footer,
  rowsPerPage,
  reportRowBudget,
}: {
  /** Stable id used to report this panel's fitted rows to the shared parent budget. */
  panelId: string;
  title: string;
  headerRight?: React.ReactNode;
  view: MatrixView;
  yearName: (y: number) => string;
  labelWidth: number;
  emptyMessage: string;
  renderCell: (row: MatrixRow, year: number, taughtYears: number[]) => React.ReactNode;
  footer?: React.ReactNode;
  /** Shared rows-per-page (the SMALLER of the two panels' fitted budgets). */
  rowsPerPage: number;
  reportRowBudget: (panelId: string, rows: number) => void;
}) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const isTheme = view.groupedBy === 'theme';
  // Label column bounded; year columns share the remaining width evenly (minmax(0,1fr) lets
  // them shrink below content), so all 7 fit with no horizontal scroll.
  const cols = `minmax(0, ${labelWidth}px) repeat(${view.years.length}, minmax(0, 1fr))`;

  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Measure the body height and report how many whole rows fit; the parent feeds back the
  // smaller of the two panels' budgets as `rowsPerPage`. Runs on mount and on every body
  // resize (viewport / font / footer changes) via a ResizeObserver.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isTheme) return;
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => reportRowBudget(panelId, fitRowsPerPage(el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isTheme, panelId, reportRowBudget]);

  // Theme mode: flatten (single group), filter, then page off the shared rows-per-page.
  const allRows = useMemo(() => view.groups.flatMap((g) => g.rows), [view]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? allRows.filter((r) => r.topic.toLowerCase().includes(q)) : allRows;
  }, [allRows, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  // Clamp the page whenever rowsPerPage (or the filter) shrinks the page count so we never
  // render past the last page.
  const clampedPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(clampedPage * rowsPerPage, clampedPage * rowsPerPage + rowsPerPage);
  const from = filtered.length === 0 ? 0 : clampedPage * rowsPerPage + 1;
  const to = clampedPage * rowsPerPage + pageRows.length;

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card title={title} headerRight={headerRight} height={ROW2_HEIGHT} bodyClassName="flex flex-col" footer={footer}>
      {view.groups.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          {isTheme ? (
            <div className="relative mb-[10px] shrink-0">
              <SearchIcon />
              <input
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
                dir="auto"
                placeholder={t('matrix.filterPlaceholder')}
                aria-label={t('matrix.filterPlaceholder')}
                className="w-full rounded-[8px] border border-border bg-surface py-[7px] pe-[10px] ps-[30px] text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
              />
            </div>
          ) : null}

          <div
            ref={bodyRef}
            className={cn('min-h-0 flex-1', isTheme ? 'overflow-hidden' : 'overflow-auto')}
          >
            {isTheme && filtered.length === 0 ? (
              <p className="pt-[24px] text-center text-[12.5px] text-text-muted">{t('matrix.noMatches')}</p>
            ) : isTheme ? (
              // Theme mode: exactly `rowsPerPage` fitted rows + the year-label header, all
              // pinned to a uniform row height. No overflow-y (nothing exceeds the body) and
              // overflow-x hidden (the 7 year columns share the width instead of scrolling).
              <div
                className="grid items-center overflow-x-hidden"
                style={{ gridTemplateColumns: cols, gridAutoRows: MATRIX_ROW_HEIGHT, columnGap: 5, rowGap: MATRIX_ROW_GAP }}
              >
                <span />
                {view.years.map((y) => (
                  <span key={y} className="truncate text-center text-[10px] text-[#A79E94]">{yearName(y)}</span>
                ))}
                {pageRows.map((row, ri) => (
                  <MatrixRowCells key={`${row.topic}-${ri}`} row={row} years={view.years} renderCell={renderCell} />
                ))}
              </div>
            ) : (
              <div className="grid items-center gap-[5px] pe-[2px]" style={{ gridTemplateColumns: cols }}>
                <span />
                {view.years.map((y) => (
                  <span key={y} className="truncate text-center text-[10px] text-[#A79E94]">{yearName(y)}</span>
                ))}
                {view.groups.map((g, gi) => {
                      const key = g.faLabel ?? `g-${gi}`;
                      const open = !collapsed.has(key);
                      return (
                        <Fragment key={key}>
                          <button
                            type="button"
                            onClick={() => toggleGroup(key)}
                            aria-expanded={open}
                            className="flex items-center gap-[7px] py-[5px] text-start"
                            style={{ gridColumn: '1 / -1' }}
                          >
                            <GroupChevron open={open} />
                            <span dir="auto" className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#9A7B5C]">
                              {g.faLabel ?? t('card2.titleFocus')}
                            </span>
                            <span className="text-[10px] text-[#A79E94]">
                              {t('matrix.topicsCount', { count: g.rows.length })}
                            </span>
                          </button>
                          {open
                            ? g.rows.map((row, ri) => (
                                <MatrixRowCells key={`${row.topic}-${ri}`} row={row} years={view.years} renderCell={renderCell} />
                              ))
                            : null}
                        </Fragment>
                      );
                    })}
              </div>
            )}
          </div>

          {isTheme && filtered.length > 0 ? (
            <div className="mt-[10px] flex shrink-0 items-center justify-between gap-[10px] border-t border-[#F0EAE1] pt-[10px]">
              <span className="text-[11px] tabular-nums text-[#8A8178]">
                {t('matrix.pageRange', {
                  from: formatNumber(from, locale),
                  to: formatNumber(to, locale),
                  total: formatNumber(filtered.length, locale),
                })}
              </span>
              <span className="flex items-center gap-[6px]">
                <PagerButton label={t('matrix.prevPage')} disabled={clampedPage <= 0} onClick={() => setPage(clampedPage - 1)} dir="prev" />
                <span className="text-[11px] tabular-nums text-[#8A8178]">
                  {formatNumber(clampedPage + 1, locale)} / {formatNumber(totalPages, locale)}
                </span>
                <PagerButton label={t('matrix.nextPage')} disabled={clampedPage >= totalPages - 1} onClick={() => setPage(clampedPage + 1)} dir="next" />
              </span>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** One topic row as bare grid items (label + a cell per year). `display:contents` lets the
 *  label and cells participate directly in the parent matrix grid. */
function MatrixRowCells({
  row,
  years,
  renderCell,
}: {
  row: MatrixRow;
  years: number[];
  renderCell: (row: MatrixRow, year: number, taughtYears: number[]) => React.ReactNode;
}) {
  const taughtYears = years.filter((y) => row.byYear[y] !== undefined);
  return (
    <div className="contents">
      <span dir="auto" title={row.topic} className="min-w-0 truncate text-[11.5px] text-[#3A332E]">{row.topic}</span>
      {years.map((y) => renderCell(row, y, taughtYears))}
    </div>
  );
}

// ── 3) Spiralling across years ──────────────────────────────────────────────────────

function SpiralCard({
  topics,
  yearName,
  rowsPerPage,
  reportRowBudget,
}: {
  topics: TopicsData;
  yearName: (y: number) => string;
  rowsPerPage: number;
  reportRowBudget: (panelId: string, rows: number) => void;
}) {
  const t = useTranslations('insights');
  const view = useMemo(() => topicMatrix(topics), [topics]);

  const renderCell = (row: MatrixRow, y: number, taughtYears: number[]) => {
    const taught = row.byYear[y] !== undefined;
    if (!taught) {
      return (
        <span key={y} className="h-[20px] rounded-[5px] border border-dashed" style={{ background: 'var(--color-cell-dash-bg)', borderColor: 'var(--color-cell-dash-border)' }} />
      );
    }
    const occ = taughtYears.indexOf(y);
    return <span key={y} className="h-[20px] rounded-[5px]" style={{ background: deepeningColor(occ, taughtYears.length) }} />;
  };

  return (
    <MatrixScaffold
      panelId="spiral"
      title={t('card3.title')}
      headerRight={<LensChip label={t('allYears')} />}
      view={view}
      yearName={yearName}
      labelWidth={172}
      emptyMessage={t('card3.empty')}
      renderCell={renderCell}
      rowsPerPage={rowsPerPage}
      reportRowBudget={reportRowBudget}
      footer={
        <div className="flex flex-wrap items-start gap-[16px]" style={{ minHeight: MATRIX_FOOTER_MIN_HEIGHT }}>
          <span className="inline-flex items-center gap-[6px] text-[11px] text-[#8A8178]">
            <span className="inline-flex">
              <span className="size-[9px] rounded-[2px]" style={{ background: 'var(--color-chart-teal-1)' }} />
              <span className="size-[9px] rounded-[2px]" style={{ background: 'var(--color-chart-teal-3)' }} />
              <span className="size-[9px] rounded-[2px]" style={{ background: 'var(--color-chart-teal-6)' }} />
            </span>
            {t('card3.taughtDeepening')}
          </span>
          <span className="inline-flex items-center gap-[6px] text-[11px] text-[#8A8178]">
            <span className="size-[10px] rounded-[2px] border border-dashed" style={{ background: 'var(--color-cell-dash-bg)', borderColor: 'var(--color-cell-dash-border)' }} />
            {t('card3.notTaught')}
          </span>
        </div>
      }
    />
  );
}

// ── 4) Coverage & gaps ──────────────────────────────────────────────────────────────

function CoverageCard({
  topics,
  yearName,
  explorerHref,
  rowsPerPage,
  reportRowBudget,
}: {
  topics: TopicsData;
  yearName: (y: number) => string;
  explorerHref: string;
  rowsPerPage: number;
  reportRowBudget: (panelId: string, rows: number) => void;
}) {
  const t = useTranslations('insights');
  const locale = useLocale();
  const view = useMemo(() => topicMatrix(topics), [topics]);
  const notes = useMemo(() => gapNotes(view), [view]);
  const gapAria = t('card4.gapAria');

  const renderCell = (row: MatrixRow, y: number) => {
    const hours = row.byYear[y];
    if (hours !== undefined) {
      const rMax = rowMax(row, view.years);
      return (
        <span
          key={y}
          className="flex h-[26px] items-center justify-center rounded-[5px] text-[11px] font-semibold tabular-nums"
          style={{ background: hours >= rMax ? 'var(--color-coverage-hi)' : 'var(--color-coverage-lo)', color: 'var(--color-coverage-text)' }}
        >
          {formatNumber(hours, locale)}
        </span>
      );
    }
    const gaps = interiorGapYears(row, view.years);
    if (gaps.has(y)) {
      return (
        <span key={y} className="flex h-[26px] items-center justify-center rounded-[5px] border-[1.5px] border-gap bg-gap-bg text-gap" aria-label={gapAria}>
          <CrossIcon />
        </span>
      );
    }
    return <span key={y} className="h-[26px] rounded-[5px]" style={{ background: 'var(--color-cell-blank)' }} />;
  };

  const gapText = (gapYears: number[]) =>
    gapYears.length === 1
      ? yearName(gapYears[0])
      : t('yearsRange', { from: formatNumber(gapYears[0], locale), to: formatNumber(gapYears[gapYears.length - 1], locale) });
  const primary = notes[0];

  return (
    <MatrixScaffold
      panelId="coverage"
      title={t('card4.title')}
      headerRight={
        <span className="flex items-center gap-[8px]">
          <LensChip label={t('allYears')} />
          {notes.length > 0 ? (
            <span className="text-[11.5px] font-semibold text-gap">{t('card4.gapsFlagged', { count: notes.length })}</span>
          ) : null}
        </span>
      }
      view={view}
      yearName={yearName}
      labelWidth={150}
      emptyMessage={t('card4.empty')}
      renderCell={renderCell}
      rowsPerPage={rowsPerPage}
      reportRowBudget={reportRowBudget}
      // Always reserve the callout's footprint (min-height) so the body-height budget — and
      // thus the fitted rows-per-page — is the same whether or not a gap callout renders.
      footer={
        <div className="flex items-center" style={{ minHeight: MATRIX_FOOTER_MIN_HEIGHT }}>
          {primary ? (
            <div className="flex w-full items-center gap-[8px] rounded-[9px] border border-gap-border bg-gap-bg px-[12px] py-[9px]">
              <WarningIcon />
              <span dir="auto" className="flex-1 text-[12.5px] text-[#7A4436] [overflow-wrap:anywhere]">
                {t.rich('card4.gapNarrative', {
                  topic: primary.topic,
                  gap: gapText(primary.gapYears),
                  reappear: yearName(primary.reappear),
                  b: (chunks) => <b className="font-semibold">{chunks}</b>,
                })}
              </span>
              <Link href={explorerHref} className="whitespace-nowrap text-[12px] font-semibold text-gap" aria-label={t('openInExplorer')}>
                {t('openInExplorer')}
                <span aria-hidden> →</span>
              </Link>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

// ── Small primitives ─────────────────────────────────────────────────────────────────

function PagerButton({ label, disabled, onClick, dir }: { label: string; disabled: boolean; onClick: () => void; dir: 'prev' | 'next' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-[26px] items-center justify-center rounded-[7px] border border-border bg-surface text-[#5C544E] transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
        {dir === 'prev' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}

function PillSelect({
  ariaLabel,
  value,
  onChange,
  options,
  variant,
}: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  variant: 'subject';
}) {
  return (
    <span className="relative inline-flex">
      <span className="sr-only">{ariaLabel}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'cursor-pointer appearance-none rounded-[9px] border border-border-strong bg-surface py-[8px] pe-[32px] ps-[12px] text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40',
          variant === 'subject' && '',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Chevron className="pointer-events-none absolute end-[11px] top-1/2 -translate-y-1/2" />
    </span>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A79E94" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function GroupChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={open ? '#9A7B5C' : '#B4AA9E'}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('shrink-0', !open && 'rtl:-scale-x-100')}
    >
      {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#B6ABA0"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="pointer-events-none absolute start-[10px] top-1/2 -translate-y-1/2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gap)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
