'use client';

import type { PlanStatus } from '@/types/lesson';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui/Spinner';

/**
 * The Step 5 primary action. It reflects what the viewer can DO next, never an
 * echo of the current status:
 *  - in_progress → "Submit for review" (pink; the teacher submits).
 *  - needs_review → "Resubmit" (pink; the teacher re-submits after changes).
 *  - submitted → a non-clickable "Submitted · awaiting review" badge. The
 *    coordinator review action (Approve / Request changes) is deferred to the
 *    review-view slice, so no Approve button is shown to anyone here yet.
 *  - approved → a display-only "Approved" badge (no action).
 */
export function SubmitControl({
  status,
  canSubmit,
  submitting,
  onSubmit,
}: {
  status: PlanStatus;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  if (status === 'approved') {
    return (
      <span className="inline-flex min-w-[92px] items-center justify-center gap-[7px] rounded-[9px] border border-status-approved-border bg-status-approved-bg px-4 py-[9px] text-[13px] font-semibold text-status-approved">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l4 4 10-11" />
        </svg>
        Approved
      </span>
    );
  }

  if (status === 'submitted') {
    return (
      <span className="inline-flex items-center justify-center gap-[7px] rounded-[9px] border border-border-strong bg-surface-subtle px-4 py-[9px] text-[13px] font-semibold text-neutral-600">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        Submitted · awaiting review
      </span>
    );
  }

  const label = status === 'needs_review' ? 'Resubmit' : 'Submit';

  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={submitting || !canSubmit}
      aria-busy={submitting || undefined}
      title={!canSubmit ? 'Add a SMARTT objective first' : undefined}
      className={cn(
        'inline-flex min-w-[92px] items-center justify-center gap-[7px] rounded-[9px] border-none bg-pink px-4 py-[9px] text-[13px] font-semibold text-white hover:bg-[#a3234f] disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {submitting ? <Spinner size={15} /> : null}
      {submitting ? 'Submitting…' : label}
    </button>
  );
}
