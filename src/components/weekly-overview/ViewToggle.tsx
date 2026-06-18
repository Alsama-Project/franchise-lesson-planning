import Link from 'next/link';
import { cn } from '@/lib/cn';

type View = 'calendar' | 'status';

/**
 * The Calendar ⇄ Status segmented toggle. Each segment is a link that swaps the
 * `view` param while keeping the selected week, so the active view is part of
 * the URL and server-rendered.
 */
export function ViewToggle({ weekStart, view }: { weekStart: string; view: View }) {
  return (
    <div className="inline-flex rounded-sm border border-border-strong bg-cream p-[2px] text-[13px] font-medium">
      <Segment weekStart={weekStart} value="calendar" current={view} label="Calendar" />
      <Segment weekStart={weekStart} value="status" current={view} label="Status" />
    </div>
  );
}

function Segment({
  weekStart,
  value,
  current,
  label,
}: {
  weekStart: string;
  value: View;
  current: View;
  label: string;
}) {
  const active = value === current;
  return (
    <Link
      href={`/?week=${weekStart}&view=${value}`}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'rounded-[7px] px-[14px] py-[6px] transition-colors',
        active ? 'bg-teal text-white' : 'text-neutral-600 hover:text-ink',
      )}
    >
      {label}
    </Link>
  );
}
