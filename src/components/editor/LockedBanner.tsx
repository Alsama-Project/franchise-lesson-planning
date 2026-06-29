'use client';

import { useTranslations } from 'next-intl';
import type { PlanStatus } from '@/types/lesson';

/**
 * A light "view only" banner shown above the four content steps while the plan is
 * locked (`submitted` / `approved`). It tells the teacher why editing is disabled
 * and routes them to the Review step, where the Submit/Unlock control is the one
 * way to toggle the lock. For an `approved` plan there is no teacher unlock, so the
 * link is omitted and the copy reflects the approved state.
 */
export function LockedBanner({
  status,
  onGoToReview,
}: {
  status: PlanStatus;
  onGoToReview: () => void;
}) {
  const t = useTranslations('wizard.lockedBanner');
  const approved = status === 'approved';

  return (
    <div className="mb-[14px] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border border-status-submitted-border bg-status-submitted-bg px-4 py-[11px]">
      <div className="flex items-center gap-[9px] text-[13px] text-[#186155]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <span className="font-semibold">{approved ? t('approvedTitle') : t('title')}</span>
      </div>
      {approved ? null : (
        <button
          type="button"
          onClick={onGoToReview}
          className="text-[13px] font-semibold text-teal underline-offset-2 hover:underline"
        >
          {t('link')}
        </button>
      )}
    </div>
  );
}
