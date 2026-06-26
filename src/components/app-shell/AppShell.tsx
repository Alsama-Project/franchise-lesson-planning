import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { PSEUDO_RTL_COOKIE } from '@/i18n/config';
import { Wordmark } from '@/components/ui/Wordmark';
import { TopNav } from '@/components/app-shell/TopNav';
import { UserMenu } from '@/components/app-shell/UserMenu';
import { TestUserBar } from '@/components/app-shell/TestUserBar';
import { isAdmin, getMyMemberships } from '@/lib/auth';
import { getImpersonationState } from '@/lib/test-impersonation';

type AppShellProps = {
  /** The signed-in user's display name (full_name, falling back to email). */
  name: string;
  /** Optional second line, e.g. "Shatila Centre · English". */
  subtitle?: string;
  children: ReactNode;
};

/**
 * The shared authenticated shell — the persistent top bar from the design
 * (wordmark + "LESSON PLANNING" lockup, primary nav, notification bell and the
 * signed-in user), wrapping a page body. Flat and border-delineated on white.
 * The bell is presentational for now (no backend wired).
 */
export async function AppShell({ name, subtitle, children }: AppShellProps) {
  // The "Settings" nav link is shown to admins and coordinators (anyone with
  // console tabs beyond Profile); `/settings` is role-aware, so this is
  // presentation only. Everyone reaches Settings via the avatar menu too.
  const [admin, memberships, impersonation] = await Promise.all([
    isAdmin(),
    getMyMemberships(),
    getImpersonationState(),
  ]);
  const showSettings = admin || memberships.some((m) => m.role === 'coordinator');

  // Dev-only RTL preview toggle, surfaced in the user menu. Gated on an explicit
  // flag (NOT NODE_ENV) so it can be exercised in production, which doubles as
  // the test environment.
  const pseudoRtlEnabled = process.env.ENABLE_PSEUDO_RTL === 'true';
  const pseudoRtlOn =
    pseudoRtlEnabled &&
    (await cookies()).get(PSEUDO_RTL_COOKIE)?.value === '1';

  const t = await getTranslations('nav');

  return (
    <div className="flex min-h-screen flex-col">
      {impersonation.active ? (
        <TestUserBar
          impersonating={impersonation.impersonating}
          currentRole={impersonation.currentRole}
        />
      ) : null}

      {/* The shell header sticks just below the test bar when it is present, so
          neither occludes the other; otherwise it sticks to the very top. */}
      <header
        className={`sticky z-50 flex h-16 items-center gap-6 border-b border-border bg-surface px-[30px] ${
          impersonation.active ? 'top-10' : 'top-0'
        }`}
      >
        {/* Brand — links home to the Weekly Overview */}
        <Link
          href="/"
          aria-label={t('brandAria')}
          className="flex items-center gap-[11px] rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          <Wordmark size="sm" tone="brand" className="leading-[0.7]" />
          <span className="h-[22px] w-px bg-neutral-200" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
            {t('lockup')}
          </span>
        </Link>

        <TopNav showSettings={showSettings} />

        {/* Right cluster: bell · user */}
        <div className="ms-auto flex items-center gap-[10px]">
          <NotificationBell label={t('notifications')} />
          <UserMenu
            name={name}
            subtitle={subtitle}
            pseudoRtlEnabled={pseudoRtlEnabled}
            pseudoRtlOn={pseudoRtlOn}
          />
        </div>
      </header>

      <main className="flex-1 bg-surface">
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}

/** Presentational notification bell with an unread dot (no backend wired yet). */
function NotificationBell({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="relative inline-flex size-[38px] items-center justify-center rounded-[9px] border border-border bg-surface transition-colors hover:bg-surface-subtle"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      <span className="absolute end-[9px] top-[8px] size-[7px] rounded-full border-[1.5px] border-white bg-pink" />
    </button>
  );
}
