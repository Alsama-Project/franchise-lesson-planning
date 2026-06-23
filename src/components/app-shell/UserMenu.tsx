'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut } from '@/lib/actions/auth';

/** Up-to-two-letter initials for the avatar, derived from the display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The signed-in user control in the shell: an initials avatar + name chip that
 * opens a small menu (identity, profile link, sign out). Sign out posts to the
 * `signOut` server action, so the session is cleared server-side.
 */
export function UserMenu({ name, subtitle }: { name: string; subtitle?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
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
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-[9px] rounded-full border border-border py-1 pl-1 pr-[10px] transition-colors hover:bg-surface-subtle"
      >
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-teal text-[12px] font-bold text-white">
          {initials(name)}
        </span>
        {/* Two-line identity: name on top, "Centre · Subject" beneath when the
            user belongs to at least one space (matches the Settings design). */}
        <span className="flex max-w-[150px] flex-col items-start leading-[1.15]">
          <span className="max-w-[150px] truncate text-[13px] font-semibold">{name}</span>
          {subtitle ? (
            <span className="max-w-[150px] truncate text-[10px] text-text-faint">{subtitle}</span>
          ) : null}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8178" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[50px] z-20 w-[232px] rounded-[12px] border border-border bg-surface p-[6px] shadow-card"
        >
          <div className="border-b border-neutral-100 px-3 py-[10px]">
            <div className="text-[13px] font-semibold">{name}</div>
            {subtitle ? (
              <div className="mt-px text-[12px] text-neutral-600">{subtitle}</div>
            ) : null}
          </div>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full cursor-pointer rounded-[8px] px-3 py-[9px] text-left text-[13px] text-neutral-900 hover:bg-surface-subtle"
          >
            Settings
          </Link>
          <form action={signOut} role="none">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-3 py-[9px] text-left text-[13px] font-semibold text-pink hover:bg-surface-subtle"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
