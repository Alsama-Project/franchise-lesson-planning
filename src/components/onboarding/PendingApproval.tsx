'use client';

import { useTranslations } from 'next-intl';
import { signOut } from '@/lib/actions/auth';

/**
 * Shown on `/onboarding` to a user who has filed a coordinator request that an
 * admin has not yet decided. Neutral card with a teal accent (positive/coordinator
 * chrome) — no form, no pink/cream. Includes a sign-out affordance so the user is
 * never trapped here. `subjectName` is the requested subject (null-safe).
 */
export function PendingApproval({ subjectName }: { subjectName: string | null }) {
  const t = useTranslations('onboarding');
  const subject = subjectName ?? t('subjects.coordinatorLabel');

  return (
    <div className="w-full max-w-[520px] rounded-[18px] border border-border bg-surface p-[32px] text-center shadow-[0_12px_32px_-20px_rgba(60,40,30,0.4)]">
      <div className="mb-[18px] inline-flex size-[46px] items-center justify-center rounded-[13px] bg-teal-tint">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#1F7A6C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </div>

      <span className="mb-[14px] inline-flex items-center gap-[6px] rounded-full bg-teal-tint px-[11px] py-[4px] text-[11px] font-semibold uppercase tracking-[0.04em] text-teal-deep">
        <span className="size-[6px] rounded-full bg-teal" />
        {t('pending.badge')}
      </span>

      <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{t('pending.title')}</h2>
      <p className="mx-auto mt-3 mb-[26px] max-w-[420px] text-[14px] leading-[1.6] text-text-muted" dir="auto">
        {t('pending.body', { subject })}
      </p>

      <form action={signOut}>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-[10px] border border-[#E0D6C7] bg-surface px-[18px] py-[10px] text-[13.5px] font-semibold text-neutral-900 transition-colors hover:bg-surface-subtle"
        >
          {t('pending.signOut')}
        </button>
      </form>
    </div>
  );
}
