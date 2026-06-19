'use client';

import type { TeachingPhase } from '@/types/lesson';
import { parsePhase, phaseLabel } from '@/lib/editor/phase';

/**
 * The step-header phase dropdown (I do / We do / You do), matching the design's
 * plain `select.lp` style. Writes the chosen phase to the step's block.
 */
export function PhaseSelect({
  value,
  onChange,
}: {
  value: TeachingPhase | null;
  onChange: (phase: TeachingPhase | null) => void;
}) {
  return (
    <select
      aria-label="Teaching phase"
      value={value ?? ''}
      onChange={(e) => onChange(parsePhase(e.target.value))}
      className="cursor-pointer rounded-badge border border-border-strong bg-surface px-[6px] py-1 font-sans text-[11px] font-semibold text-neutral-800 outline-none focus:border-teal"
    >
      <option value="">— phase —</option>
      <option value="i_do">{phaseLabel('i_do')}</option>
      <option value="we_do">{phaseLabel('we_do')}</option>
      <option value="you_do">{phaseLabel('you_do')}</option>
    </select>
  );
}
