'use client';

import type { TeachingPhase } from '@/types/lesson';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
import { TimeStepper } from '@/components/editor/TimeStepper';

/**
 * Steps 2 (Teach it) and 3 (Practise) — Part-2 placeholders. The header phase
 * dropdown and time stepper are wired (they write to the underlying block and
 * feed the running total / Review), but the two-pane writing area, resource
 * panel, and worksheet builder are deferred to Part 2.
 */
export function PlaceholderStep({
  title,
  subtitle,
  phase,
  onPhaseChange,
  minutes,
  onMinutesChange,
  body,
}: {
  title: string;
  subtitle: string;
  phase: TeachingPhase | null;
  onPhaseChange: (phase: TeachingPhase | null) => void;
  minutes: number;
  onMinutesChange: (next: number) => void;
  body: string;
}) {
  return (
    <div className="mt-[22px] overflow-hidden rounded-[16px] border border-border">
      <div className="flex flex-wrap items-start justify-between gap-[14px] border-b border-[#EFE8DD] px-6 py-[18px]">
        <div>
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="text-[20px] font-semibold">{title}</span>
            <PhaseSelect value={phase} onChange={onPhaseChange} />
          </div>
          <div className="mt-1 text-[13.5px] text-neutral-600">{subtitle}</div>
        </div>
        <TimeStepper value={minutes} onChange={onMinutesChange} label="min" />
      </div>
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span className="rounded-badge border border-[#E8D6B8] bg-[#F6ECDA] px-[10px] py-[3px] text-[11px] font-semibold text-[#B0651E]">
          Coming next
        </span>
        <p className="max-w-[460px] text-[13px] leading-[1.55] text-neutral-500">{body}</p>
      </div>
    </div>
  );
}
