'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import { formatDayMonthYear } from '@/lib/dates';
import type { NotificationItem } from '@/lib/notifications';

/**
 * The shell's notification bell. Opens a dropdown listing the signed-in teacher's
 * own lessons that were approved or returned with edits (`needs_review`) — see
 * `getMyNotifications`. Each row carries the outcome via the app's existing
 * {@link StatusChip} (status colour tokens — NOT the content-zone cream/pink/teal
 * semantics) and links to the lesson. The unread dot shows only when the list is
 * non-empty. This is a filtered view of the user's own outcomes — there is no
 * read/unread or dismissal state.
 */
export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasUnread = items.length > 0;

  // Close on outside click / Escape (mirrors UserMenu).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex size-[38px] items-center justify-center rounded-[9px] border border-border bg-surface transition-colors hover:bg-surface-subtle"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {hasUnread ? (
          <span className="absolute right-[9px] top-[8px] size-[7px] rounded-full border-[1.5px] border-white bg-pink" />
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[50px] z-20 w-[320px] overflow-hidden rounded-[12px] border border-border bg-surface shadow-card"
        >
          <div className="border-b border-neutral-100 px-[14px] py-[11px]">
            <div className="text-[13px] font-semibold">Notifications</div>
          </div>

          {items.length === 0 ? (
            <div className="px-[14px] py-[22px] text-center text-[12.5px] text-text-faint">
              You&rsquo;re all caught up.
            </div>
          ) : (
            <ul className="max-h-[360px] divide-y divide-neutral-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.planId}>
                  <Link
                    href={`/plan/${n.planId}`}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-[10px] px-[14px] py-[11px] transition-colors hover:bg-surface-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <StatusChip status={n.status} />
                      <div className="mt-[6px] truncate text-[12.5px] font-medium text-neutral-900">
                        {[n.yearLabel, n.lessonTitle].filter(Boolean).join(' · ') || 'Lesson'}
                      </div>
                      {n.at ? (
                        <div className="mt-px text-[11px] text-text-faint">
                          {n.status === 'approved' ? 'Approved' : 'Returned with edits'} ·{' '}
                          {formatDayMonthYear(n.at)}
                        </div>
                      ) : null}
                    </div>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#B8AFA4"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="mt-[2px] shrink-0"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
