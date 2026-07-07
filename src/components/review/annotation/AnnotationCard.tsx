'use client';

// One card in the unified floating stack. EVERY annotation — comment, suggestion,
// and whole-plan note — uses THIS component and one interaction (expand/collapse),
// differing only in the action it offers, exactly like Google Docs:
//   • comment / whole-plan → Resolve (checkmark); resolved = greyed + reduced opacity.
//   • suggestion → Accept / Reject + its from→to pill (dur/enum) or tracked-change
//     diff (text). Accept/reject + apply are the EXISTING logic, in a new shell.
// Collapsed, a card is a one-line clamp preview; selected it expands, lifts (shadow)
// and shifts ~8px toward the plan, and its section highlights (teal left border). The
// section-name tag sits AFTER the author row — there is no COMMENT/SUGGESTION tag.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { APP_TIME_ZONE, formatDate } from '@/lib/format';
import { initialsOf } from '@/components/weekly-overview/avatar';
import type { Annotation, AnnotationRole } from '@/types/annotation';
import { textDiffSegments } from '@/lib/review/textDiff';
import { isResolvedCard, useAnnotations } from './context';
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

function Avatar({ role, name, size = 26 }: { role: AnnotationRole; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        background: role === 'teacher' ? A.avTeacher : A.avCoord,
        width: size,
        height: size,
        fontSize: size <= 20 ? 9 : 10,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AnnotationCard({ annotation }: { annotation: Annotation }) {
  const t = useTranslations('review');
  const locale = useLocale();
  const { role, editable, activeId, setActiveId, pending, reply, resolve, decide, phaseTitles } =
    useAnnotations();

  const expanded = activeId === annotation.id;
  const [replyDraft, setReplyDraft] = useState('');
  const ref = useRef<HTMLLIElement>(null);

  // When focused from a read-side badge/pill/section click, bring the card into view.
  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [expanded]);

  const isSuggestion = annotation.kind === 'suggestion';
  const resolvedCard = isResolvedCard(annotation);
  const roleLabel = (r: AnnotationRole) => t(`activity.role.${r}`);

  // The card's tag = the section name (or "Whole plan" for a general note), shown
  // AFTER the author row. No COMMENT/SUGGESTION tag.
  const sectionTag = (() => {
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
    if (ok) setReplyDraft('');
  };

  // Card shell: lift + shift toward the plan when selected; greyed + faded when a
  // collapsed resolved card. The shift is toward the inline-start (the plan) side.
  const shell: CSSProperties = {
    borderColor: expanded ? A.tealBorder : A.cardBorder,
    boxShadow: expanded ? '0 14px 34px -18px rgba(20,12,8,0.45)' : undefined,
    opacity: resolvedCard && !expanded ? 0.6 : 1,
  };

  return (
    <li
      ref={ref}
      id={`annotation-${annotation.id}`}
      className={`rounded-[12px] border bg-white transition-[transform,box-shadow] ${
        expanded ? '-translate-x-[8px] rtl:translate-x-[8px]' : ''
      }`}
      style={shell}
    >
      {expanded ? (
        <div className="px-[13px] pb-[12px] pt-[12px]">
          {/* Author row. */}
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="flex w-full items-start gap-[10px] text-start"
          >
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
              {/* Section-name tag — AFTER the author row. */}
              <span
                className="mt-[5px] inline-flex rounded-[6px] px-[7px] py-[1px] text-[10.5px] font-semibold"
                style={{ color: A.countFg, background: A.countBg }}
              >
                {sectionTag}
              </span>
            </div>
          </button>

          {/* from → to strip for dur/enum suggestions. */}
          {isSuggestion && annotation.suggestionShape !== 'text' ? (
            <div
              className="mt-[11px] flex items-center gap-[8px] rounded-[9px] border px-[11px] py-[8px]"
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
              className="mt-[11px] rounded-[9px] border px-[11px] py-[8px] text-[13px] leading-[1.5]"
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

          {/* Note body. */}
          <p dir="auto" className="mt-[9px] whitespace-pre-wrap text-[13px] leading-[1.55]" style={{ color: A.cardText }}>
            {annotation.note}
          </p>

          {/* Threaded replies. */}
          {annotation.replies.length > 0 ? (
            <ul className="mt-[11px] flex flex-col gap-[10px] ps-[10px]" style={{ borderInlineStart: `2px solid ${A.replyBorder}` }}>
              {annotation.replies.map((r) => (
                <li key={r.id} className="flex gap-[9px]">
                  <Avatar role={r.authorRole} name={r.authorName} size={22} />
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

          {/* Action row — role-aware, unchanged behaviour. */}
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
                <span
                  className="inline-flex items-center gap-[5px] rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.03em]"
                  style={
                    annotation.status === 'accepted'
                      ? { color: A.acceptedFg, background: A.acceptedBg }
                      : { color: A.rejectedFg, background: A.rejectedBg }
                  }
                >
                  {t(`annotations.decided.${annotation.status}`)}
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
          </div>

          {/* Reply composer — on every expanded card. */}
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
            {replyDraft.trim() ? (
              <div className="mt-[7px] flex items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => void onReply()}
                  disabled={pending}
                  className="rounded-[9px] px-[13px] py-[7px] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: A.teal }}
                >
                  {t('annotations.reply.submit')}
                </button>
                <button
                  type="button"
                  onClick={() => setReplyDraft('')}
                  className="text-[12.5px] font-medium"
                  style={{ color: A.neutralFg }}
                >
                  {t('annotations.reply.cancel')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        // Collapsed — a one-line clamp preview; click selects (expands) the card.
        <button
          type="button"
          onClick={() => setActiveId(annotation.id)}
          className="flex w-full items-center gap-[9px] px-[12px] py-[10px] text-start"
        >
          <Avatar role={annotation.authorRole} name={annotation.authorName} size={22} />
          <span
            dir="auto"
            className="min-w-0 flex-1 truncate text-[12.5px]"
            style={{ color: resolvedCard ? A.resolvedFg : A.cardText }}
          >
            {annotation.note}
          </span>
          {resolvedCard ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={A.acceptedFg}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
              aria-hidden
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : annotation.replies.length > 0 ? (
            <span className="flex-shrink-0 text-[11px] font-semibold" style={{ color: A.tabIdleFg }}>
              {annotation.replies.length}
            </span>
          ) : null}
        </button>
      )}
    </li>
  );
}
