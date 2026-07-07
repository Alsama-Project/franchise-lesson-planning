'use client';

// The Calendar grid's started-lesson card — a raised, solid card with a status-
// colour left spine, sitting in its own (year, period) cell. The whole card links
// to the plan (the editable wizard when the viewer may edit, else the read-only
// review view), so the "Open" / "Review" pill is a styled affordance, not a nested
// button. Status colour (spine + dot + label) comes from the app's status tokens —
// the same source the status chips use — never the mock's hard-coded hues.

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { LinkPending } from '@/components/ui/LinkPending';
import { OwnerAvatar } from '@/components/weekly-overview/OwnerAvatar';
import { DeleteLessonControl } from '@/components/weekly-overview/DeleteLessonControl';
import { usePlanHref } from '@/components/weekly-overview/BoardReturn';
import type { PlanCard } from '@/components/weekly-overview/cards';
import { formatNumber } from '@/lib/format';
import type { PlanStatus } from '@/types/lesson';

/**
 * Per-status accent classes, keyed on the app's `status-*` tokens (the same family
 * the status chips read). `spine` fills the 6px left rule and the status dot;
 * `text` colours the status label. Not-started never reaches this card — it renders
 * as a ghost — so only the four real statuses are mapped.
 */
const STATUS_ACCENT: Record<PlanStatus, { fill: string; text: string }> = {
  in_progress: { fill: 'bg-status-progress', text: 'text-status-progress' },
  submitted: { fill: 'bg-status-submitted', text: 'text-status-submitted' },
  needs_review: { fill: 'bg-status-review', text: 'text-status-review' },
  approved: { fill: 'bg-status-approved', text: 'text-status-approved' },
};

export function GridLessonCard({ card, readOnly = false }: { card: PlanCard; readOnly?: boolean }) {
  const t = useTranslations('board');
  const locale = useLocale();
  const planHref = usePlanHref();
  const accent = STATUS_ACCENT[card.status];

  const topic = card.topic.trim() || t('card.lessonN', { n: formatNumber(card.period, locale) });
  // The lesson's human label for the delete affordance's aria + confirm copy.
  const lessonName = `${t('card.year', { n: formatNumber(card.year, locale) })} · ${topic}`;

  // Round-trip the board's current week so the plan's "back to overview" returns
  // here. A non-author (coordinator/admin) opens the read-only review view.
  const href = planHref(card.canEdit && !readOnly ? `/plan/${card.planId}` : `/plan/${card.planId}/view`);

  return (
    <Link
      href={href}
      draggable={false}
      className="group relative flex h-full min-h-[224px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface py-[20px] pe-[22px] ps-[24px] shadow-[0_14px_30px_-22px_rgba(60,40,30,0.55)] transition-colors hover:bg-surface-subtle"
    >
      <span aria-hidden className={cn('absolute inset-y-0 start-0 w-[6px]', accent.fill)} />
      <LinkPending size={13} className="absolute end-[8px] top-[8px] text-teal" />

      <div className="flex items-start justify-between gap-[10px]">
        <div className="min-w-0">
          <div dir="auto" className="truncate text-[13px] font-medium text-text-faint">
            {card.subjectName}
            {card.centreName ? <span className="text-text-faint"> · {card.centreName}</span> : null}
          </div>
          <div className="mt-[2px] text-[22px] font-bold leading-[1.05] text-ink">
            {t('card.year', { n: formatNumber(card.year, locale) })}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-[6px]">
          {card.canDelete ? <DeleteLessonControl planId={card.planId} lessonName={lessonName} /> : null}
          {card.owner ? <OwnerAvatar owner={card.owner} size={30} /> : null}
        </div>
      </div>

      <p dir="auto" className="mt-[12px] line-clamp-3 flex-1 text-[15px] leading-[1.5] text-text-muted">
        {topic}
      </p>

      <div className="mt-[16px] flex items-center justify-between gap-[10px]">
        <span className={cn('inline-flex items-center gap-[7px] text-[14px] font-semibold', accent.text)}>
          <span aria-hidden className={cn('h-[9px] w-[9px] rounded-full', accent.fill)} />
          {t(`status.${card.status}`)}
        </span>
        <span className="inline-flex flex-shrink-0 items-center rounded-[9px] border border-teal bg-teal px-[18px] py-[8px] text-[14px] font-semibold text-white transition-colors group-hover:bg-teal-deep">
          {readOnly ? t('card.review') : t('card.open')}
        </span>
      </div>
    </Link>
  );
}
