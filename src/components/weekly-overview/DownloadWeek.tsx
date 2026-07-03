'use client';

// The board's "Download week" control. On a single-subject board it is the plain
// download-glyph icon button, linking straight to the /api/pdf/week export for that
// subject — visually unchanged from before. On a user-wide (multi-subject) board a
// single week PDF is ambiguous, so the button becomes a subject picker: each choice
// exports THAT subject's week through the SAME /api/pdf/week route (same params:
// subject, subjectName, years, month, week, weekNo). The endpoint is untouched — a
// merged multi-subject PDF is a separate decision owned by the PDF export work.

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import type { BoardDownloadSubject } from '@/types/weekly-overview';

const DownloadGlyph = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 1.5v8.5M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
  </svg>
);

function pdfHref(
  subject: BoardDownloadSubject,
  month: string,
  week: number,
  weekNo: number,
): string {
  const params = new URLSearchParams({
    subject: subject.subjectCode,
    subjectName: subject.subjectName,
    years: subject.years.join(','),
    month,
    week: String(week),
    weekNo: String(weekNo),
  });
  return `/api/pdf/week?${params.toString()}`;
}

export function DownloadWeek({
  subjects,
  month,
  week,
  weekNo,
}: {
  subjects: BoardDownloadSubject[];
  month: string;
  week: number;
  weekNo: number;
}) {
  const t = useTranslations('board');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const buttonClass =
    'inline-flex size-8 items-center justify-center rounded-[8px] border border-border bg-surface text-neutral-700 transition-colors hover:bg-surface-subtle hover:text-ink';

  // Single subject: the original plain icon link — unchanged.
  if (subjects.length === 1) {
    return (
      <a
        href={pdfHref(subjects[0], month, week, weekNo)}
        target="_blank"
        rel="noopener noreferrer"
        title={t('downloadWeekTitle')}
        aria-label={t('downloadWeek')}
        className={buttonClass}
      >
        <DownloadGlyph />
      </a>
    );
  }

  // Multiple subjects: a picker — each subject exports its own week PDF.
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t('downloadWeekTitle')}
        aria-label={t('downloadWeek')}
        className={buttonClass}
      >
        <DownloadGlyph />
      </button>
      {open ? (
        <div className="absolute end-0 z-30 mt-[4px] min-w-[180px] rounded-[10px] border border-border bg-surface p-[5px] shadow-card">
          <div className="px-[9px] pb-[4px] pt-[5px] text-[10px] font-bold uppercase tracking-[0.05em] text-text-faint">
            {t('download.chooseSubject')}
          </div>
          {subjects.map((s) => (
            <a
              key={s.subjectCode}
              href={pdfHref(s, month, week, weekNo)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              dir="auto"
              className={cn(
                'block truncate rounded-[8px] px-[9px] py-[8px] text-start text-[12.5px] font-semibold text-ink transition-colors',
                'hover:bg-teal-tint hover:text-teal-deep',
              )}
            >
              {s.subjectName}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
