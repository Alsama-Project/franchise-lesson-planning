'use client';

// The Activity pane on the plan view — a strict visual port of the "Activity Pane"
// Claude Design export. It replaces the old "Coordinator comments" / "Coordinator
// feedback" panes and serves BOTH roles from one component:
//
//   • coordinator (mode="coordinator") — thread + a compose/decision footer wired
//     to the review state machine (Return → needs_review, Approve → approved, plus
//     the non-depicted approved/undo and needs_review/reopen affordances).
//   • teacher     (mode="teacher")     — read-only: thread only, no footer.
//
// One vertical rail interleaves COMMENTS (white cards: avatar + name + role badge +
// time + body; coordinator avatar teal, teacher avatar muted) with EVENTS (a small
// coloured dot + label + actor + time), oldest → newest, from real data
// (`plan_comments` + `plan_events`). The pane is the sticky sidebar's card: it caps
// its height to the viewport so the thread scrolls internally while the footer stays
// pinned (the sticky wrapper itself lives in ReadOnlyPlan / LessonPlanEditor).
//
// Colours are ported verbatim from the export; where one equals a design token
// (teal #1F7A6C, deep teal #186155) the token's value is reused. Direction-aware
// styling uses logical properties (ms-*/ps-*/inset-inline-*) so the rail, the inline
// send button and the actions mirror correctly under RTL — the pane never forces a
// `dir`, and free-text islands (comment bodies, the composer) use `dir="auto"`.

import { type CSSProperties, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { APP_TIME_ZONE, formatDate } from '@/lib/format';
import { initialsOf } from '@/components/weekly-overview/avatar';
import { addPlanComment } from '@/lib/actions/plan-comments';
import { decidePlan } from '@/lib/actions/lesson-plan';
import type { PlanComment } from '@/lib/review/comments';
import { mergeTimeline, type PlanEvent } from '@/lib/review/timeline';
import type { PlanStatus } from '@/types/lesson';
import { EVENT_STYLES, computeDisplayKinds } from '@/components/review/activity-events';

/** Ported colour values that have no design token (kept here so the JSX reads
 *  cleanly and the palette is auditable against the export in one place). */
const C = {
  pane: '#F3F7F5',
  paneBorder: '#DCE6E2',
  headBorder: '#E1EAE6',
  title: '#15433C',
  countFg: '#186155',
  countBg: '#E2EFEB',
  countBorder: '#CFE2DC',
  line: '#D3E0DB',
  avTeacher: '#6E8B84',
  cardBorder: '#E4EBE8',
  badgeCoordFg: '#186155',
  badgeCoordBg: '#E2EFEB',
  badgeTeacherFg: '#6B6157',
  badgeTeacherBg: '#EFEAE2',
  cardTime: '#A79E94',
  cardText: '#3A332E',
  eventBy: '#8A958F',
  eventTime: '#AAB5B0',
  textareaBorder: '#D7E3DF',
  returnBorder: '#BFDAD3',
  hint: '#8A958F',
  teal: '#1F7A6C',
  emptyTitle: '#15433C',
  emptyBody: '#756B64',
} as const;

export interface ActivityPaneProps {
  mode: 'coordinator' | 'teacher';
  comments: PlanComment[];
  /** Recorded lifecycle events, interleaved with comments. Empty pre-migration. */
  events: PlanEvent[];
  /** The plan author (teacher) id — a comment by this id reads as a teacher card,
   *  any other as a coordinator card. */
  teacherId: string;
  // ── coordinator-only ───────────────────────────────────────────────────────
  planId?: string;
  status?: PlanStatus;
  /** The plan author's name, for the return-confirm microcopy. */
  authorName?: string;
  /** The signed-in coordinator's name — labels their own optimistic comments. */
  viewerName?: string;
}

export function ActivityPane(props: ActivityPaneProps) {
  const { mode, events, teacherId } = props;
  const t = useTranslations('review');
  const locale = useLocale();
  const router = useRouter();

  const [comments, setComments] = useState<PlanComment[]>(props.comments);
  const timeline = useMemo(() => mergeTimeline(comments, events), [comments, events]);
  const displayKinds = useMemo(() => computeDisplayKinds(events), [events]);

  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [deciding, startDeciding] = useTransition();

  const tempIdRef = useRef(0);
  const hasComments = comments.length > 0;
  const isCoordinator = mode === 'coordinator';
  // The export depicts the reviewable footer; a draft (in_progress) shows the
  // thread only (a returned-to-draft plan keeps its comments but loses the footer).
  const showFooter = isCoordinator && props.status !== undefined && props.status !== 'in_progress';

  const onAdd = async () => {
    const body = draft.trim();
    if (!body || adding || !props.planId) return;
    setAddError(null);
    setAdding(true);

    // Optimistic insert, reconciled with the persisted row (canonical id + time).
    const tempId = `temp-${tempIdRef.current++}`;
    const optimistic: PlanComment = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      authorId: 'me',
      authorName: props.viewerName ?? '',
    };
    setComments((prev) => [...prev, optimistic]);
    setDraft('');

    const res = await addPlanComment(props.planId, body);
    if (res.ok && res.comment) {
      setComments((prev) => prev.map((c) => (c.id === tempId ? res.comment! : c)));
    } else {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setDraft(body);
      setAddError(t('comments.addError'));
    }
    setAdding(false);
  };

  const decide = (decision: 'approve' | 'return' | 'reopen' | 'undo') => {
    if (!props.planId) return;
    setDecideError(null);
    startDeciding(async () => {
      const res = await decidePlan(props.planId!, decision);
      if (!res.ok) {
        setDecideError(t('comments.decideError'));
        return;
      }
      setModalOpen(false);
      router.refresh();
    });
  };

  const n = timeline.length;

  return (
    <section
      aria-label={t('activity.title')}
      className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border shadow-[0_18px_50px_-28px_rgba(20,12,8,0.4)] lg:max-h-[calc(100vh-var(--app-chrome-height,64px)-32px)]"
      style={{ background: C.pane, borderColor: C.paneBorder }}
    >
      {/* Header — clock icon + "Activity" + a count of COMMENTS (not events). */}
      <div
        className="flex flex-shrink-0 items-center gap-[9px] border-b px-[18px] py-[14px]"
        style={{ borderColor: C.headBorder }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span className="text-[14.5px] font-semibold" style={{ color: C.title }}>
          {t('activity.title')}
        </span>
        <span
          className="rounded-full border px-[8px] py-[2px] text-[11.5px] font-semibold"
          style={{ color: C.countFg, background: C.countBg, borderColor: C.countBorder }}
        >
          {t('activity.count', { count: comments.length })}
        </span>
      </div>

      {/* Thread — one rail, oldest → newest, comments + events interleaved. */}
      <div className="activity-thread min-h-0 flex-1 overflow-y-auto px-[16px] pb-[14px] pt-[16px]">
        {n > 0 ? (
          <ul className="flex flex-col">
            {timeline.map((item, i) => {
              const line = railLineStyle(i === 0, i === n - 1);
              if (item.kind === 'comment') {
                const isTeacher = item.comment.authorId === teacherId;
                return (
                  <CommentRow
                    key={item.id}
                    comment={item.comment}
                    isTeacher={isTeacher}
                    roleLabel={t(isTeacher ? 'activity.role.teacher' : 'activity.role.coordinator')}
                    line={line}
                    locale={locale}
                  />
                );
              }
              const kind = displayKinds.get(item.event.id) ?? item.event.type;
              return (
                <EventRow
                  key={item.id}
                  event={item.event}
                  label={t(`activity.event.${kind}`)}
                  style={EVENT_STYLES[kind]}
                  line={line}
                  locale={locale}
                />
              );
            })}
          </ul>
        ) : (
          <div className="py-[18px] text-center">
            <p className="text-[13.5px] font-semibold" style={{ color: C.emptyTitle }}>
              {t('comments.empty.title')}
            </p>
            <p className="mx-auto mt-[5px] max-w-[260px] text-[12.5px] leading-[1.5]" style={{ color: C.emptyBody }}>
              {t('comments.empty.body')}
            </p>
          </div>
        )}
      </div>

      {/* Footer — coordinator only, on a reviewable plan. */}
      {showFooter ? (
        <Footer
          status={props.status!}
          hasComments={hasComments}
          draft={draft}
          adding={adding}
          deciding={deciding}
          addError={addError}
          decideError={decideError}
          onDraftChange={setDraft}
          onAdd={() => void onAdd()}
          onApprove={() => decide('approve')}
          onUndo={() => decide('undo')}
          onReopen={() => decide('reopen')}
          onOpenReturn={() => {
            setDecideError(null);
            setModalOpen(true);
          }}
        />
      ) : null}

      {modalOpen ? (
        <ReturnModal
          comments={comments}
          authorName={props.authorName ?? ''}
          busy={deciding}
          locale={locale}
          chipLabel={t('activity.role.coordinator')}
          onCancel={() => setModalOpen(false)}
          onConfirm={() => decide('return')}
        />
      ) : null}
    </section>
  );
}

/** The connecting rail line's geometry for one row — a continuous 2px line through
 *  the avatars/dots, cropped to the avatar centre at the first and last rows
 *  (ported from the export's per-row top/bottom/height rule). `inset-inline-start`
 *  keeps it on the rail's leading edge in both LTR and RTL. */
function railLineStyle(isFirst: boolean, isLast: boolean): CSSProperties {
  return {
    position: 'absolute',
    insetInlineStart: '14px',
    width: '2px',
    background: C.line,
    top: isFirst ? '16px' : 0,
    ...(isLast ? { height: '16px' } : { bottom: 0 }),
  };
}

/** One comment — avatar (teal coordinator / muted teacher) + white card. */
function CommentRow({
  comment,
  isTeacher,
  roleLabel,
  line,
  locale,
}: {
  comment: PlanComment;
  isTeacher: boolean;
  roleLabel: string;
  line: CSSProperties;
  locale: string;
}) {
  const name = comment.authorName || roleLabel;
  return (
    <li className="flex gap-[12px]">
      <div className="relative flex w-[30px] flex-shrink-0 justify-center">
        <span aria-hidden style={line} />
        <span
          aria-hidden
          className="relative z-[1] mt-[1px] inline-flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: isTeacher ? C.avTeacher : C.teal, boxShadow: `0 0 0 3px ${C.pane}` }}
        >
          {initialsOf(name)}
        </span>
      </div>
      <div className="min-w-0 flex-1 pb-[16px]">
        <div className="rounded-[13px] border bg-white px-[13px] py-[11px]" style={{ borderColor: C.cardBorder }}>
          <div className="flex flex-wrap items-baseline gap-[7px]">
            <span dir="auto" className="text-[13px] font-semibold text-ink">
              {name}
            </span>
            <span
              className="rounded-[5px] px-[6px] py-[1px] text-[10px] font-semibold uppercase tracking-[0.04em]"
              style={
                isTeacher
                  ? { color: C.badgeTeacherFg, background: C.badgeTeacherBg }
                  : { color: C.badgeCoordFg, background: C.badgeCoordBg }
              }
            >
              {roleLabel}
            </span>
            <span className="ms-auto text-[11.5px]" style={{ color: C.cardTime }}>
              {formatDate(comment.createdAt, locale, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: APP_TIME_ZONE,
              })}
            </span>
          </div>
          <p dir="auto" className="mt-[7px] whitespace-pre-wrap text-[13.5px] leading-[1.55]" style={{ color: C.cardText }}>
            {comment.body}
          </p>
        </div>
      </div>
    </li>
  );
}

/** One lifecycle event — a small coloured dot + label + actor + time (no card). */
function EventRow({
  event,
  label,
  style,
  line,
  locale,
}: {
  event: PlanEvent;
  label: string;
  style: { dotBg: string; color: string; paths: string[] };
  line: CSSProperties;
  locale: string;
}) {
  return (
    <li className="flex gap-[12px]">
      <div className="relative flex w-[30px] flex-shrink-0 justify-center">
        <span aria-hidden style={line} />
        <span
          aria-hidden
          className="relative z-[1] mt-[2px] inline-flex h-[26px] w-[26px] items-center justify-center rounded-full"
          style={{ background: style.dotBg, boxShadow: `0 0 0 3px ${C.pane}` }}
        >
          <EventIcon paths={style.paths} stroke={style.color} />
        </span>
      </div>
      <div className="flex min-h-[30px] min-w-0 flex-1 flex-wrap items-center gap-[7px] pb-[16px]">
        <span className="text-[12.5px] font-semibold" style={{ color: style.color }}>
          {label}
        </span>
        {event.actorName ? (
          <span dir="auto" className="text-[12px]" style={{ color: C.eventBy }}>
            {event.actorName}
          </span>
        ) : null}
        <span className="ms-auto text-[11.5px]" style={{ color: C.eventTime }}>
          {formatDate(event.createdAt, locale, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: APP_TIME_ZONE,
          })}
        </span>
      </div>
    </li>
  );
}

function EventIcon({ paths, stroke }: { paths: string[]; stroke: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** The coordinator footer — compose (grows on focus, inline send, focus-revealed
 *  hint) + a status-appropriate actions row, all in the export's button styling. */
function Footer({
  status,
  hasComments,
  draft,
  adding,
  deciding,
  addError,
  decideError,
  onDraftChange,
  onAdd,
  onApprove,
  onUndo,
  onReopen,
  onOpenReturn,
}: {
  status: PlanStatus;
  hasComments: boolean;
  draft: string;
  adding: boolean;
  deciding: boolean;
  addError: string | null;
  decideError: string | null;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  onApprove: () => void;
  onUndo: () => void;
  onReopen: () => void;
  onOpenReturn: () => void;
}) {
  const t = useTranslations('review');

  return (
    <div className="flex-shrink-0 border-t bg-white px-[16px] pb-[13px] pt-[12px]" style={{ borderColor: C.paneBorder }}>
      <div className="peer relative">
        <textarea
          dir="auto"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          rows={1}
          placeholder={t('activity.composer.placeholder')}
          className="block min-h-[40px] w-full resize-none rounded-[11px] border bg-white py-[9px] pe-[42px] ps-[13px] text-[13.5px] leading-[1.5] text-ink outline-none transition-all placeholder:text-[#A9B6B1] focus:min-h-[78px] focus:border-teal focus:shadow-[0_0_0_3px_rgba(31,122,108,0.12)]"
          style={{ borderColor: C.textareaBorder }}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!draft.trim() || adding}
          aria-label={t('activity.composer.send')}
          className="absolute bottom-[7px] inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: C.teal, insetInlineEnd: '7px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>

      {/* Hidden at rest; revealed when the composer is focused (export behaviour). */}
      <p
        className="mx-[2px] max-h-0 overflow-hidden text-[11px] leading-[1.4] opacity-0 transition-all peer-focus-within:mt-[7px] peer-focus-within:max-h-[40px] peer-focus-within:opacity-100"
        style={{ color: C.hint }}
      >
        {t('activity.hint')}
      </p>

      {addError ? <p className="mt-[7px] text-[12px] font-medium text-pink">{addError}</p> : null}

      {/* r6 control-gating: Return needs at least one comment first. */}
      {status === 'submitted' && !hasComments ? (
        <p className="mt-[7px] text-[11px] leading-[1.4]" style={{ color: C.hint }}>
          {t('activity.actions.returnHint')}
        </p>
      ) : null}

      <div className="mt-[11px] flex gap-[9px]">
        {status === 'submitted' ? (
          <>
            <button
              type="button"
              onClick={onOpenReturn}
              disabled={!hasComments || deciding}
              className="inline-flex items-center justify-center gap-[6px] rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ flex: '1', color: C.teal, borderColor: C.returnBorder }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
              </svg>
              {t('activity.actions.return')}
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={deciding}
              className="inline-flex items-center justify-center gap-[6px] rounded-[10px] border px-[12px] py-[10px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ flex: '1.5', background: C.teal, borderColor: C.teal }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {deciding ? t('activity.actions.working') : t('activity.actions.approve')}
            </button>
          </>
        ) : null}

        {/* Already approved — the export depicts no live Approve; offer Undo instead. */}
        {status === 'approved' ? (
          <button
            type="button"
            onClick={onUndo}
            disabled={deciding}
            className="inline-flex w-full items-center justify-center gap-[6px] rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: C.teal, borderColor: C.returnBorder }}
          >
            {deciding ? t('activity.actions.working') : t('activity.actions.undo')}
          </button>
        ) : null}

        {/* Already returned — reopen as a clean draft for the teacher. */}
        {status === 'needs_review' ? (
          <button
            type="button"
            onClick={onReopen}
            disabled={deciding}
            className="inline-flex w-full items-center justify-center gap-[6px] rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: C.teal, borderColor: C.returnBorder }}
          >
            {deciding ? t('activity.actions.working') : t('activity.actions.reopen')}
          </button>
        ) : null}
      </div>

      {decideError ? <p className="mt-[8px] text-end text-[12px] font-medium text-pink">{decideError}</p> : null}
    </div>
  );
}

/** Two-step return confirm: lists the comments the teacher will see, then returns.
 *  Carried over from the prior review sidebar so the return flow does not regress. */
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
              className="inline-flex items-center justify-center rounded-[11px] bg-status-progress px-[18px] py-[11px] text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('comments.footer.working') : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
