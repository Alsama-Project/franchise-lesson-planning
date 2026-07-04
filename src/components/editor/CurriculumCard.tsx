'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EditorCurriculumContext } from '@/lib/editor/load-plan';

/**
 * The collapsible cream curriculum card pinned at the top of the lesson-plan
 * pane: a locked (`given`/cream = curriculum) surface holding the stacked learning
 * outcomes (dominant Daily outcome + muted week/month context) and two nested
 * WHITE sub-cards — Grammar & vocabulary, Theme. Cream = locked, so nothing here
 * is editable; only the collapse/expand toggle is interactive. Renders nothing
 * when the lesson has no curriculum context.
 */
export function CurriculumCard({ curriculum }: { curriculum: EditorCurriculumContext | null }) {
  const t = useTranslations('wizard.curriculum');
  const [open, setOpen] = useState(true);

  if (!curriculum) return null;

  const hasContext = !!(curriculum.weekLO || curriculum.monthlyLO || curriculum.monthLO);

  return (
    <section className="overflow-hidden rounded-[14px] border border-given-border bg-given">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-[15px] py-[12px] text-start"
      >
        <span className="flex items-center gap-[8px] text-[11px] font-bold uppercase tracking-[0.06em] text-given-label">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          {t('sectionTitle')}
        </span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={(open ? 'rotate-180 ' : '') + 'text-given-label transition-transform'}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="px-[13px] pb-[14px] pt-[2px]">
          {/* Stacked learning outcomes — dominant Daily outcome, muted context. */}
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-given-label">
              {t('dailyOutcome')}
            </div>
            <div dir="auto" className="mt-[6px] text-[15px] font-semibold leading-[1.4] text-neutral-900">
              {curriculum.dailyLO || '—'}
            </div>
            {hasContext ? (
              <div className="mt-[11px] flex flex-col gap-[6px] border-t border-given-border pt-[10px] text-[12px] leading-[1.45] text-neutral-700">
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

          {/* Two nested WHITE sub-cards — Grammar & vocabulary, Theme. */}
          <div className="mt-[12px] grid grid-cols-1 gap-[10px] sm:grid-cols-2">
            <div className="rounded-[10px] border border-border bg-surface px-[12px] py-[10px]">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-given-label">
                {t('grammarVocab')}
              </div>
              <div dir="auto" className="mt-[5px] text-[12.5px] leading-[1.5] text-neutral-800">
                {curriculum.grammarVocab || '—'}
              </div>
            </div>
            <div className="rounded-[10px] border border-border bg-surface px-[12px] py-[10px]">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-given-label">
                {t('theme')}
              </div>
              <div dir="auto" className="mt-[5px] text-[12.5px] leading-[1.45] text-neutral-800">
                {curriculum.theme || '—'}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
