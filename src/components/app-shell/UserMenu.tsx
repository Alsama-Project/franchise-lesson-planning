'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from '@/lib/actions/auth';
import { setActiveSpace } from '@/lib/actions/active-space';
import { LocaleSwitcher } from '@/components/app-shell/LocaleSwitcher';
import { ForceRtlToggle } from '@/components/app-shell/ForceRtlToggle';
import type { SwitcherSpace } from '@/lib/active-space';

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
 *
 * This chip reflects the signed-in user; its Settings / language / sign-out act on
 * that session.
 */
export function UserMenu({
  name,
  subtitle,
  spaces = [],
  pseudoRtlEnabled = false,
  pseudoRtlOn = false,
}: {
  name: string;
  subtitle?: string;
  /** The user's (centre, subject) spaces — the switcher's rows. Empty/one → no switcher. */
  spaces?: SwitcherSpace[];
  /** When true, show the dev-only "Force RTL" toggle (ENABLE_PSEUDO_RTL). */
  pseudoRtlEnabled?: boolean;
  /** Current pseudo-RTL state (server-read from the cookie). */
  pseudoRtlOn?: boolean;
}) {
  const t = useTranslations('nav');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The switcher only appears when there is a choice to make.
  const hasSwitcher = spaces.length > 1;
  const serverActiveId = spaces.find((s) => s.isActive)?.membershipId ?? null;

  // Optimistic active marker: reflect the pick instantly during the transition,
  // then snap back to the server's truth once its revalidation lands. On failure
  // the transition settles with no server change, so it reverts on its own.
  const [activeId, setOptimisticActiveId] = useOptimistic(serverActiveId);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const status = pending ? t('updatingSpace') : failed ? t('switchError') : '';

  function choose(space: SwitcherSpace) {
    if (space.membershipId === activeId || pending) return;
    setFailed(false);
    startTransition(async () => {
      setOptimisticActiveId(space.membershipId);
      const res = await setActiveSpace(space.schoolId, space.subjectId);
      if (!res.ok) {
        setFailed(true);
        return;
      }
      // Re-render every server surface (chip, board, curriculum default) at once.
      router.refresh();
    });
  }

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
        className="flex cursor-pointer items-center gap-[9px] rounded-full border border-border py-1 ps-1 pe-[10px] transition-colors hover:bg-surface-subtle"
      >
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-teal text-[12px] font-bold text-white">
          {initials(name)}
        </span>
        {/* Two-line identity: name on top, "Centre · Subject" beneath when the
            user belongs to at least one space (matches the Settings design). */}
        <span className="flex max-w-[150px] flex-col items-start leading-[1.15]">
          <span className="max-w-[150px] truncate text-[13px] font-semibold">{name}</span>
          {subtitle ? (
            <span className="max-w-[150px] truncate text-[10px] text-text-faint" dir="auto">
              {subtitle}
            </span>
          ) : null}
        </span>
        {hasSwitcher ? (
          <span className="inline-flex h-[18px] items-center rounded-full border border-teal-tint-border bg-teal-tint px-1.5 text-[9px] font-bold uppercase tracking-[0.05em] text-teal-deep">
            {t('switchHint')}
          </span>
        ) : null}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8178" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-[50px] z-20 w-[232px] rounded-[12px] border border-border bg-surface p-[6px] shadow-card"
        >
          <div className="border-b border-neutral-100 px-3 py-[10px]">
            <div className="text-[13px] font-semibold">{name}</div>
            {subtitle ? (
              <div className="mt-px text-[12px] text-neutral-600" dir="auto">
                {subtitle}
              </div>
            ) : null}
          </div>

          {hasSwitcher ? (
            <>
              <div className="px-3 pb-1.5 pt-[11px] text-[10px] font-bold uppercase tracking-[0.12em] text-text-faint">
                {t('yourSpaces')}
              </div>
              <div role="radiogroup" aria-label={t('yourSpaces')} className="px-0.5">
                {spaces.map((s) => {
                  const isActive = s.membershipId === activeId;
                  return (
                    <button
                      key={s.membershipId}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      disabled={pending}
                      onClick={() => choose(s)}
                      className={`flex w-full items-center gap-[11px] rounded-[10px] border px-[10px] py-[9px] text-start transition-colors disabled:cursor-default ${
                        isActive
                          ? 'border-teal-tint-border bg-teal-tint'
                          : 'border-transparent hover:bg-surface-subtle'
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 flex-col leading-[1.25]">
                        <span className="truncate text-[13px] font-semibold text-ink" dir="auto">
                          {s.schoolName} · {s.subjectName}
                        </span>
                        <span
                          className={`mt-0.5 text-[10.5px] uppercase tracking-[0.05em] ${
                            s.role === 'coordinator'
                              ? 'font-semibold text-teal-deep'
                              : 'text-neutral-600'
                          }`}
                        >
                          {t(s.role === 'coordinator' ? 'roleCoordinator' : 'roleTeacher')}
                        </span>
                      </span>
                      {isActive ? (
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-teal"
                          aria-hidden
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <span className="size-[15px] rounded-full border-[1.5px] border-neutral-200" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div aria-live="polite" className="min-h-0">
                {status ? (
                  <div className="px-3 pb-1 pt-1.5 text-[11px] text-neutral-600">{status}</div>
                ) : null}
              </div>
              <div className="my-1 border-t border-neutral-100" />
            </>
          ) : null}

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full cursor-pointer rounded-[8px] px-3 py-[9px] text-start text-[13px] text-neutral-900 hover:bg-surface-subtle"
          >
            {t('settings')}
          </Link>
          <div className="my-1 border-t border-neutral-100" />
          <LocaleSwitcher onSelect={() => setOpen(false)} />
          {pseudoRtlEnabled ? <ForceRtlToggle initialOn={pseudoRtlOn} /> : null}
          <div className="my-1 border-t border-neutral-100" />
          <form action={signOut} role="none">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-3 py-[9px] text-start text-[13px] font-semibold text-pink hover:bg-surface-subtle"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              {t('signOut')}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
