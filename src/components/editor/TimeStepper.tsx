'use client';

/**
 * A compact − value + minutes stepper, used in step headers and the Review
 * table to adjust a block's planned minutes. Matches the design's bordered,
 * cream-buttoned control.
 */
export function TimeStepper({
  value,
  onChange,
  label,
  min = 0,
  small = false,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Optional caption to the left, e.g. "min" or "CFU min". */
  label?: string;
  min?: number;
  /** Slightly tighter sizing for the Review table. */
  small?: boolean;
}) {
  const btn = small ? 'h-[26px] w-[22px] text-[13px]' : 'h-[27px] w-6 text-[14px]';
  const val = small ? 'px-[7px] text-[12.5px]' : 'px-[9px] text-[13px]';
  return (
    <div className="inline-flex items-center gap-[7px]">
      {label ? <span className="text-[11px] text-neutral-700">{label}</span> : null}
      <div className="inline-flex items-center overflow-hidden rounded-[8px] border border-border-strong bg-surface">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={label ? `Decrease ${label}` : 'Decrease minutes'}
          className={`${btn} border-none bg-surface-subtle text-neutral-600 hover:text-ink`}
        >
          −
        </button>
        <span className={`${val} font-semibold`}>{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={label ? `Increase ${label}` : 'Increase minutes'}
          className={`${btn} border-none bg-surface-subtle text-neutral-600 hover:text-ink`}
        >
          +
        </button>
      </div>
    </div>
  );
}
