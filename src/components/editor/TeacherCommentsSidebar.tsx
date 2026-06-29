'use client';

// The teacher-facing view of coordinator feedback, as a read-only right-hand
// sidebar on the teacher's plan page (/plan/[id], Review step). It ports the
// coordinator review sidebar's chrome exactly — same sticky bordered card, header
// (title + count) and comment cards — with two differences for teachers: there is
// NO compose/send box and NO approve / return-for-changes controls. The "Review
// these notes, make your changes, then resubmit" helper sits under the header.
//
// Existence-gated: the editor mounts this only when coordinator comments exist, so
// it appears for a returned plan (which carries comments) but not for a fresh one,
// independent of status. Sticky so it stays in view as the plan scrolls (item 8).

import { useLocale, useTranslations } from 'next-intl';
import { APP_TIME_ZONE, formatDate, formatNumber } from '@/lib/format';
import { initialsOf } from '@/components/weekly-overview/avatar';
import type { PlanComment } from '@/lib/review/comments';

export function TeacherCommentsSidebar({ comments }: { comments: PlanComment[] }) {
  const t = useTranslations('wizard.feedback');
  const locale = useLocale();

  // Existence-gated by the caller, but keep a defensive guard so this never renders
  // an empty shell.
  if (comments.length === 0) return null;

  return (
    <section
      aria-label={t('title')}
      className="flex flex-col overflow-hidden rounded-[16px] border border-border bg-surface lg:sticky lg:top-[80px] lg:max-h-[calc(100vh-96px)]"
    >
      {/* Header — title + count, mirroring the coordinator sidebar. */}
      <div className="border-b border-border px-[18px] py-[14px]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">{t('title')}</h2>
          <span className="inline-flex min-w-[22px] items-center justify-center rounded-badge bg-surface-subtle px-[8px] py-[2px] text-[12px] font-bold text-text-muted">
            {formatNumber(comments.length, locale)}
          </span>
        </div>
        <p className="mt-[6px] text-[12.5px] leading-[1.4] text-text-muted">{t('subtitle')}</p>
      </div>

      {/* Thread — read-only (no composer, no decision footer). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[16px]">
        <ul className="flex flex-col gap-[14px]">
          {comments.map((c) => (
            <CommentCard key={c.id} comment={c} chipLabel={t('coordinator')} locale={locale} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One comment: pink avatar, author name, "Coordinator" chip, timestamp, dir="auto" body.
 *  Mirrors the coordinator review sidebar's CommentCard exactly. */
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
