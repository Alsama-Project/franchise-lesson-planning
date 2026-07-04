'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { EditorClassContext } from '@/lib/editor/load-plan';
import { IN_SESSION_TARGET_MINUTES } from '@/lib/blocks';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * The editor sub-header: a "‹ This week" back link to the Weekly Overview, the
 * locked class context, and the live in-session running total (green at 50 min,
 * amber otherwise).
 */
export function EditorSubHeader({
  classContext,
  lessonDate,
  total,
  actions,
  showTotal = true,
  backHref = '/',
}: {
  classContext: EditorClassContext;
  lessonDate: string | null;
  total: number;
  /** Optional controls (save state, Download) rendered before the time total. */
  actions?: ReactNode;
  /** The in-session running total badge only belongs on the Review step. */
  showTotal?: boolean;
  /** Where "‹ This week" returns — the board week the plan was opened from, so
   *  returning lands on the same week. Defaults to the plain overview. */
  backHref?: string;
}) {
  const t = useTranslations('wizard');
  const locale = useLocale();
  const onTarget = total === IN_SESSION_TARGET_MINUTES;
  const totalColor = onTarget ? 'text-[#2E7D5B]' : 'text-[#B0651E]';
  const totalStroke = onTarget ? '#2E7D5B' : '#B0651E';

  // Scope-aware title suffix: centre/org plans name their reach. A class plan has
  // no further label — a class is identified by year alone (no group concept).
  const scopeSuffix =
    classContext.scope === 'centre'
      ? t('subheader.wholeCentre')
      : classContext.scope === 'org'
        ? t('subheader.allCentres')
        : null;

  const dateLabel = lessonDate
    ? formatDate(`${lessonDate}T00:00:00Z`, locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';
  // The trailing line shows the date (when set) and centre, joined cleanly.
  const metaLine = [dateLabel, classContext.schoolName].filter(Boolean).join(' · ');

  return (
    <div className="border-b border-[#EFE8DD] px-[22px] py-[9px] lg:px-[30px]">
      <Link
        href={backHref}
        className="mb-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-600 transition-colors hover:text-ink"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {t('nav.thisWeek')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-[10px]">
          <span className="text-[20px] font-bold">
            {t('subheader.year', { year: formatNumber(classContext.year, locale) })}
            {scopeSuffix ? ` · ${scopeSuffix}` : ''}
          </span>
          {classContext.subjectName ? (
            <span dir="auto" className="rounded-badge bg-[#F3ECE2] px-[9px] py-[3px] text-[12px] text-neutral-700">
              {classContext.subjectName}
            </span>
          ) : null}
          {metaLine ? (
            <>
              <span className="text-neutral-300">·</span>
              <span dir="auto" className="text-[13px] text-neutral-600">{metaLine}</span>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {actions}
          {showTotal ? (
            <div className="inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={totalStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className={`text-[13.5px] font-bold ${totalColor}`}>
                {t('total.inSession', {
                  total: formatNumber(total, locale),
                  target: formatNumber(IN_SESSION_TARGET_MINUTES, locale),
                })}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
