'use client';

// The "NEW LESSON" two-step wizard launched from a day column's "+ Add lesson".
//
//   Step 1 — Class : pick the year group. Subject and centre are fixed by the
//     signed-in teacher's context, so they are not re-selected here, and for the
//     single-centre English pilot every plan defaults to whole-centre (`centre`)
//     scope — the audience-scope chooser is intentionally omitted. The OLD
//     model's Years-with-Groups (A/B/C) taxonomy does NOT exist and is never
//     offered.
//
//   Step 2 — Lesson: pick one curriculum period for a (Month, Week). The Month
//     dropdown + Week stepper drive a live curriculum query (Year + Month + Week
//     → the period rows), defaulting to the board's current week. Day labels are
//     intentionally dropped — `period` is a curriculum period, not a weekday.
//
// On create the wizard calls the existing `createScopedPlan` path: the plan lands
// on the launching day column (`weekday`), at the next day-ordinal for the year,
// and the create action derives subject/year/school server-side from the locked
// curriculum key. Week numbers are shown exactly as stored (no per-month renumber).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { createScopedPlan } from '@/lib/actions/create-lesson';
import { loadPickerCells, loadPickerNav } from '@/lib/actions/lesson-picker';
import { formatNumber } from '@/lib/format';
import type { MonthNav, PickerCell } from '@/components/create-lesson/types';
import type { AddYearOption } from '@/components/weekly-overview/ScopeChooser';
import type { BoardClass } from '@/types/weekly-overview';

interface NewLessonModalProps {
  /** The Mon–Fri column (1..5) the "+ Add lesson" was pressed on. */
  weekday: number;
  /** The teacher's year groups, each with its next day-ordinal for this column. */
  years: AddYearOption[];
  subjectName: string;
  subjectCode: string;
  /** "Centre · Subject" context line, for the step-1 subtitle. */
  context: string | null;
  /** The board's current curriculum coordinate — the wizard opens here. */
  initialCoordinate: { month: string; week: number };
  /**
   * The teacher's own classes per year. Currently unused by the modal — for the
   * single-centre English pilot every plan defaults to whole-centre (`centre`)
   * scope — but retained on the props so the board's ScopeChooser API stays
   * stable if per-class scope is reinstated.
   */
  classesByYear: Record<number, BoardClass[]>;
  onClose: () => void;
}

type Step = 'class' | 'lesson';

export function NewLessonModal({
  weekday,
  years,
  subjectName,
  subjectCode,
  context,
  initialCoordinate,
  onClose,
}: NewLessonModalProps) {
  const t = useTranslations('board');
  const router = useRouter();
  const [step, setStep] = useState<Step>('class');

  const [year, setYear] = useState<number>(years[0]?.year ?? 0);

  const [nav, setNav] = useState<MonthNav[]>([]);
  const [month, setMonth] = useState<string>(initialCoordinate.month);
  const [week, setWeek] = useState<number>(initialCoordinate.week);
  const [cells, setCells] = useState<PickerCell[]>([]);
  const [loadingCells, setLoadingCells] = useState(true);
  const [selectedLessonKey, setSelectedLessonKey] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A monotonic token so a slow nav/cell response can't overwrite a newer one.
  // State is only touched AFTER the first await, so these are safe to kick off
  // from an effect (the synchronous "loading" flag is set by the callers below).
  const reqRef = useRef(0);

  /** Re-query just the period cells for an already-snapped (year, month, week). */
  const runCells = useCallback(
    async (y: number, m: string, w: number) => {
      const token = ++reqRef.current;
      const next = m ? await loadPickerCells(subjectCode, y, m, w) : [];
      if (token !== reqRef.current) return;
      setCells(next);
      setSelectedLessonKey(null);
      setLoadingCells(false);
    },
    [subjectCode],
  );

  /**
   * Load the year's month/week nav, snap the coordinate into it (prefer the
   * passed month/week, else the first available), then load that week's cells.
   */
  const runForYear = useCallback(
    async (y: number, preferMonth: string, preferWeek: number) => {
      const token = ++reqRef.current;
      const navList = await loadPickerNav(subjectCode, y);
      if (token !== reqRef.current) return;
      setNav(navList);

      let m = preferMonth;
      let w = preferWeek;
      const monthEntry = navList.find((n) => n.month === m);
      if (!monthEntry) {
        m = navList[0]?.month ?? '';
        w = navList[0]?.weeks[0] ?? 1;
      } else if (!monthEntry.weeks.includes(w)) {
        w = monthEntry.weeks[0] ?? w;
      }
      setMonth(m);
      setWeek(w);

      const next = m ? await loadPickerCells(subjectCode, y, m, w) : [];
      if (token !== reqRef.current) return;
      setCells(next);
      setSelectedLessonKey(null);
      setLoadingCells(false);
    },
    [subjectCode],
  );

  // Initial load for the opening year + the board's current coordinate.
  // `loadingCells` already starts true, so the mount path sets no state until
  // the fetch resolves (keeps this effect free of synchronous setState).
  useEffect(() => {
    void runForYear(years[0]?.year ?? 0, initialCoordinate.month, initialCoordinate.week);
    // Mount-only: subsequent year changes go through onPickYear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickYear = (next: number) => {
    if (next === year) return;
    setYear(next);
    setError(null);
    setLoadingCells(true);
    void runForYear(next, month, week);
  };

  const monthWeeks = nav.find((n) => n.month === month)?.weeks ?? [];
  const weekIdx = monthWeeks.indexOf(week);
  const canPrevWeek = weekIdx > 0;
  const canNextWeek = weekIdx >= 0 && weekIdx < monthWeeks.length - 1;

  const onChangeMonth = (nextMonth: string) => {
    const entry = nav.find((n) => n.month === nextMonth);
    const nextWeek = entry?.weeks[0] ?? week;
    setMonth(nextMonth);
    setWeek(nextWeek);
    setLoadingCells(true);
    void runCells(year, nextMonth, nextWeek);
  };

  const stepWeek = (delta: number) => {
    const target = monthWeeks[weekIdx + delta];
    if (target == null) return;
    setWeek(target);
    setLoadingCells(true);
    void runCells(year, month, target);
  };

  const placement = years.find((y) => y.year === year);

  const create = async () => {
    if (!selectedLessonKey) {
      setError(t('modal.errors.pickLesson'));
      return;
    }
    setBusy(true);
    setError(null);
    // Single-centre English pilot: every plan is created at whole-centre scope.
    const res = await createScopedPlan({
      lessonKey: selectedLessonKey,
      scope: 'centre',
      weekday,
      period: placement?.period,
    });
    if (res.ok) {
      router.push(`/plan/${res.planId}`);
      return; // keep the modal up through the navigation
    }
    setError(res.error);
    setBusy(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('modal.ariaLabel')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[18px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]">
        {/* Header: NEW LESSON badge + close, then the Class / Lesson tab header. */}
        <div className="px-[28px] pt-[22px]">
          <div className="flex items-start justify-between">
            <span className="rounded-[8px] bg-status-progress-bg px-[11px] py-[6px] text-[11.5px] font-bold uppercase tracking-[0.06em] text-status-progress">
              {t('modal.badge')}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('modal.close')}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-surface-subtle text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-[18px] flex items-center gap-[18px] border-b border-[#F0EAE1]">
            <TabHeader
              label={t('modal.tabClass')}
              active={step === 'class'}
              complete={step === 'lesson'}
              onClick={() => setStep('class')}
            />
            <span className="mb-[10px] h-px w-[22px] bg-neutral-300" aria-hidden />
            <TabHeader label={t('modal.tabLesson')} active={step === 'lesson'} complete={false} />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[28px] py-[22px]">
          {step === 'class' ? (
            <ClassStep
              subjectName={subjectName}
              context={context}
              years={years}
              year={year}
              onPickYear={onPickYear}
            />
          ) : (
            <LessonStep
              subjectName={subjectName}
              year={year}
              month={month}
              week={week}
              nav={nav}
              onChangeMonth={onChangeMonth}
              onPrevWeek={() => stepWeek(-1)}
              onNextWeek={() => stepWeek(1)}
              canPrevWeek={canPrevWeek}
              canNextWeek={canNextWeek}
              cells={cells}
              loading={loadingCells}
              selectedLessonKey={selectedLessonKey}
              onSelect={setSelectedLessonKey}
            />
          )}

          {error ? (
            <p className="mt-[16px] rounded-[10px] bg-status-review-bg px-[12px] py-[8px] text-[12.5px] text-status-review">
              {error}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#F0EAE1] px-[28px] py-[16px]">
          {step === 'class' ? (
            <button
              type="button"
              onClick={onClose}
              className="text-[13.5px] font-medium text-neutral-700 transition-colors hover:text-ink"
            >
              {t('modal.cancel')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep('class')}
              className="inline-flex items-center gap-[7px] text-[13.5px] font-medium text-neutral-700 transition-colors hover:text-ink"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              {t('modal.back')}
            </button>
          )}

          {step === 'class' ? (
            <button
              type="button"
              onClick={() => setStep('lesson')}
              className="inline-flex items-center gap-[7px] rounded-[11px] bg-teal px-[20px] py-[11px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(31,122,108,0.5)] transition-colors hover:bg-teal-deep"
            >
              {t('modal.continue')}
              <Arrow />
            </button>
          ) : (
            <button
              type="button"
              onClick={create}
              disabled={busy || !selectedLessonKey}
              className="inline-flex items-center gap-[7px] rounded-[11px] bg-teal px-[22px] py-[12px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(31,122,108,0.5)] transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t('modal.creating') : t('modal.create')}
              <Arrow />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A tab in the Class / Lesson header — completed steps show a check. */
function TabHeader({
  label,
  active,
  complete,
  onClick,
}: {
  label: string;
  active: boolean;
  complete: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'mb-[-1px] inline-flex items-center gap-[6px] border-b-[2px] pb-[10px] text-[15px] transition-colors',
        active
          ? 'border-teal font-semibold text-teal-deep'
          : 'border-transparent font-medium text-neutral-600',
        onClick && !active ? 'hover:text-ink' : '',
        !onClick ? 'cursor-default' : '',
      )}
    >
      {complete ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-status-approved)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : null}
      {label}
    </button>
  );
}

function Arrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Step 1 — year group only. The audience-scope chooser (class / centre / org)
 * is omitted for the single-centre English pilot; plans default to whole-centre
 * scope (set in `create`).
 */
function ClassStep({
  subjectName,
  context,
  years,
  year,
  onPickYear,
}: {
  subjectName: string;
  context: string | null;
  years: AddYearOption[];
  year: number;
  onPickYear: (year: number) => void;
}) {
  const t = useTranslations('board');
  const locale = useLocale();
  return (
    <div>
      <h2 className="text-[26px] font-semibold tracking-[-0.01em] text-ink">
        {t('modal.classStep.title')}
      </h2>
      <p dir="auto" className="mt-[5px] text-[13.5px] text-text-muted">{context ?? subjectName}</p>

      {/* Year group */}
      <div className="mt-[22px]">
        <div className="mb-[9px] text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">
          {t('modal.classStep.yearGroup')}
        </div>
        <div className="flex flex-wrap gap-[8px]">
          {years.map((y) => (
            <button
              key={y.year}
              type="button"
              onClick={() => onPickYear(y.year)}
              className={cn(
                'rounded-[11px] border px-[16px] py-[9px] text-[13.5px] font-semibold transition-colors',
                y.year === year
                  ? 'border-[1.5px] border-teal bg-teal-tint text-teal-deep'
                  : 'border-given-border bg-given text-ink hover:bg-surface-subtle',
              )}
            >
              {t('modal.classStep.year', { n: formatNumber(y.year, locale) })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Step 2 — the curriculum period picker with Month/Week navigation. */
function LessonStep({
  subjectName,
  year,
  month,
  week,
  nav,
  onChangeMonth,
  onPrevWeek,
  onNextWeek,
  canPrevWeek,
  canNextWeek,
  cells,
  loading,
  selectedLessonKey,
  onSelect,
}: {
  subjectName: string;
  year: number;
  month: string;
  week: number;
  nav: MonthNav[];
  onChangeMonth: (month: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canPrevWeek: boolean;
  canNextWeek: boolean;
  cells: PickerCell[];
  loading: boolean;
  selectedLessonKey: string | null;
  onSelect: (lessonKey: string) => void;
}) {
  const t = useTranslations('board');
  const locale = useLocale();
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-[14px]">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold tracking-[-0.01em] text-ink">
            {t('modal.lessonStep.title')}
          </h2>
          <p className="mt-[5px] text-[13.5px] text-text-muted">
            {subjectName ? (
              <>
                <span dir="auto">{subjectName}</span> ·{' '}
              </>
            ) : (
              ''
            )}
            {t('modal.lessonStep.breadcrumbYear', { n: formatNumber(year, locale) })}
            {month ? (
              <>
                {' '}
                <span className="text-neutral-400">›</span>{' '}
                <span dir="auto">{month}</span>{' '}
                <span className="text-neutral-400">›</span>{' '}
                {t('modal.lessonStep.breadcrumbWeek', { n: formatNumber(week, locale) })}
              </>
            ) : null}
          </p>
        </div>

        {/* Month dropdown + Week stepper — these drive the curriculum query. */}
        <div className="flex items-center gap-[10px]">
          <div className="relative">
            <select
              value={month}
              onChange={(e) => onChangeMonth(e.target.value)}
              className="appearance-none rounded-[10px] border border-border-strong bg-surface py-[9px] ps-[14px] pe-[30px] text-[13.5px] font-semibold text-ink focus:border-teal focus:outline-none"
            >
              {nav.map((n) => (
                <option key={n.month} value={n.month}>
                  {n.month}
                </option>
              ))}
            </select>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="pointer-events-none absolute end-[10px] top-1/2 -translate-y-1/2 text-neutral-500"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          <div className="flex items-center gap-[4px] rounded-[10px] border border-border-strong bg-surface px-[6px] py-[5px]">
            <StepBtn dir="prev" disabled={!canPrevWeek} onClick={onPrevWeek} />
            <span className="min-w-[64px] text-center text-[13.5px] font-semibold text-ink">
              {t('modal.lessonStep.week', { n: formatNumber(week, locale) })}
            </span>
            <StepBtn dir="next" disabled={!canNextWeek} onClick={onNextWeek} />
          </div>
        </div>
      </div>

      {/* Period cards */}
      <div className="mt-[20px]">
        {loading ? (
          <div className="flex gap-[12px] overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[210px] flex-1 animate-pulse rounded-[14px] border border-given-border bg-given"
              />
            ))}
          </div>
        ) : cells.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-surface-subtle px-[16px] py-[24px] text-center text-[13px] text-text-muted">
            {month
              ? t.rich('modal.lessonStep.emptyWithMonth', {
                  subject: subjectName || t('modal.lessonStep.thisSubject'),
                  year: formatNumber(year, locale),
                  month,
                  week: formatNumber(week, locale),
                  s: (chunks) => <span dir="auto">{chunks}</span>,
                  m: (chunks) => <span dir="auto">{chunks}</span>,
                })
              : t.rich('modal.lessonStep.emptyNoMonth', {
                  subject: subjectName || t('modal.lessonStep.thisSubject'),
                  year: formatNumber(year, locale),
                  s: (chunks) => <span dir="auto">{chunks}</span>,
                })}
          </div>
        ) : (
          <div className="flex gap-[12px] overflow-x-auto pb-[4px]">
            {cells.map((cell) => (
              <PeriodCard
                key={cell.lessonKey}
                cell={cell}
                selected={cell.lessonKey === selectedLessonKey}
                onSelect={() => onSelect(cell.lessonKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One curriculum period card — PERIOD n, objective, Focus · X, Select / Selected. */
function PeriodCard({
  cell,
  selected,
  onSelect,
}: {
  cell: PickerCell;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('board');
  const locale = useLocale();
  return (
    <div
      className={cn(
        'flex h-[210px] min-w-[168px] flex-1 flex-col rounded-[14px] border p-[16px] transition-colors',
        selected ? 'border-[1.5px] border-teal bg-teal-tint' : 'border-given-border bg-given',
      )}
    >
      <div
        className={cn(
          'text-[11px] font-bold uppercase tracking-[0.06em]',
          selected ? 'text-teal-deep' : 'text-status-progress',
        )}
      >
        {t('modal.periodCard.period', { n: formatNumber(cell.period, locale) })}
      </div>
      {/* Clamp the Daily LO to keep every card the same height; the full text
          stays available on hover via the native title tooltip. */}
      <p
        dir="auto"
        title={cell.dailyOutcome || undefined}
        className="mt-[10px] line-clamp-4 text-[14px] font-normal leading-[1.4] text-ink"
      >
        {cell.dailyOutcome || t('modal.periodCard.untitled')}
      </p>
      <div className="mt-[14px] flex flex-1 flex-col justify-end">
        {cell.focusArea ? (
          <p className="mb-[12px] text-[12.5px]">
            <span className="text-text-muted">{t('modal.periodCard.focus')}</span>
            <span dir="auto" className={cn('font-medium', selected ? 'text-teal-deep' : 'text-status-progress')}>
              {cell.focusArea}
            </span>
          </p>
        ) : (
          <div className="mb-[12px]" />
        )}
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'inline-flex items-center justify-center gap-[6px] rounded-[10px] py-[9px] text-[13px] font-semibold transition-colors',
            selected
              ? 'bg-teal text-white'
              : 'border border-teal/70 text-teal-deep hover:bg-teal-tint',
          )}
        >
          {selected ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {t('modal.periodCard.selected')}
            </>
          ) : (
            t('modal.periodCard.select')
          )}
        </button>
      </div>
    </div>
  );
}

/** A Week stepper chevron button. */
function StepBtn({
  dir,
  disabled,
  onClick,
}: {
  dir: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useTranslations('board');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? t('modal.lessonStep.previousWeek') : t('modal.lessonStep.nextWeek')}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-neutral-700 transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-30"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
        {dir === 'prev' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}
