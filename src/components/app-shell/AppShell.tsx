import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';
import { TopNav } from '@/components/app-shell/TopNav';
import { UserMenu } from '@/components/app-shell/UserMenu';
import { NotificationBell } from '@/components/app-shell/NotificationBell';
import { TestUserBar } from '@/components/app-shell/TestUserBar';
import { isAdmin, getMyMemberships } from '@/lib/auth';
import { getMyNotifications } from '@/lib/notifications';
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
 * The bell lists the signed-in teacher's approved / returned lessons
 * (`getMyNotifications`); its unread dot shows only when that list is non-empty.
 */
export async function AppShell({ name, subtitle, children }: AppShellProps) {
  // The "Settings" nav link is shown to admins and coordinators (anyone with
  // console tabs beyond Profile); `/settings` is role-aware, so this is
  // presentation only. Everyone reaches Settings via the avatar menu too.
  const [admin, memberships, impersonation, notifications] = await Promise.all([
    isAdmin(),
    getMyMemberships(),
    getImpersonationState(),
    getMyNotifications(),
  ]);
  const showSettings = admin || memberships.some((m) => m.role === 'coordinator');

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
          aria-label="Alsama — Lesson Planning"
          className="flex items-center gap-[11px] rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          <Wordmark size="sm" tone="brand" className="leading-[0.7]" />
          <span className="h-[22px] w-px bg-neutral-200" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
            Lesson Planning
          </span>
        </Link>

        <TopNav showSettings={showSettings} />

        {/* Right cluster: bell · user */}
        <div className="ml-auto flex items-center gap-[10px]">
          <NotificationBell items={notifications} />
          <UserMenu name={name} subtitle={subtitle} />
        </div>
      </header>

      <main className="flex-1 bg-surface">
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
