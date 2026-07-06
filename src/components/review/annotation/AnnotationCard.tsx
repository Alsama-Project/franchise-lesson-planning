'use client';

// One annotation card in the pane — a comment or a suggestion. Collapsed it shows a
// badge number, its kind tag, the anchor label, a decided chip and a chevron;
// expanded it adds the from→to strip (suggestions), the author block, threaded
// replies, a reply composer, and a role-aware action row. Strict-ported tokens from
// the Coordinator Review · Annotation Layer design (see ./tokens).

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { APP_TIME_ZONE, formatDate, formatNumber } from '@/lib/format';
import { initialsOf } from '@/components/weekly-overview/avatar';
import type { Annotation, AnnotationRole } from '@/types/annotation';
import { textDiffSegments } from '@/lib/review/textDiff';
import { useAnnotations } from './context';
import { A } from './tokens';

const PHASE_TEXT: Record<string, string> = { i_do: 'I do', we_do: 'We do', you_do: 'You do' };

/** The human label a suggestion's from/to value shows (grouping tags map to words;
 *  durations render as "{n} min"). */
function valueLabel(shape: Annotation['suggestionShape'], value: string | null): string {
  if (value == null) return '';
  if (shape === 'enum') return PHASE_TEXT[value] ?? value;
  if (shape === 'dur') return `${value} min`;
  return value;
}

function Avatar({ role, name }: { role: AnnotationRole; name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ background: role === 'teacher' ? A.avTeacher : A.avCoord }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AnnotationCard({
  annotation,
  index,
}: {
  annotation: Annotation;
  index: number;
}) {
  const t = useTranslations('review');
  const locale = useLocale();
  const { role, editable, activeId, setActiveId, pending, reply, resolve, decide, phaseTitles } =
    useAnnotations();

  const expanded = activeId === annotation.id;
  const [replying, setReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const ref = useRef<HTMLLIElement>(null);

  // When focused from a read-side badge/pill, bring the card into view.
  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [expanded]);

  const isSuggestion = annotation.kind === 'suggestion';
  const decided = annotation.status !== 'pending';
  const roleLabel = (r: AnnotationRole) => t(`activity.role.${r}`);

  const anchorLabel = (() => {
    switch (annotation.anchorType) {
      case 'objective':
        return t('annotations.anchor.objective');
      case 'general':
        return t('annotations.anchor.general');
      case 'worksheet_block':
        return t('annotations.anchor.worksheet');
      default:
        return (annotation.phaseRef && phaseTitles[annotation.phaseRef]) || t('annotations.anchor.phase');
    }
  })();

  const time = (iso: string) =>
    formatDate(iso, locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: APP_TIME_ZONE,
    });

  const onReply = async () => {
    const body = replyDraft.trim();
    if (!body || pending) return;
    const ok = await reply(annotation.id, body);
    if (ok) {
      setReplyDraft('');
      setReplying(false);
    }
  };

  return (
    <li
      ref={ref}
      id={`annotation-${annotation.id}`}
      className="rounded-[12px] border bg-white transition-shadow"
      style={{
        borderColor: expanded ? A.tealBorder : A.cardBorder,
        boxShadow: expanded ? `0 0 0 3px ${A.suggestionBg}` : undefined,
      }}
    >
      {/* Collapsed header — click to expand/collapse. */}
      <button
        type="button"
        onClick={() => setActiveId(expanded ? null : annotation.id)}
        className="flex w-full items-center gap-[8px] px-[12px] py-[10px] text-start"
      >
        <span
          className="inline-flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold"
          style={{ background: A.countBg, color: A.countFg }}
        >
          {formatNumber(index, locale)}
        </span>
        <span
          className="rounded-[5px] px-[6px] py-[1px] text-[10px] font-bold uppercase tracking-[0.04em]"
          style={
            isSuggestion
              ? { color: A.suggestionFg, background: A.suggestionBg }
              : { color: A.commentFg, background: A.commentBg }
          }
        >
          {t(isSuggestion ? 'annotations.kind.suggestion' : 'annotations.kind.comment')}
        </span>
        <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: A.title }}>
          {anchorLabel}
        </span>
        {decided ? (
          <span
            className="rounded-[5px] px-[6px] py-[1px] text-[10px] font-bold uppercase tracking-[0.03em]"
            style={
              annotation.status === 'accepted'
                ? { color: A.acceptedFg, background: A.acceptedBg }
                : { color: A.rejectedFg, background: A.rejectedBg }
            }
          >
            {t(`annotations.decided.${annotation.status}`)}
          </span>
        ) : null}
        {annotation.resolved ? (
          <span
            className="rounded-[5px] px-[6px] py-[1px] text-[10px] font-bold uppercase tracking-[0.03em]"
            style={{ color: A.acceptedFg, background: A.acceptedBg }}
          >
            {t('annotations.decided.resolved')}
          </span>
        ) : null}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke={A.tabIdleFg}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded ? (
        <div className="border-t px-[12px] pb-[12px] pt-[11px]" style={{ borderColor: A.headBorder }}>
          {/* from → to strip for dur/enum suggestions. */}
          {isSuggestion && annotation.suggestionShape !== 'text' ? (
            <div
              className="mb-[11px] flex items-center gap-[8px] rounded-[9px] border px-[11px] py-[8px]"
              style={{ background: A.stripBg, borderColor: A.stripBorder }}
            >
              <span className="text-[13px] font-semibold line-through" style={{ color: A.fromFg }}>
                {valueLabel(annotation.suggestionShape, annotation.fromValue)}
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={A.toFg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
              <span className="text-[13px] font-bold" style={{ color: A.toFg }}>
                {valueLabel(annotation.suggestionShape, annotation.toValue)}
              </span>
            </div>
          ) : null}

          {/* Tracked-change diff for a text (prose) suggestion. */}
          {isSuggestion && annotation.suggestionShape === 'text' ? (
            <div
              dir="auto"
              className="mb-[11px] rounded-[9px] border px-[11px] py-[8px] text-[13px] leading-[1.5]"
              style={{ background: A.stripBg, borderColor: A.stripBorder }}
            >
              {(() => {
                const segs = textDiffSegments(annotation.fromValue ?? '', annotation.toValue ?? '');
                return (
                  <>
                    {segs.pre}
                    {segs.del ? (
                      <span className="line-through" style={{ color: A.fromFg }}>
                        {segs.del}
                      </span>
                    ) : null}
                    {segs.ins ? <span style={{ color: A.toFg }}>{segs.ins}</span> : null}
                    {segs.post}
                  </>
                );
              })()}
            </div>
          ) : null}

          {/* Author + note. */}
          <div className="flex gap-[10px]">
            <Avatar role={annotation.authorRole} name={annotation.authorName} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-[6px]">
                <span dir="auto" className="text-[12.5px] font-semibold text-ink">
                  {annotation.authorName || roleLabel(annotation.authorRole)}
                </span>
                <span
                  className="rounded-[5px] px-[5px] py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.04em]"
                  style={
                    annotation.authorRole === 'teacher'
                      ? { color: A.badgeTeacherFg, background: A.badgeTeacherBg }
                      : { color: A.badgeCoordFg, background: A.badgeCoordBg }
                  }
                >
                  {roleLabel(annotation.authorRole)}
                </span>
                <span className="ms-auto text-[11px]" style={{ color: A.cardTime }}>
                  {time(annotation.createdAt)}
                </span>
              </div>
              <p dir="auto" className="mt-[5px] whitespace-pre-wrap text-[13px] leading-[1.55]" style={{ color: A.cardText }}>
                {annotation.note}
              </p>
            </div>
          </div>

          {/* Threaded replies. */}
          {annotation.replies.length > 0 ? (
            <ul className="mt-[11px] flex flex-col gap-[10px] ps-[10px]" style={{ borderInlineStart: `2px solid ${A.replyBorder}` }}>
              {annotation.replies.map((r) => (
                <li key={r.id} className="flex gap-[9px]">
                  <Avatar role={r.authorRole} name={r.authorName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-[6px]">
                      <span dir="auto" className="text-[12px] font-semibold text-ink">
                        {r.authorName || roleLabel(r.authorRole)}
                      </span>
                      <span className="text-[10px]" style={{ color: A.cardTime }}>
                        {time(r.createdAt)}
                      </span>
                    </div>
                    <p dir="auto" className="mt-[3px] whitespace-pre-wrap text-[12.5px] leading-[1.5]" style={{ color: A.cardText }}>
                      {r.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Reply composer (any member). */}
          {replying ? (
            <div className="mt-[10px]">
              <textarea
                dir="auto"
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={2}
                placeholder={t('annotations.reply.placeholder')}
                className="block w-full resize-none rounded-[10px] border bg-white px-[11px] py-[8px] text-[13px] leading-[1.5] text-ink outline-none focus:border-teal"
                style={{ borderColor: A.textareaBorder }}
              />
              <div className="mt-[7px] flex items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => void onReply()}
                  disabled={!replyDraft.trim() || pending}
                  className="rounded-[9px] px-[13px] py-[7px] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: A.teal }}
                >
                  {t('annotations.reply.submit')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplying(false);
                    setReplyDraft('');
                  }}
                  className="text-[12.5px] font-medium"
                  style={{ color: A.neutralFg }}
                >
                  {t('annotations.reply.cancel')}
                </button>
              </div>
            </div>
          ) : null}

          {/* Action row — role-aware. */}
          <div className="mt-[11px] flex flex-wrap items-center gap-[8px]">
            {isSuggestion ? (
              annotation.status === 'pending' ? (
                role === 'teacher' && editable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void decide(annotation.id, 'accepted')}
                      disabled={pending}
                      className="inline-flex items-center gap-[5px] rounded-[9px] px-[12px] py-[7px] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ background: A.teal }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {t('annotations.actions.accept')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void decide(annotation.id, 'rejected')}
                      disabled={pending}
                      className="inline-flex items-center gap-[5px] rounded-[9px] border bg-white px-[12px] py-[7px] text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ color: A.neutralFg, borderColor: A.neutralBorder }}
                    >
                      {t('annotations.actions.reject')}
                    </button>
                  </>
                ) : (
                  <span className="text-[11.5px] font-medium" style={{ color: A.hint }}>
                    {t('annotations.actions.awaitingTeacher')}
                  </span>
                )
              ) : (
                <span className="text-[11.5px] font-medium" style={{ color: A.hint }}>
                  {t(`annotations.actions.decided.${annotation.status}`)}
                </span>
              )
            ) : annotation.resolved ? (
              <button
                type="button"
                onClick={() => void resolve(annotation.id, false)}
                disabled={pending}
                className="inline-flex items-center gap-[5px] rounded-[9px] border bg-white px-[12px] py-[7px] text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ color: A.neutralFg, borderColor: A.neutralBorder }}
              >
                {t('annotations.actions.undo')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void resolve(annotation.id, true)}
                disabled={pending}
                className="inline-flex items-center gap-[5px] rounded-[9px] border bg-white px-[12px] py-[7px] text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ color: A.teal, borderColor: A.tealBorder }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {t('annotations.actions.resolve')}
              </button>
            )}

            {!replying ? (
              <button
                type="button"
                onClick={() => setReplying(true)}
                className="ms-auto inline-flex items-center gap-[5px] text-[12px] font-medium"
                style={{ color: A.teal }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {t('annotations.reply.toggle')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
