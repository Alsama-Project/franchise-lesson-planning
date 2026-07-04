'use client';

import { useTranslations } from 'next-intl';

/**
 * The compact pink objective banner shown on the plan pane past Step 1: the fixed
 * stem in muted ink, then the teacher's written objective. Text only — no pills
 * or controls — so the objective stays visible while working the later steps.
 */
export function ObjectiveBanner({ remainder }: { remainder: string }) {
  const t = useTranslations('wizard.banner');
  return (
    <div className="flex items-center gap-3 rounded-[11px] border border-[#F1D8E1] bg-[#FBF2F5] px-4 py-3">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-pink">
        {t('label')}
      </span>
      <span dir="auto" className="text-[13.5px] leading-[1.45] text-neutral-900">
        <span className="text-[#A88792]">{t('stem')}</span>{' '}
        {remainder.trim() || <span className="italic text-[#B89AA4]">{t('notWritten')}</span>}
      </span>
    </div>
  );
}
