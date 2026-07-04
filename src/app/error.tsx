'use client';

// Route-segment error boundary for the app (everything under the root layout).
// Until this existed there was NO error boundary, so any throw during a render —
// notably a Server Component throw on a soft navigation — could leave the
// transition uncommitted and a `useLinkStatus` spinner pending forever (a silent
// hang) instead of a visible, recoverable error. This boundary renders inside the
// root layout, so it keeps the NextIntlClientProvider (translations work) and
// offers `reset()` to retry the failed render.
//
// Error visibility by origin:
//   • Server Component throw → in production React/Next strip the message before
//     it reaches the client; this component receives only `error.digest`. The
//     real message + stack are in the Vercel runtime log, correlatable by digest.
//   • Client-side throw → `error` carries the real message + stack, surfaced via
//     console.error below (and shown redacted to the user).

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/ui/Logo';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');

  useEffect(() => {
    // Full client-side error (message + stack) to the browser console. A
    // server-side throw arrives already redacted (digest only), so this is most
    // useful for a throw that happened on the client.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-5 sm:p-10">
      <div className="w-full max-w-[520px] rounded-lg border border-border bg-surface p-10 text-center shadow-card sm:p-12">
        <div className="mb-8 flex justify-center">
          <Logo size="md" />
        </div>
        {/* Non-destructive amber attention chip — a generic error state, not a
            destructive action, so it deliberately avoids the danger red. */}
        <div className="mb-[18px] inline-flex size-[44px] items-center justify-center rounded-[12px] bg-status-progress-bg">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b0651e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </div>
        <h1 className="m-0 text-[22px] font-semibold text-ink">{t('title')}</h1>
        <p className="mx-auto mt-3 mb-[26px] max-w-[420px] text-[14px] leading-[1.6] text-text-muted">
          {t('body')}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-[9px] bg-teal px-[18px] py-[10px] text-[13.5px] font-semibold text-white transition-colors hover:bg-[#1a6a5d]"
        >
          {t('tryAgain')}
        </button>
        {/* Small reference so a user's report can be matched to the server log. */}
        {error.digest ? (
          <p className="mt-[18px] font-mono text-[11px] text-text-faint">
            {t('reference', { digest: error.digest })}
          </p>
        ) : null}
      </div>
    </main>
  );
}
