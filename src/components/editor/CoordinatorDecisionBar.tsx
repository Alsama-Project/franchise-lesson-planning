'use client';

// The coordinator decision bar on /plan/[id]/view. Shown only when the signed-in
// user is a coordinator of the plan's (centre, subject) space (gated server-side
// in the page). The plan body stays read-only — coordinators decide, they do not
// edit content. Actions depend on the plan's current status:
//
//   • submitted    → Approve / Return for changes
//   • approved     → Undo approval (reopen as draft)
//   • needs_review → Reopen as draft
//   • in_progress  → no action (neutral note)
//
// Each button calls the `decidePlan` server action (RLS + the approval trigger are
// the real boundary) and refreshes the route so the persisted status survives a
// reload and the bar re-renders into its next state.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { decidePlan } from '@/lib/actions/lesson-plan';
import type { PlanStatus } from '@/types/lesson';

type Decision = 'approve' | 'return' | 'reopen';

export function CoordinatorDecisionBar({
  planId,
  status,
}: {
  planId: string;
  status: PlanStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Which decision is in flight, so only the clicked button shows the spinner.
  const [active, setActive] = useState<Decision | null>(null);

  const run = (decision: Decision) => {
    setError(null);
    setActive(decision);
    startTransition(async () => {
      const res = await decidePlan(planId, decision);
      if (!res.ok) {
        setError(res.error ?? 'Could not update this plan.');
        setActive(null);
        return;
      }
      // The action revalidated the route; refresh so the new status (and this bar)
      // re-render from server truth.
      router.refresh();
      setActive(null);
    });
  };

  return (
    <div className="border-b border-[#EFE8DD] bg-surface-subtle px-[22px] py-[14px] lg:px-[30px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-[0.05em] text-text-faint">
            Coordinator review
          </p>
          <p className="mt-[3px] text-[13.5px] text-text-muted">{describe(status)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-[10px]">
          {status === 'submitted' ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                pending={pending && active === 'return'}
                disabled={pending}
                onClick={() => run('return')}
              >
                Return for changes
              </Button>
              <Button
                size="sm"
                variant="primary"
                pending={pending && active === 'approve'}
                disabled={pending}
                onClick={() => run('approve')}
              >
                Approve
              </Button>
            </>
          ) : null}

          {status === 'approved' ? (
            <Button
              size="sm"
              variant="secondary"
              pending={pending && active === 'reopen'}
              disabled={pending}
              onClick={() => run('reopen')}
            >
              Undo approval (reopen as draft)
            </Button>
          ) : null}

          {status === 'needs_review' ? (
            <Button
              size="sm"
              variant="secondary"
              pending={pending && active === 'reopen'}
              disabled={pending}
              onClick={() => run('reopen')}
            >
              Reopen as draft
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-[10px] text-[12.5px] font-medium text-status-review">{error}</p>
      ) : null}
    </div>
  );
}

/** The neutral one-line status description shown beside the actions. */
function describe(status: PlanStatus): string {
  switch (status) {
    case 'submitted':
      return 'This plan is awaiting your review.';
    case 'approved':
      return 'You approved this plan. Undo to send it back to the teacher as a draft.';
    case 'needs_review':
      return 'Returned for changes. The teacher will resubmit, or you can reopen it as a draft.';
    case 'in_progress':
    default:
      return 'This plan is still a draft — nothing to review yet.';
  }
}
