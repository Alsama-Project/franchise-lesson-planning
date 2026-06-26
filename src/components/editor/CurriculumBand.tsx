'use client';

import { useTranslations } from 'next-intl';
import type { EditorCurriculumContext } from '@/lib/editor/load-plan';

/**
 * The read-only curriculum context for Step 1. Everything here is "given" — one
 * cream surface (colour = meaning). The Daily Outcome dominates (spans both
 * rows) and carries its week/month context; Grammar & Vocabulary and Theme
 * stack in the narrower right column.
 */
export function CurriculumBand({ curriculum }: { curriculum: EditorCurriculumContext | null }) {
  const t = useTranslations('wizard.curriculum');

  if (!curriculum) return null;

  const hasContext = !!(curriculum.weekLO || curriculum.monthlyLO || curriculum.monthLO);

  return (
    <div className="grid grid-cols-1 gap-[14px] md:grid-cols-[1.6fr_1fr] md:grid-rows-2">
      {/* Daily outcome — dominant, spans both rows */}
      <div className="rounded-[11px] border border-given-border bg-given px-[15px] py-[13px] md:row-span-2">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-given-label">
          {t('dailyOutcome')}
        </div>
        <div dir="auto" className="mt-[6px] text-[15px] font-semibold leading-[1.4] text-neutral-900">
          {curriculum.dailyLO || '—'}
        </div>
        {hasContext ? (
          <div className="mt-[12px] flex flex-col gap-[6px] border-t border-given-border pt-[11px] text-[12px] leading-[1.45] text-neutral-700">
            {curriculum.weekLO ? (
              <div dir="auto">
                <span className="font-semibold text-given-label">{t('thisWeek')} · </span>
                {curriculum.weekLO}
              </div>
            ) : null}
            {curriculum.monthlyLO ? (
              <div dir="auto">
                <span className="font-semibold text-given-label">{t('monthlyObjective')} · </span>
                {curriculum.monthlyLO}
              </div>
            ) : null}
            {curriculum.monthLO ? (
              <div dir="auto">
                <span className="font-semibold text-given-label">{t('thisMonth')} · </span>
                {curriculum.monthLO}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Grammar & vocabulary */}
      <div className="rounded-[11px] border border-given-border bg-given px-[13px] py-[11px]">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-given-label">
          {t('grammarVocab')}
        </div>
        <div dir="auto" className="mt-[5px] text-[12.5px] leading-[1.5] text-neutral-800">
          {curriculum.grammarVocab || '—'}
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-[11px] border border-given-border bg-given px-[13px] py-[11px]">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-given-label">
          {t('theme')}
        </div>
        <div dir="auto" className="mt-[5px] text-[12.5px] leading-[1.45] text-neutral-800">
          {curriculum.theme || '—'}
        </div>
      </div>
    </div>
  );
}
