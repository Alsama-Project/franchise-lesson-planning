'use client';

import type { EditorCurriculumContext } from '@/lib/editor/load-plan';

/**
 * "What the curriculum asks for today" — a Focus tag top-right and three tinted
 * cells (daily outcome · grammar & vocabulary · theme), sourced from the plan's
 * curriculum lesson. There is intentionally no Theme tag in the top-right.
 */
export function CurriculumBand({ curriculum }: { curriculum: EditorCurriculumContext | null }) {
  if (!curriculum) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-400">
          What the curriculum asks for today
        </span>
        {curriculum.focusArea ? (
          <span className="rounded-badge border border-[#CFE6E0] bg-[#E4F0ED] px-[9px] py-[3px] text-[11px] font-semibold text-[#186155]">
            Focus · {curriculum.focusArea}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-[14px] md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="rounded-[11px] border border-[#CFE6E0] bg-[#E4F0ED] px-[13px] py-[11px]">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#186155]">
            Today&apos;s daily outcome
          </div>
          <div className="mt-[5px] text-[13px] leading-[1.45] text-[#1d4a44]">
            {curriculum.dailyLO || '—'}
          </div>
        </div>
        <div className="rounded-[11px] border border-[#ECE4D7] bg-surface-subtle px-[13px] py-[11px]">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#B0651E]">
            Grammar &amp; vocabulary
          </div>
          <div className="mt-[5px] text-[12.5px] leading-[1.5] text-neutral-800">
            {curriculum.grammarVocab || '—'}
          </div>
        </div>
        <div className="rounded-[11px] border border-[#F1D8E1] bg-[#FBF2F5] px-[13px] py-[11px]">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-pink">Theme</div>
          <div className="mt-[5px] text-[12.5px] leading-[1.45] text-neutral-800">
            {curriculum.theme || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
