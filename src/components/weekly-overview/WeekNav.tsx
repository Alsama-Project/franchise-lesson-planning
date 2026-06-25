import Link from 'next/link';
import { LinkPending } from '@/components/ui/LinkPending';
import type { BoardCoordinate } from '@/types/weekly-overview';

type View = 'calendar' | 'status';

function href(coord: BoardCoordinate, view: View): string {
  return `/?month=${encodeURIComponent(coord.month)}&week=${coord.week}&view=${view}`;
}

/**
 * Curriculum-week navigation: prev / next arrows step through the scheme of work
 * by (month, week) — NOT by calendar date. The label shows the 1-based teaching
 * "Week {n}" (e.g. "Week 36"), with "· current" appended only when today falls in
 * the shown week (proven by a `term_week` row; never shown while that table is
 * empty). The curriculum coordinate ("March · Week 2") rides along as the tooltip.
 * An arrow is disabled at the start/end of the synced curriculum. The selected
 * view is carried along so stepping weeks keeps it.
 */
export function WeekNav({
  weekNo,
  isCurrent,
  coordinateLabel,
  prev,
  next,
  view,
}: {
  weekNo: number;
  isCurrent: boolean;
  coordinateLabel: string;
  prev: BoardCoordinate | null;
  next: BoardCoordinate | null;
  view: View;
}) {
  return (
    <div className="flex items-center gap-[6px]">
      <NavButton href={prev ? href(prev, view) : null} label="Previous week" dir="left" />
      <span
        className="min-w-[150px] text-center text-[14px] font-semibold"
        title={coordinateLabel}
      >
        {weekNo > 0 ? `Week ${weekNo}` : '—'}
        {isCurrent ? (
          <span className="ml-[5px] font-normal text-neutral-500">· current</span>
        ) : null}
      </span>
      <NavButton href={next ? href(next, view) : null} label="Next week" dir="right" />
    </div>
  );
}

function NavButton({
  href,
  label,
  dir,
}: {
  href: string | null;
  label: string;
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
    >
      {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );

  if (!href) {
    return (
      <span
        aria-label={`${label} (unavailable)`}
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
