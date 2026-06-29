'use client';

// One lifecycle event in the activity timeline, rendered as a compact teal labelled
// separator (teal = a workflow action, per the app's semantic palette) — visually
// distinct from the pink comment cards it sits between, without inventing a new
// pattern. Reads its label from `review.timeline.event.*`; the actor name and date
// trail it as muted meta ("Returned for edits · Amal Haddad · Jun 12").

import { useLocale, useTranslations } from 'next-intl';
import { APP_TIME_ZONE, formatDate } from '@/lib/format';
import type { PlanEvent } from '@/lib/review/timeline';

export function PlanEventRow({ event }: { event: PlanEvent }) {
  const t = useTranslations('review.timeline');
  const locale = useLocale();

  const label = t(`event.${event.type}`);
  const when = formatDate(event.createdAt, locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  });
  const meta = [event.actorName, when].filter(Boolean).join(' · ');

  return (
    <li className="flex items-center gap-[10px]">
      {/* The marker sits where the comment avatar would, so the rail's left edge
          stays aligned; teal keeps it reading as an action, not a person. */}
      <span aria-hidden className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center">
        <span className="h-[8px] w-[8px] rounded-full bg-teal" />
      </span>
      <p dir="auto" className="min-w-0 flex-1 text-[11.5px] leading-[1.4]">
        <span className="font-semibold text-teal-deep">{label}</span>
        {meta ? <span className="text-text-faint"> · {meta}</span> : null}
      </p>
    </li>
  );
}
