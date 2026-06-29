'use client';

// A combined month → week picker: prev / next arrows that step through a scheme of
// work by (month, week) — NOT by calendar date — flanking a centre label that opens
// a two-step menu (pick a month, then a week within it) jumping straight to any
// coordinate. Extracted from the weekly board's WeekNav so the Curriculum browser
// reuses the SAME control rather than maintaining a parallel month dropdown + week
// stepper.
//
// The component is domain-agnostic: every option carries its own destination
// `href`, and the trigger text (`label`) and any trailing muted `meta` are supplied
// by the caller, so the board ("Week 36 · Dec 15 · current", driving `?month=&week=
// &view=`) and the Curriculum browser ("Week 2", driving `?subject=&year=&month=
// &week=`) share one implementation.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { LinkPending } from '@/components/ui/LinkPending';

/** One week the picker can jump to, with its own destination and display label. */
export interface WeekPickerOption {
  /** Curriculum month this week belongs to — groups the menu's first step. */
  month: string;
  /** The week's value within the scheme of work; only used to key the option. */
  week: number;
  /** Display label for this option, e.g. "Week 36". */
  label: string;
  /** Where picking this option navigates. */
  href: string;
  /** Whether this is the currently-selected coordinate (teal-highlighted). */
  active: boolean;
}

export interface WeekPickerLabels {
  /** aria-label for the previous-week arrow. */
  previousWeek: string;
  /** aria-label for the next-week arrow. */
  nextWeek: string;
  /** aria-label for a disabled arrow at the start/end of the curriculum. */
  unavailable: (label: string) => string;
  /** Heading over the month column. */
  monthHeading: string;
  /** Heading over the week column. */
  weekHeading: string;
}

export function WeekPicker({
  label,
  meta,
  tooltip,
  defaultMonth,
  options,
  prevHref,
  nextHref,
  labels,
}: {
  /** Trigger's primary text, e.g. "Week 36". */
  label: string;
  /** Optional muted trailing content on the trigger, e.g. "· Dec 15" / "· current". */
  meta?: ReactNode;
  /** title attr on the trigger (the curriculum-coordinate tooltip). */
  tooltip?: string;
  /** Which month's weeks open first; defaults to the selected coordinate's month. */
  defaultMonth?: string | null;
  options: WeekPickerOption[];
  prevHref: string | null;
  nextHref: string | null;
  labels: WeekPickerLabels;
}) {
  return (
    <div className="flex items-center gap-[6px]">
      <NavButton href={prevHref} label={labels.previousWeek} unavailable={labels.unavailable} dir="left" />
      <PickerTrigger
        label={label}
        meta={meta}
        tooltip={tooltip}
        defaultMonth={defaultMonth}
        options={options}
        monthHeading={labels.monthHeading}
        weekHeading={labels.weekHeading}
      />
      <NavButton href={nextHref} label={labels.nextWeek} unavailable={labels.unavailable} dir="right" />
    </div>
  );
}

function PickerTrigger({
  label,
  meta,
  tooltip,
  defaultMonth,
  options,
  monthHeading,
  weekHeading,
}: {
  label: string;
  meta?: ReactNode;
  tooltip?: string;
  defaultMonth?: string | null;
  options: WeekPickerOption[];
  monthHeading: string;
  weekHeading: string;
}) {
  const [open, setOpen] = useState(false);
  // Which month's weeks are shown in step two; defaults to the current month.
  const [month, setMonth] = useState<string | null>(defaultMonth ?? null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Months in scheme-of-work order (options are already ordered), deduped.
  const months = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of options) {
      if (!seen.has(o.month)) {
        seen.add(o.month);
        out.push(o.month);
      }
    }
    return out;
  }, [options]);

  const activeMonth = month && months.includes(month) ? month : months[0] ?? null;
  const monthWeeks = useMemo(
    () => options.filter((o) => o.month === activeMonth),
    [options, activeMonth],
  );

  // "Week N" is the primary label and the ONLY in-flow element, so it sits on the
  // shared vertical centreline of the flanking ‹ › arrows. The date (and any
  // "current" marker) floats just ABOVE it, absolutely positioned so it does not
  // grow the line box and push "Week N" off that centreline ("Dec 15" hovering over
  // a centred "Week 1").
  const triggerLabel = (
    <span className="relative inline-flex items-center leading-none">
      {meta ? (
        <span className="absolute bottom-full left-1/2 mb-[2px] -translate-x-1/2 whitespace-nowrap text-[11px] font-normal leading-none text-neutral-500">
          {meta}
        </span>
      ) : null}
      <span>{label}</span>
    </span>
  );

  // No curriculum to pick from → keep the static label (no dropdown to open).
  if (options.length === 0) {
    return (
      <span className="min-w-[150px] text-center text-[14px] font-semibold" title={tooltip}>
        {triggerLabel}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setMonth(defaultMonth ?? null);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={tooltip}
        className="inline-flex min-w-[150px] items-center justify-center gap-[5px] rounded-[8px] px-[8px] py-[5px] text-[14px] font-semibold transition-colors hover:bg-surface-subtle"
      >
        {triggerLabel}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A79E94"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute start-1/2 z-30 mt-[4px] flex max-h-[300px] w-[300px] -translate-x-1/2 overflow-hidden rounded-[12px] border border-border bg-surface shadow-card rtl:translate-x-1/2">
          {/* Step one: months */}
          <div className="w-1/2 overflow-y-auto border-e border-border py-[4px]">
            <p className="px-[12px] pb-[4px] pt-[6px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-faint">
              {monthHeading}
            </p>
            {months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonth(m)}
                className={cn(
                  'flex w-full items-center justify-between px-[12px] py-[7px] text-start text-[12.5px] transition-colors hover:bg-surface-subtle',
                  m === activeMonth ? 'font-semibold text-teal-deep' : 'text-neutral-900',
                )}
              >
                <span dir="auto">{m}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="text-text-faint rtl:-scale-x-100"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>

          {/* Step two: weeks in the chosen month */}
          <div className="w-1/2 overflow-y-auto py-[4px]">
            <p className="px-[12px] pb-[4px] pt-[6px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-faint">
              {weekHeading}
            </p>
            {monthWeeks.map((o) => (
              <Link
                key={`${o.month}-${o.week}`}
                href={o.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'block px-[12px] py-[7px] text-start text-[12.5px] transition-colors hover:bg-surface-subtle',
                  o.active ? 'font-semibold text-teal-deep' : 'text-neutral-900',
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavButton({
  href,
  label,
  unavailable,
  dir,
}: {
  href: string | null;
  label: string;
  unavailable: (label: string) => string;
  dir: 'left' | 'right';
}) {
  const arrow = (
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
      className="rtl:-scale-x-100"
    >
      {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );

  if (!href) {
    return (
      <span
        aria-label={unavailable(label)}
        aria-disabled="true"
        className="inline-flex size-8 cursor-not-allowed items-center justify-center rounded-[8px] border border-border bg-surface text-text-faint opacity-40"
      >
        {arrow}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="relative inline-flex size-8 items-center justify-center rounded-[8px] border border-border bg-surface transition-colors hover:bg-surface-subtle"
    >
      <LinkPending size={15} className="absolute inset-0 items-center justify-center" />
      {arrow}
    </Link>
  );
}
