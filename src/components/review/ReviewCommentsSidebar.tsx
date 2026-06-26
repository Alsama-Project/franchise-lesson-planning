'use client';

// The coordinator review comments sidebar on /plan/[id]/view. A flat, chronological
// thread (oldest → newest) of coordinator→teacher feedback, plus the plan's review
// DECISIONS in the footer (folded in from the old standalone decision band, so there
// is a single home for decisions). Mounted only for a coordinator of the plan's
// space and only on a reviewable plan (`submitted` / `needs_review` / `approved`);
// the page renders nothing here on a draft.
//
// i18n: all chrome strings come from the `review.comments.*` catalog and the count
// renders through `formatNumber`. The comment bodies and the composer textarea are
// free-text content islands → `dir="auto"` so Arabic / English / mixed text lays
// out correctly, while the surrounding chrome follows the UI-locale direction.
//
// The plan body (`ReadOnlyPlan`) is untouched — this is its independent right
// sibling, mounted via the reserved `rightRail` slot.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { APP_TIME_ZONE, formatDate, formatNumber } from '@/lib/format';
import { initialsOf } from '@/components/weekly-overview/avatar';
import { addPlanComment } from '@/lib/actions/plan-comments';
import { decidePlan } from '@/lib/actions/lesson-plan';
import type { PlanComment } from '@/lib/review/comments';
import type { PlanStatus } from '@/types/lesson';

export function ReviewCommentsSidebar({
  planId,
  status,
  authorName,
  viewerName,
  initialComments,
}: {
  planId: string;
  status: PlanStatus;
  /** The plan author (teacher) — for the "Visible to {author}" return microcopy. */
  authorName: string;
  /** The signed-in coordinator's name — labels their own optimistic comments. */
  viewerName: string;
  initialComments: PlanComment[];
}) {
  const t = useTranslations('review');
  const locale = useLocale();
  const router = useRouter();

  const [comments, setComments] = useState<PlanComment[]>(initialComments);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [deciding, startDeciding] = useTransition();

  const tempIdRef = useRef(0);
  const hasComments = comments.length > 0;

  const onAdd = async () => {
    const body = draft.trim();
    if (!body || adding) return;
    setAddError(null);
    setAdding(true);

    // Optimistic insert, reconciled with the persisted row (canonical id + time).
    const tempId = `temp-${tempIdRef.current++}`;
    const optimistic: PlanComment = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      authorId: 'me',
      authorName: viewerName,
    };
    setComments((prev) => [...prev, optimistic]);
    setDraft('');

    const res = await addPlanComment(planId, body);
    if (res.ok && res.comment) {
      setComments((prev) => prev.map((c) => (c.id === tempId ? res.comment! : c)));
    } else {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setDraft(body);
      setAddError(t('comments.addError'));
    }
    setAdding(false);
  };

  const decide = (decision: 'approve' | 'return' | 'reopen') => {
    setDecideError(null);
    startDeciding(async () => {
      const res = await decidePlan(planId, decision);
      if (!res.ok) {
        setDecideError(t('comments.decideError'));
        return;
      }
      setModalOpen(false);
      router.refresh();
    });
  };

  return (
    <section
      aria-label={t('comments.title')}
      className="flex flex-col overflow-hidden rounded-[16px] border border-border bg-surface lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-[18px] py-[14px]">
        <h2 className="text-[15px] font-semibold text-ink">{t('comments.title')}</h2>
        <span className="inline-flex min-w-[22px] items-center justify-center rounded-badge bg-surface-subtle px-[8px] py-[2px] text-[12px] font-bold text-text-muted">
          {formatNumber(comments.length, locale)}
        </span>
      </div>

      {/* Thread */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[16px]">
        {hasComments ? (
          <ul className="flex flex-col gap-[14px]">
            {comments.map((c) => (
              <CommentCard key={c.id} comment={c} chipLabel={t('comments.coordinatorChip')} locale={locale} />
            ))}
          </ul>
        ) : (
          <div className="py-[18px] text-center">
            <p className="text-[13.5px] font-semibold text-ink">{t('comments.empty.title')}</p>
            <p className="mx-auto mt-[5px] max-w-[260px] text-[12.5px] leading-[1.5] text-text-muted">
              {t('comments.empty.body')}
            </p>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border px-[18px] py-[14px]">
        <textarea
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void onAdd();
            }
          }}
          rows={3}
          placeholder={t('comments.composer.placeholder')}
          className="w-full resize-none rounded-[10px] border border-border-strong bg-surface px-[12px] py-[10px] text-[13.5px] leading-[1.5] text-ink placeholder:text-text-faint focus:border-teal focus:outline-none"
        />
        <p className="mt-[7px] text-[11.5px] leading-[1.4] text-text-faint">{t('comments.composer.hint')}</p>
        {addError ? (
          <p className="mt-[7px] text-[12px] font-medium text-status-review">{addError}</p>
        ) : null}
        <div className="mt-[10px] flex justify-end">
          <button
            type="button"
            onClick={() => void onAdd()}
            disabled={!draft.trim() || adding}
            className="inline-flex items-center justify-center gap-[7px] rounded-[10px] bg-teal px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {adding ? t('comments.composer.submitting') : t('comments.composer.submit')}
          </button>
        </div>
      </div>

      {/* Footer decisions */}
      <DecisionFooter
        status={status}
        hasComments={hasComments}
        busy={deciding}
        error={decideError}
        onApprove={() => decide('approve')}
        onReopen={() => decide('reopen')}
        onOpenReturn={() => {
          setDecideError(null);
          setModalOpen(true);
        }}
      />

      {modalOpen ? (
        <ReturnModal
          comments={comments}
          authorName={authorName}
          busy={deciding}
          locale={locale}
          chipLabel={t('comments.coordinatorChip')}
          onCancel={() => setModalOpen(false)}
          onConfirm={() => decide('return')}
        />
      ) : null}
    </section>
  );
}

/** One comment: pink avatar, author name, "Coordinator" chip, timestamp, dir="auto" body. */
function CommentCard({
  comment,
  chipLabel,
  locale,
}: {
  comment: PlanComment;
  chipLabel: string;
  locale: string;
}) {
  const name = comment.authorName || chipLabel;
  return (
    <li className="flex gap-[10px]">
      <span
        aria-hidden
        className="mt-[1px] flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold"
        style={{ background: '#FBEFF3', color: '#B62A5C' }}
      >
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
          <span dir="auto" className="text-[13px] font-semibold text-ink">{name}</span>
          <span className="rounded-badge bg-[#FBEFF3] px-[7px] py-[1px] text-[10px] font-bold uppercase tracking-[0.04em] text-[#B62A5C]">
            {chipLabel}
          </span>
        </div>
        <div className="mt-[1px] text-[11px] text-text-faint">
          {formatDate(comment.createdAt, locale, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: APP_TIME_ZONE,
          })}
        </div>
        <p dir="auto" className="mt-[5px] whitespace-pre-wrap text-[13px] leading-[1.5] text-neutral-800">
          {comment.body}
        </p>
      </div>
    </li>
  );
}

/** Status-dependent decision footer. submitted → Return(gated)+Approve; approved →
 *  Undo; needs_review → Reopen. */
function DecisionFooter({
  status,
  hasComments,
  busy,
  error,
  onApprove,
  onReopen,
  onOpenReturn,
}: {
  status: PlanStatus;
  hasComments: boolean;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onReopen: () => void;
  onOpenReturn: () => void;
}) {
  const t = useTranslations('review');

  return (
    <div className="border-t border-border bg-surface-subtle px-[18px] py-[14px]">
      {status === 'submitted' ? (
        <div className="flex flex-col gap-[8px]">
          {!hasComments ? (
            <p className="text-[11.5px] leading-[1.4] text-text-muted">{t('comments.footer.returnHint')}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-[8px]">
            <button
              type="button"
              onClick={onOpenReturn}
              disabled={!hasComments || busy}
              className="inline-flex items-center justify-center rounded-[10px] border border-status-progress/60 px-[14px] py-[9px] text-[13px] font-semibold text-status-progress transition-colors hover:bg-status-progress-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('comments.footer.return')}
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-[10px] bg-teal px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('comments.footer.working') : t('comments.footer.approve')}
            </button>
          </div>
        </div>
      ) : null}

      {status === 'approved' ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-[10px] border border-border-strong bg-surface px-[14px] py-[9px] text-[13px] font-semibold text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('comments.footer.working') : t('comments.footer.undo')}
          </button>
        </div>
      ) : null}

      {status === 'needs_review' ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-[10px] border border-border-strong bg-surface px-[14px] py-[9px] text-[13px] font-semibold text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('comments.footer.working') : t('comments.footer.reopen')}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-[8px] text-end text-[12px] font-medium text-status-review">{error}</p> : null}
    </div>
  );
}

/** Two-step return confirm: lists the comments the teacher will see, then returns. */
function ReturnModal({
  comments,
  authorName,
  busy,
  locale,
  chipLabel,
  onCancel,
  onConfirm,
}: {
  comments: PlanComment[];
  authorName: string;
  busy: boolean;
  locale: string;
  chipLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('review');
  const confirmLabel = authorName
    ? t('comments.modal.confirm', { author: authorName })
    : t('comments.modal.confirmGeneric');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('comments.modal.ariaLabel')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onCancel();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[460px] flex-col overflow-hidden rounded-[18px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]">
        <div className="px-[24px] pt-[22px]">
          <h2 className="text-[19px] font-semibold text-ink">{t('comments.modal.title')}</h2>
          <p className="mt-[5px] text-[13px] text-text-muted">{t('comments.modal.subtitle')}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[18px]">
          <p className="mb-[10px] text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">
            {t('comments.modal.listHeading')}
          </p>
          <ul className="flex flex-col gap-[10px]">
            {comments.map((c) => (
              <li key={c.id} className="rounded-[10px] border border-border bg-surface-subtle px-[12px] py-[10px]">
                <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
                  <span dir="auto" className="text-[12.5px] font-semibold text-ink">
                    {c.authorName || chipLabel}
                  </span>
                  <span className="text-[10.5px] text-text-faint">
                    {formatDate(c.createdAt, locale, {
                      month: 'short',
                      day: 'numeric',
                      timeZone: APP_TIME_ZONE,
                    })}
                  </span>
                </div>
                <p dir="auto" className="mt-[4px] whitespace-pre-wrap text-[12.5px] leading-[1.5] text-neutral-800">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-[#F0EAE1] px-[24px] py-[16px]">
          {authorName ? (
            <p className="mb-[12px] text-[12px] text-text-muted">
              {t('comments.modal.visibleTo', { author: authorName })}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-[10px]">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-[13.5px] font-medium text-neutral-700 transition-colors hover:text-ink disabled:opacity-50"
            >
              {t('comments.modal.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-[11px] bg-status-progress px-[18px] py-[11px] text-[14px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('comments.footer.working') : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
