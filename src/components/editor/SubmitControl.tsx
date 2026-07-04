'use client';

import { useTranslations } from 'next-intl';
import type { PlanStatus } from '@/types/lesson';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui/Spinner';

/**
 * The Step 5 primary action — the single way the teacher moves a plan in and out
 * of the locked review state. It reflects what the viewer can DO next, never a
 * passive echo of the current status. Colour semantic: teal = action (submit /
 * unlock); `approved` keeps its own green display-only badge.
 *
 *  - in_progress / needs_review → "Submit for approval" (teal; submits → locked).
 *  - submitted → "Unlock for editing" (teal; recalls → in_progress, unlocking the
 *    whole plan). This is the only exit from the locked state, so it stays
 *    interactive even while every other surface is locked.
 *  - approved → "Recall to edit" (approved-green; recalls → in_progress). A lesson
 *    plan is a per-teacher artefact, so its author may reopen it even once approved
 *    (deliberate change from the old "only a coordinator moves it off approved").
 *    The green styling keeps the approved state legible while offering the recall.
 */
export function SubmitControl({
  status,
  canSubmit,
  submitting,
  unlocking,
  onSubmit,
  onUnlock,
}: {
  status: PlanStatus;
  canSubmit: boolean;
  submitting: boolean;
  unlocking: boolean;
  onSubmit: () => void;
  onUnlock: () => void;
}) {
  const t = useTranslations('wizard.submit');

  if (status === 'approved') {
    return (
      <button
        type="button"
        onClick={onUnlock}
        disabled={unlocking}
        aria-busy={unlocking || undefined}
        className={cn(
          'inline-flex min-w-[92px] items-center justify-center gap-[7px] rounded-[9px] border border-status-approved-border bg-status-approved-bg px-4 py-[9px] text-[13px] font-semibold text-status-approved hover:bg-[#d6ebe0] disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {unlocking ? (
          <Spinner size={15} />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 7.5-2" />
          </svg>
        )}
        {unlocking ? t('recalling') : t('recall')}
      </button>
    );
  }

  if (status === 'submitted') {
    return (
      <button
        type="button"
        onClick={onUnlock}
        disabled={unlocking}
        aria-busy={unlocking || undefined}
        className={cn(
          'inline-flex min-w-[92px] items-center justify-center gap-[7px] rounded-[9px] border-none bg-teal px-4 py-[9px] text-[13px] font-semibold text-white hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {unlocking ? (
          <Spinner size={15} />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 7.5-2" />
          </svg>
        )}
        {unlocking ? t('unlocking') : t('unlock')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={submitting || !canSubmit}
      aria-busy={submitting || undefined}
      title={!canSubmit ? t('needObjective') : undefined}
      className={cn(
        // Solid teal (#1F7A6C) enabled — matches the Next button and the completed
        // pipeline nodes. Disabled reads as a muted teal, not a faded ghost, so the
        // control never looks washed-out.
        'inline-flex min-w-[92px] items-center justify-center gap-[7px] rounded-[9px] border-none bg-[#1F7A6C] px-4 py-[9px] text-[13px] font-semibold text-white hover:bg-[#186155] disabled:cursor-not-allowed disabled:bg-[#AFD0CA]',
      )}
    >
      {submitting ? <Spinner size={15} /> : null}
      {submitting ? t('submitting') : t('submitForApproval')}
    </button>
  );
}
