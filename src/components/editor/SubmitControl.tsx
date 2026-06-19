'use client';

import type { PlanStatus } from '@/types/lesson';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui/Spinner';

/**
 * The single submit control, its label/behaviour driven by the plan's status:
 *  - in_progress / needs_review → "Submit for approval" (pink; submits).
 *  - submitted → "Submitted · click to keep editing" (reverts to in_progress).
 *  - approved → a display-only "Approved" badge.
 */
export function SubmitControl({
  status,
  canSubmit,
  submitting,
  onSubmit,
  onUnsubmit,
}: {
  status: PlanStatus;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onUnsubmit: () => void;
}) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-[7px] rounded-[9px] border border-status-approved-border bg-status-approved-bg px-4 py-[9px] text-[13px] font-semibold text-status-approved">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l4 4 10-11" />
        </svg>
        Approved
      </span>
    );
  }

  if (status === 'submitted') {
    return (
      <button
        type="button"
        onClick={onUnsubmit}
        disabled={submitting}
        aria-busy={submitting || undefined}
        title="Revert to in progress and keep editing"
        className={cn(
          'inline-flex items-center gap-[7px] rounded-[9px] border border-teal bg-teal px-4 py-[9px] text-[13px] font-semibold text-white hover:bg-[#1a6a5d] disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {submitting ? (
          <Spinner size={15} />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l4 4 10-11" />
          </svg>
        )}
        {submitting ? 'Reverting…' : 'Submitted · click to keep editing'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={submitting || !canSubmit}
      aria-busy={submitting || undefined}
      title={!canSubmit ? 'Add a SMARTT objective first' : undefined}
      className={cn(
        'inline-flex items-center gap-[7px] rounded-[9px] border-none bg-pink px-4 py-[9px] text-[13px] font-semibold text-white hover:bg-[#a3234f] disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {submitting ? <Spinner size={15} /> : null}
      {submitting ? 'Submitting…' : 'Submit for approval'}
    </button>
  );
}
