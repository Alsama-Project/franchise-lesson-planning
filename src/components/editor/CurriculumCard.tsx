'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EditorCurriculumContext } from '@/lib/editor/load-plan';
import { CurriculumBand } from '@/components/editor/CurriculumBand';

/**
 * The collapsible cream curriculum card that heads the lesson-plan pane: a locked
 * (`given`/cream = curriculum) surface whose body is the existing {@link
 * CurriculumBand} (stacked learning outcomes + Grammar & vocabulary + Theme, all
 * bound to the loaded curriculum data). Cream = locked, so nothing here is
 * editable — only the collapse/expand toggle is interactive. Renders nothing when
 * the lesson has no curriculum context.
 */
export function CurriculumCard({ curriculum }: { curriculum: EditorCurriculumContext | null }) {
  const t = useTranslations('wizard.curriculum');
  const [open, setOpen] = useState(true);

  if (!curriculum) return null;

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
          <CurriculumBand curriculum={curriculum} />
        </div>
      ) : null}
    </section>
  );
}
