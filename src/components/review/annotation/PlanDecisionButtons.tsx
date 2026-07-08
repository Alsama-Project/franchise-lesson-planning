'use client';

// The plan-level decision cluster — Return / Approve for the coordinator, Resubmit for
// the teacher — rendered in the PLAN HEADER beside the "N / N min" total (see the mock),
// NOT in a footer at the bottom of the card column. Behaviour is the EXISTING decidePlan
// / submit logic, placement only:
//   • Approve is DEMOTED (greyed, non-primary) with an amber "N open" pill whenever any
//     annotation is open; at 0 open it becomes the enabled filled-primary. This is the
//     same Approve-demotes-while-anything-open rule, now expressed as the button state.
//   • There is NO helper text — the "N open" pill replaces it.
//   • There is NO "Reopen as draft": Return only moves the plan to needs_review and
//     notifies the teacher; it does not end the conversation, and the coordinator keeps
//     their comment/suggest affordances on a returned plan (those live in the gutter ＋,
//     not here). A returned plan therefore shows no decision buttons — it is the
//     teacher's to resubmit.
//
// Reads the shared AnnotationProvider so `openCount` here is the SAME anchored-only open
// count the cards and the "N open · N resolved" line read.

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { decidePlan, submitLessonPlanById } from '@/lib/actions/lesson-plan';
import { useAnnotations } from './context';
import { A } from './tokens';

export function PlanDecisionButtons() {
  const t = useTranslations('review');
  const locale = useLocale();
  const router = useRouter();
  const { planId, status, scope, role, openCount } = useAnnotations();
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean }>) => {
    setError(false);
    startBusy(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(true);
    });
  };

  // Teacher: a returned class plan can be resubmitted. (On the editor's Review step the
  // header is dropped and SubmitControl owns this; this path is the teacher on /view.)
  if (role === 'teacher') {
    if (status !== 'needs_review' || scope !== 'class') return null;
    return (
      <Cluster error={error} errorLabel={t('annotations.footer.error')}>
        <button
          type="button"
          onClick={() => run(() => submitLessonPlanById(planId))}
          disabled={busy}
          className="inline-flex items-center gap-[6px] rounded-[10px] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: A.teal }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.resubmit')}
        </button>
      </Cluster>
    );
  }

  // Coordinator.
  if (status === 'submitted') {
    const hasOpen = openCount > 0;
    return (
      <Cluster error={error} errorLabel={t('annotations.footer.error')}>
        <button
          type="button"
          onClick={() => run(() => decidePlan(planId, 'return'))}
          disabled={busy}
          className="inline-flex items-center gap-[7px] rounded-[10px] border px-[16px] py-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: A.teal, borderColor: A.teal }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
          </svg>
          {t('annotations.footer.return')}
        </button>
        <button
          type="button"
          onClick={() => run(() => decidePlan(planId, 'approve'))}
          disabled={busy}
          className="inline-flex items-center gap-[8px] rounded-[10px] border px-[14px] py-[9px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={
            hasOpen
              ? { color: '#8A958F', background: '#F4F6F5', borderColor: '#DEE6E3' }
              : { color: '#fff', background: A.teal, borderColor: A.teal }
          }
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={hasOpen ? '#B4C0BB' : 'currentColor'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {busy ? t('annotations.footer.working') : t('annotations.footer.approve')}
          {hasOpen ? (
            <span
              className="rounded-full border px-[7px] py-px text-[10px] font-bold"
              style={{ color: A.amberFg, background: A.amberPillBg, borderColor: A.amberPillBorder }}
            >
              {t('annotations.header.open', { n: formatNumber(openCount, locale) })}
            </span>
          ) : null}
        </button>
      </Cluster>
    );
  }

  if (status === 'approved') {
    return (
      <Cluster error={error} errorLabel={t('annotations.footer.error')}>
        <button
          type="button"
          onClick={() => run(() => decidePlan(planId, 'undo'))}
          disabled={busy}
          className="inline-flex items-center rounded-[10px] border bg-white px-[14px] py-[9px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ color: A.teal, borderColor: A.tealBorder }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.undo')}
        </button>
      </Cluster>
    );
  }

  // needs_review (returned) or in_progress — the plan is the teacher's; no coordinator
  // decision buttons, but commenting stays available in the gutter.
  return null;
}

function Cluster({
  children,
  error,
  errorLabel,
}: {
  children: ReactNode;
  error: boolean;
  errorLabel: string;
}) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="h-[26px] w-px" style={{ background: '#ECE4D8' }} />
      <div className="flex items-center gap-[9px]">{children}</div>
      {error ? <span className="text-[12px] font-medium text-pink">{errorLabel}</span> : null}
    </div>
  );
}
