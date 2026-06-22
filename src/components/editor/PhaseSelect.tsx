'use client';

import type { TeachingPhase } from '@/types/lesson';
import { parsePhase, phaseLabel } from '@/lib/editor/phase';

// Phase = meaning: I do → teal, We do → amber, You do → pink. The dropdown
// itself takes the phase colour so the badge reads at a glance.
const PHASE_STYLE: Record<TeachingPhase, string> = {
  i_do: 'border-status-submitted-border bg-status-submitted-bg text-status-submitted',
  we_do: 'border-status-progress-border bg-status-progress-bg text-status-progress',
  you_do: 'border-status-review-border bg-status-review-bg text-pink',
};

const PHASE_NEUTRAL = 'border-border-strong bg-surface text-neutral-800';

/**
 * The step-header phase dropdown (I do / We do / You do). The control is tinted
 * by the selected phase (teal / amber / pink), matching the phase badges used
 * across the editor. Writes the chosen phase to the step's block.
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
      className={
        'cursor-pointer rounded-badge border px-[8px] py-1 font-sans text-[11px] font-semibold outline-none focus:border-teal ' +
        (value ? PHASE_STYLE[value] : PHASE_NEUTRAL)
      }
    >
      <option value="">— phase —</option>
      <option value="i_do">{phaseLabel('i_do')}</option>
      <option value="we_do">{phaseLabel('we_do')}</option>
      <option value="you_do">{phaseLabel('you_do')}</option>
    </select>
  );
}
