'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * An inline, editable minutes value with a "min" suffix — used in the Review
 * table to adjust a block's planned minutes. Click/tap to edit, type to set, or
 * use the keyboard up/down arrows to step. The native number-spinner arrows are
 * stripped (see `.time-field` in globals.css) for a clean inline look; the field
 * carries a subtle teal focus state (teal = tools / actions).
 *
 * The read-only (non-creator) view renders minutes as plain static text and does
 * not use this control.
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
  const t = useTranslations('wizard.timeStepper');
  // While focused, hold the raw text so the field can be cleared and retyped
  // freely; commit valid numbers as they are typed and re-sync on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const num = small ? 'text-[12.5px]' : 'text-[13px]';
  const suffix = small ? 'text-[11px]' : 'text-[12px]';

  function handleChange(raw: string) {
    setDraft(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) onChange(Math.max(min, n));
  }

  return (
    <span className="inline-flex items-baseline gap-[3px]">
      {label ? <span className="self-center text-[11px] text-neutral-700">{label}</span> : null}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={shown}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setDraft(null)}
        aria-label={label ? t('ariaLabelledMinutes', { label }) : t('ariaMinutes')}
        className={`time-field w-[2.6em] cursor-text rounded-[6px] px-[3px] py-[2px] text-end font-semibold tabular-nums text-ink outline-none transition-colors hover:bg-surface-subtle focus:bg-teal-tint focus:ring-1 focus:ring-teal ${num}`}
      />
      <span className={`text-neutral-600 ${suffix}`}>{t('min')}</span>
    </span>
  );
}
