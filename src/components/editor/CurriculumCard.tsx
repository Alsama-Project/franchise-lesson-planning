'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EditorCurriculumContext } from '@/lib/editor/load-plan';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#A6917A"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={
        'flex-shrink-0 transition-transform ' +
        (open ? '' : '-rotate-90 rtl:rotate-90')
      }
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * The collapsible cream curriculum context (colour = curriculum/locked). Two
 * states, matching the comp:
 *   • COLLAPSED — a slim one-row bar: chevron + "Daily outcome & objectives" +
 *     the daily outcome truncated inline. Default on steps 2–5.
 *   • EXPANDED — "Daily outcome" → the outcome → divider → one flowing
 *     "This week · … · Monthly · …" line → a 2-up row of white Grammar &
 *     vocabulary / Theme sub-cards. Default on step 1 (writing the objective).
 * Nothing here is editable; only the toggle is. Renders nothing without context.
 */
export function CurriculumCard({
  curriculum,
  defaultExpanded = false,
}: {
  curriculum: EditorCurriculumContext | null;
  defaultExpanded?: boolean;
}) {
  const t = useTranslations('wizard.curriculum');
  const [open, setOpen] = useState(defaultExpanded);

  if (!curriculum) return null;

  const daily = curriculum.dailyLO || '—';
  const hasContext = !!(curriculum.weekLO || curriculum.monthlyLO);

  if (!open) {
    return (
      <section className="overflow-hidden rounded-[12px] border border-given-border bg-given">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="flex w-full items-center gap-[8px] px-[14px] py-[9px] text-start"
        >
          <Chevron open={false} />
          <span className="flex-shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#A6917A]">
            {t('dailyAndObjectives')}
          </span>
          <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-[#6E6052]">
            {daily}
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-given-border bg-given px-[14px] py-[12px]">
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded
        className="flex w-full items-center justify-between gap-3 text-start"
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#A6917A]">
          {t('dailyOutcome')}
        </span>
        <Chevron open />
      </button>

      <div dir="auto" className="mt-[5px] text-[15px] font-semibold leading-[1.4] text-[#3A332E]">
        {daily}
      </div>

      {hasContext ? (
        <>
          <div className="my-[10px] border-t border-[#EDE4D6]" />
          <div dir="auto" className="text-[11.5px] leading-[1.55] text-[#8A7B66]">
            {curriculum.weekLO ? (
              <>
                <span className="font-semibold text-[#6E6052]">{t('thisWeek')} · </span>
                {curriculum.weekLO}
              </>
            ) : null}
            {curriculum.weekLO && curriculum.monthlyLO ? (
              <span aria-hidden className="px-[8px] text-[#CBBBA4]">·</span>
            ) : null}
            {curriculum.monthlyLO ? (
              <>
                <span className="font-semibold text-[#6E6052]">{t('monthlyObjective')} · </span>
                {curriculum.monthlyLO}
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mt-[11px] grid grid-cols-1 gap-[9px] sm:grid-cols-2">
        <div className="rounded-[9px] border border-border bg-surface px-[11px] py-[9px]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A6917A]">
            {t('grammarVocab')}
          </div>
          <div dir="auto" className="mt-[4px] text-[13px] leading-[1.5] text-neutral-800">
            {curriculum.grammarVocab || '—'}
          </div>
        </div>
        <div className="rounded-[9px] border border-border bg-surface px-[11px] py-[9px]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A6917A]">
            {t('theme')}
          </div>
          <div dir="auto" className="mt-[4px] text-[13px] leading-[1.45] text-neutral-800">
            {curriculum.theme || '—'}
          </div>
        </div>
      </div>
    </section>
  );
}
