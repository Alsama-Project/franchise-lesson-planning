'use client';

// The teacher-facing view of coordinator feedback, shown read-only on the Review
// step. Existence-gated: it renders nothing when there are no comments, so it
// appears for a returned plan (which carries comments) but not for a fresh one —
// independent of status. Comments are loaded server-side via getPlanComments and
// stay empty (degrading gracefully) until the teacher-SELECT policy (migration
// 0025) is applied to plan_comments.

import { useLocale, useTranslations } from 'next-intl';
import { APP_TIME_ZONE, formatDate } from '@/lib/format';
import { initialsOf } from '@/components/weekly-overview/avatar';
import type { PlanComment } from '@/lib/review/comments';

export function TeacherCommentsPanel({ comments }: { comments: PlanComment[] }) {
  const t = useTranslations('wizard.feedback');
  const locale = useLocale();

  // Existence-gated: no comments → render nothing (no "nothing to review" copy on
  // the teacher side; the absence of the panel is the empty state).
  if (comments.length === 0) return null;

  return (
    <section
      aria-label={t('title')}
      className="mt-[18px] overflow-hidden rounded-[14px] border border-status-review-border bg-status-review-bg"
    >
      <div className="border-b border-status-review-border/60 px-[18px] py-[12px]">
        <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-pink">{t('title')}</p>
        <p className="mt-[2px] text-[12.5px] text-neutral-700">{t('subtitle')}</p>
      </div>
      <ul className="flex flex-col gap-[14px] px-[18px] py-[16px]">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-[10px]">
            <span
              aria-hidden
              className="mt-[1px] flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold"
              style={{ background: '#FBEFF3', color: '#B62A5C' }}
            >
              {initialsOf(c.authorName || t('coordinator'))}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
                <span dir="auto" className="text-[13px] font-semibold text-ink">
                  {c.authorName || t('coordinator')}
                </span>
                <span className="text-[11px] text-text-faint">
                  {formatDate(c.createdAt, locale, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: APP_TIME_ZONE,
                  })}
                </span>
              </div>
              <p dir="auto" className="mt-[5px] whitespace-pre-wrap text-[13px] leading-[1.5] text-neutral-800">
                {c.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
