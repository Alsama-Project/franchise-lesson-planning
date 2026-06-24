'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { EditorClassContext } from '@/lib/editor/load-plan';
import { IN_SESSION_TARGET_MINUTES } from '@/lib/blocks';

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

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
}: {
  classContext: EditorClassContext;
  lessonDate: string;
  total: number;
  /** Optional controls (save state, Download) rendered before the time total. */
  actions?: ReactNode;
  /** The in-session running total badge only belongs on the Review step. */
  showTotal?: boolean;
}) {
  const onTarget = total === IN_SESSION_TARGET_MINUTES;
  const totalColor = onTarget ? 'text-[#2E7D5B]' : 'text-[#B0651E]';
  const totalStroke = onTarget ? '#2E7D5B' : '#B0651E';

  return (
    <div className="border-b border-[#EFE8DD] px-[22px] py-4 lg:px-[30px]">
      <Link
        href="/"
        className="mb-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:text-ink"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        This week
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-[10px]">
          <span className="text-[19px] font-semibold">
            Year {classContext.year} · Group {classContext.groupLabel}
          </span>
          {classContext.subjectName ? (
            <span className="rounded-badge bg-[#F3ECE2] px-[9px] py-[3px] text-[12px] text-neutral-700">
              {classContext.subjectName}
            </span>
          ) : null}
          <span className="text-neutral-300">·</span>
          <span className="text-[13px] text-neutral-600">
            {formatDate(lessonDate)} · {classContext.schoolName}
          </span>
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
                {total} / {IN_SESSION_TARGET_MINUTES} min
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
