import Link from 'next/link';
import { addDays } from '@/lib/week';

type View = 'calendar' | 'status';

function href(weekStart: string, view: View): string {
  return `/?week=${weekStart}&view=${view}`;
}

/**
 * Previous / next week controls around the current week's label, plus a "This
 * week" shortcut. Pure links so navigation is server-rendered and shareable; the
 * selected view is carried along so toggling weeks keeps the chosen view.
 */
export function WeekNav({
  weekStart,
  weekLabel,
  thisMonday,
  view,
}: {
  weekStart: string;
  weekLabel: string;
  thisMonday: string;
  view: View;
}) {
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const isThisWeek = weekStart === thisMonday;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-[6px]">
        <NavButton href={href(prev, view)} label="Previous week" dir="left" />
        <span className="min-w-[168px] text-center text-[14px] font-semibold">
          {weekLabel}
        </span>
        <NavButton href={href(next, view)} label="Next week" dir="right" />
      </div>
      {!isThisWeek ? (
        <Link
          href={href(thisMonday, view)}
          className="rounded-sm border border-border-strong bg-surface px-[11px] py-[6px] text-[13px] font-medium text-neutral-900 transition-colors hover:bg-surface-subtle"
        >
          This week
        </Link>
      ) : null}
    </div>
  );
}

function NavButton({
  href,
  label,
  dir,
}: {
  href: string;
  label: string;
  dir: 'left' | 'right';
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-sm border border-border-strong bg-surface transition-colors hover:bg-surface-subtle"
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
        {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </Link>
  );
}
