'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { signOut } from '@/lib/actions/auth';
import { setLocale } from '@/app/actions/locale';
import { setPseudoRtl } from '@/app/actions/pseudo-rtl';
import { enabledLocales, type Locale } from '@/i18n/config';

/** Native names for each locale — always shown in their own script. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

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
export function UserMenu({
  name,
  subtitle,
  pseudoRtlEnabled = false,
  pseudoRtlActive = false,
}: {
  name: string;
  subtitle?: string;
  /** Dev: whether the "Force RTL" toggle is available (ENABLE_PSEUDO_RTL). */
  pseudoRtlEnabled?: boolean;
  /** Dev: whether pseudo-RTL is currently on. */
  pseudoRtlActive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const t = useTranslations('common');

  // Persist the chosen locale, then hard-reload so the root layout re-evaluates
  // <html lang>/dir (router.refresh alone would not re-render <html>).
  async function chooseLocale(next: Locale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    await setLocale(next);
    window.location.reload();
  }

  // Dev: flip pseudo-RTL, then hard-reload so <html dir> re-evaluates.
  async function togglePseudoRtl() {
    await setPseudoRtl(!pseudoRtlActive);
    window.location.reload();
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
          className="absolute end-0 top-[50px] z-20 w-[232px] rounded-[12px] border border-border bg-surface p-[6px] shadow-card"
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
            className="block w-full cursor-pointer rounded-[8px] px-3 py-[9px] text-start text-[13px] text-neutral-900 hover:bg-surface-subtle"
          >
            {t('settings')}
          </Link>

          {/* Language switcher — renders only the enabled locales. Arabic is
              switched on (added to enabledLocales) in its own branch. */}
          <div className="mt-[2px] border-t border-neutral-100 pt-[6px]">
            <div className="px-3 pb-[4px] pt-[2px] text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-500">
              {t('language')}
            </div>
            {enabledLocales.map((loc) => {
              const active = loc === locale;
              return (
                <button
                  key={loc}
                  type="button"
                  role="menuitem"
                  onClick={() => chooseLocale(loc)}
                  aria-current={active ? 'true' : undefined}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[8px] px-3 py-[9px] text-start text-[13px] text-neutral-900 hover:bg-surface-subtle"
                >
                  <span>{LOCALE_LABELS[loc]}</span>
                  {active ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-teal" aria-hidden>
                      <path d="M5 12l4 4 10-11" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>

          {pseudoRtlEnabled ? (
            <div className="mt-[2px] border-t border-neutral-100 pt-[6px]">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={pseudoRtlActive}
                onClick={togglePseudoRtl}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[8px] px-3 py-[9px] text-start text-[13px] text-neutral-700 hover:bg-surface-subtle"
              >
                <span>{t('forceRtlDev')}</span>
                <span
                  aria-hidden
                  className={`inline-flex h-[18px] w-[30px] items-center rounded-full px-[2px] transition-colors ${
                    pseudoRtlActive ? 'justify-end bg-teal' : 'justify-start bg-neutral-300'
                  }`}
                >
                  <span className="size-[14px] rounded-full bg-white" />
                </span>
              </button>
            </div>
          ) : null}

          <form action={signOut} role="none">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-3 py-[9px] text-start text-[13px] font-semibold text-pink hover:bg-surface-subtle"
            >
              {/* Reading-order (door → arrow-out) icon: mirror it in RTL so the
                  arrow still points "out". Flip at the use-site, not the def. */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
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
