'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { PSEUDO_RTL_COOKIE } from '@/i18n/config';

/**
 * Dev-only "Force RTL" toggle. Sets/clears the `pseudo_rtl` cookie so the root
 * layout forces `dir="rtl"` while keeping English text — letting RTL be tested
 * before Arabic exists. Rendered only when `ENABLE_PSEUDO_RTL==='true'`.
 *
 * The current state (`initialOn`) is computed server-side and passed in, so the
 * rendered switch is hydration-safe and never needs client-side setState. A
 * `?pseudoRtl=1` / `?pseudoRtl=0` query override is honoured on mount. Both
 * toggling and the override hard-reload, because `dir` is decided server-side.
 */
function writePseudoRtl(on: boolean): void {
  document.cookie = on
    ? `${PSEUDO_RTL_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    : `${PSEUDO_RTL_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function ForceRtlToggle({ initialOn }: { initialOn: boolean }) {
  const t = useTranslations('nav');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('pseudoRtl');
    if (query === '1' || query === '0') {
      const want = query === '1';
      if (want !== initialOn) {
        writePseudoRtl(want);
        window.location.reload();
      }
    }
  }, [initialOn]);

  function toggle() {
    writePseudoRtl(!initialOn);
    window.location.reload();
  }

  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={initialOn}
      onClick={toggle}
      className="flex w-full cursor-pointer items-center justify-between rounded-[8px] px-3 py-[9px] text-start text-[13px] text-neutral-700 hover:bg-surface-subtle"
    >
      <span>{t('forceRtlDev')}</span>
      <span
        aria-hidden
        className={`relative h-[18px] w-[32px] rounded-full transition-colors ${
          initialOn ? 'bg-teal' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`absolute top-[2px] size-[14px] rounded-full bg-white transition-[inset-inline-start] ${
            initialOn ? 'start-[16px]' : 'start-[2px]'
          }`}
        />
      </span>
    </button>
  );
}
