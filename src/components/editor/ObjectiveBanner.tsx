'use client';

import { OBJECTIVE_STEM } from '@/lib/editor/objective';

/**
 * The compact pink objective banner shown on every step past Step 1: the fixed
 * stem in muted ink, then the teacher's written objective. Text only — no pills
 * or controls.
 */
export function ObjectiveBanner({ remainder }: { remainder: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[11px] border border-[#F1D8E1] bg-[#FBF2F5] px-4 py-3">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-pink">
        Objective
      </span>
      <span className="text-[13.5px] leading-[1.45] text-neutral-900">
        <span className="text-[#A88792]">{OBJECTIVE_STEM}</span>{' '}
        {remainder.trim() || <span className="italic text-[#B89AA4]">not written yet</span>}
      </span>
    </div>
  );
}
