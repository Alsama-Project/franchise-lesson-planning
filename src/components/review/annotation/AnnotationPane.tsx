'use client';

// The annotation pane on the plan review view — the strict port of the Coordinator
// Review · Annotation Layer design. It replaces the old flat comment sidebar. The
// pane lists ANCHORED annotations (comments + suggestions) under an Open/Resolved
// filter, a General feedback section for whole-plan comments, and a role-aware
// footer (coordinator: Return / Approve via decidePlan; teacher: Resubmit via the
// existing submit action). Read-side pills/badges live in ReadOnlyPlan; both sides
// share the AnnotationProvider so they cross-highlight.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { decidePlan, submitLessonPlanById } from '@/lib/actions/lesson-plan';
import { AnnotationCard } from './AnnotationCard';
import { useAnnotations } from './context';
import { A } from './tokens';

export function AnnotationPane() {
  const t = useTranslations('review');
  const locale = useLocale();
  const {
    planId,
    status,
    role,
    annotations,
    filter,
    setFilter,
    create,
    pending,
  } = useAnnotations();

  const general = annotations.filter((a) => a.anchorType === 'general');
  const anchored = annotations.filter((a) => a.anchorType !== 'general');

  // Open = unresolved comments + every suggestion (decided ones stay, marked).
  // Resolved = resolved comments. (Per the design's filing rule.)
  const openCards = anchored.filter((a) =>
    a.kind === 'suggestion' ? true : !a.resolved,
  );
  const resolvedCards = anchored.filter((a) => a.kind === 'comment' && a.resolved);
  const shown = filter === 'open' ? openCards : resolvedCards;

  const total = annotations.length;

  return (
    <section
      aria-label={t('annotations.title')}
      className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border shadow-[0_18px_50px_-28px_rgba(20,12,8,0.4)] lg:max-h-[calc(100vh-var(--app-chrome-height,64px)-32px)]"
      style={{ background: A.pane, borderColor: A.paneBorder }}
    >
      {/* Header — message icon + "Comments" + count pill. */}
      <div className="flex flex-shrink-0 items-center gap-[9px] border-b px-[18px] py-[14px]" style={{ borderColor: A.headBorder }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={A.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-[14.5px] font-semibold" style={{ color: A.title }}>
          {t('annotations.title')}
        </span>
        <span
          className="rounded-full border px-[8px] py-[2px] text-[11.5px] font-semibold"
          style={{ color: A.countFg, background: A.countBg, borderColor: A.countBorder }}
        >
          {total > 0
            ? t('annotations.count', { count: formatNumber(total, locale) })
            : t('annotations.countEmpty')}
        </span>
      </div>

      {/* Open / Resolved filter tabs — shown once any annotation exists. */}
      {total > 0 ? (
        <div className="flex flex-shrink-0 gap-[6px] border-b px-[14px] py-[9px]" style={{ borderColor: A.headBorder }}>
          {(['open', 'resolved'] as const).map((f) => {
            const count = f === 'open' ? openCards.length : resolvedCards.length;
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="rounded-[8px] border px-[11px] py-[5px] text-[12px] font-semibold transition-colors"
                style={
                  active
                    ? { background: A.tabActiveBg, color: A.tabActiveFg, borderColor: A.tabBorder }
                    : { background: 'transparent', color: A.tabIdleFg, borderColor: 'transparent' }
                }
              >
                {t(`annotations.filter.${f}`)} · {formatNumber(count, locale)}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Scrolling body — anchored cards + general feedback. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[14px] pb-[14px] pt-[13px]">
        {total === 0 ? (
          <div className="py-[26px] text-center">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={A.tabIdleFg} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-[10px]" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-[13.5px] font-semibold" style={{ color: A.emptyTitle }}>
              {t('annotations.empty.title')}
            </p>
            <p className="mx-auto mt-[5px] max-w-[260px] text-[12.5px] leading-[1.5]" style={{ color: A.emptyBody }}>
              {t('annotations.empty.body')}
            </p>
          </div>
        ) : shown.length > 0 ? (
          <ul className="flex flex-col gap-[9px]">
            {shown.map((a, i) => (
              <AnnotationCard key={a.id} annotation={a} index={i + 1} />
            ))}
          </ul>
        ) : (
          <p className="px-[4px] py-[16px] text-center text-[12.5px]" style={{ color: A.emptyBody }}>
            {t(`annotations.filterEmpty.${filter}`)}
          </p>
        )}

        {/* General feedback · whole plan — always available to a coordinator (so the
            FIRST whole-plan comment can be added), and shown to the teacher when any
            general feedback exists. */}
        {general.length > 0 || role === 'coordinator' ? (
          <div className="mt-[16px] border-t pt-[13px]" style={{ borderColor: A.headBorder }}>
            <p className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: A.tabIdleFg }}>
              {t('annotations.general.heading')}
            </p>
            {general.length > 0 ? (
              <ul className="flex flex-col gap-[9px]">
                {general.map((a, i) => (
                  <AnnotationCard key={a.id} annotation={a} index={i + 1} />
                ))}
              </ul>
            ) : null}
            {role === 'coordinator' ? <GeneralComposer onCreate={create} pending={pending} /> : null}
          </div>
        ) : null}
      </div>

      {/* Footer — role-aware. */}
      <Footer planId={planId} status={status} role={role} hasAnnotations={total > 0} />
    </section>
  );
}

/** The whole-plan feedback composer (coordinator only). */
function GeneralComposer({
  onCreate,
  pending,
}: {
  onCreate: ReturnType<typeof useAnnotations>['create'];
  pending: boolean;
}) {
  const t = useTranslations('review');
  const [draft, setDraft] = useState('');

  const submit = async () => {
    const note = draft.trim();
    if (!note || pending) return;
    const ok = await onCreate({ kind: 'comment', anchorType: 'general', note });
    if (ok) setDraft('');
  };

  return (
    <div className="mt-[10px]">
      <textarea
        dir="auto"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder={t('annotations.general.placeholder')}
        className="block w-full resize-none rounded-[10px] border bg-white px-[11px] py-[8px] text-[13px] leading-[1.5] text-ink outline-none focus:border-teal"
        style={{ borderColor: A.textareaBorder }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!draft.trim() || pending}
        className="mt-[7px] rounded-[9px] px-[13px] py-[7px] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: A.teal }}
      >
        {t('annotations.general.submit')}
      </button>
    </div>
  );
}

/** Role-aware footer: coordinator decides (decidePlan), teacher resubmits. */
function Footer({
  planId,
  status,
  role,
  hasAnnotations,
}: {
  planId: string;
  status: string;
  role: string;
  hasAnnotations: boolean;
}) {
  const t = useTranslations('review');
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean }>) => {
    setError(null);
    startBusy(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(t('annotations.footer.error'));
    });
  };

  // Teacher: hint + Resubmit, on a returned (needs_review) plan.
  if (role === 'teacher') {
    if (status !== 'needs_review') return null;
    return (
      <div className="flex-shrink-0 border-t bg-white px-[16px] py-[13px]" style={{ borderColor: A.paneBorder }}>
        <p className="mb-[9px] text-[11.5px] leading-[1.4]" style={{ color: A.hint }}>
          {t('annotations.footer.teacherHint')}
        </p>
        <button
          type="button"
          onClick={() => run(() => submitLessonPlanById(planId))}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-[6px] rounded-[10px] px-[12px] py-[10px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: A.teal }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.resubmit')}
        </button>
        {error ? <p className="mt-[8px] text-[12px] font-medium text-pink">{error}</p> : null}
      </div>
    );
  }

  // Coordinator: decide, status-aware.
  return (
    <div className="flex-shrink-0 border-t bg-white px-[16px] py-[13px]" style={{ borderColor: A.paneBorder }}>
      {status === 'submitted' ? (
        <>
          {!hasAnnotations ? (
            <p className="mb-[9px] text-[11px] leading-[1.4]" style={{ color: A.hint }}>
              {t('annotations.footer.returnHint')}
            </p>
          ) : null}
          <div className="flex gap-[9px]">
            <button
              type="button"
              onClick={() => run(() => decidePlan(planId, 'return'))}
              disabled={!hasAnnotations || busy}
              className="inline-flex flex-1 items-center justify-center gap-[6px] rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: A.amberFg, borderColor: A.amberBorder }}
            >
              {t('annotations.footer.return')}
            </button>
            <button
              type="button"
              onClick={() => run(() => decidePlan(planId, 'approve'))}
              disabled={busy}
              className="inline-flex items-center justify-center gap-[6px] rounded-[10px] px-[12px] py-[10px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ flex: '1.4', background: A.teal }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {busy ? t('annotations.footer.working') : t('annotations.footer.approve')}
            </button>
          </div>
        </>
      ) : status === 'approved' ? (
        <button
          type="button"
          onClick={() => run(() => decidePlan(planId, 'undo'))}
          disabled={busy}
          className="inline-flex w-full items-center justify-center rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ color: A.teal, borderColor: A.tealBorder }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.undo')}
        </button>
      ) : status === 'needs_review' ? (
        <button
          type="button"
          onClick={() => run(() => decidePlan(planId, 'reopen'))}
          disabled={busy}
          className="inline-flex w-full items-center justify-center rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ color: A.teal, borderColor: A.tealBorder }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.reopen')}
        </button>
      ) : null}
      {error ? <p className="mt-[8px] text-end text-[12px] font-medium text-pink">{error}</p> : null}
    </div>
  );
}
