'use client';

import { cn } from '@/lib/cn';

type View = 'calendar' | 'status';

/**
 * The Calendar ⇄ Status segmented toggle. Both views are two presentations of the
 * SAME already-loaded week, so switching is pure client state — instant, with no
 * server navigation or re-fetch. The parent keeps the URL in sync shallowly.
 */
export function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (next: View) => void;
}) {
  return (
    <div className="inline-flex rounded-[9px] border border-border bg-surface p-[3px] text-[13px] font-medium">
      <Segment value="calendar" current={view} label="Calendar" onChange={onChange} />
      <Segment value="status" current={view} label="Status" onChange={onChange} />
    </div>
  );
}

function Segment({
  value,
  current,
  label,
  onChange,
}: {
  value: View;
  current: View;
  label: string;
  onChange: (next: View) => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={active}
      className={cn(
        'cursor-pointer rounded-[7px] px-[14px] py-[6px] transition-colors',
        active ? 'bg-teal text-white' : 'text-neutral-700 hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
