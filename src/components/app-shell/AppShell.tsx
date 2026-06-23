import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';
import { TopNav } from '@/components/app-shell/TopNav';
import { UserMenu } from '@/components/app-shell/UserMenu';
import { isAdmin } from '@/lib/auth';

type AppShellProps = {
  /** The signed-in user's display name (full_name, falling back to email). */
  name: string;
  /** Optional second line, e.g. "Shatila Centre · English". */
  subtitle?: string;
  children: ReactNode;
};

/**
 * The shared authenticated shell — the persistent top bar from the design
 * (wordmark + "LESSON PLANNING" lockup, primary nav, global search, notification
 * bell and the signed-in user), wrapping a page body. Flat and border-delineated
 * on white. Search and bell are presentational for now (no backend wired).
 */
export async function AppShell({ name, subtitle, children }: AppShellProps) {
  // The "Admin" nav link is shown only to global admins; the /admin route is
  // independently gated by its layout, so this is presentation only.
  const admin = await isAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex h-16 items-center gap-6 border-b border-border bg-surface px-[30px]">
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

        <TopNav isAdmin={admin} />

        {/* Right cluster: search · bell · user */}
        <div className="ml-auto flex items-center gap-[10px]">
          <GlobalSearch />
          <NotificationBell />
          <UserMenu name={name} subtitle={subtitle} />
        </div>
      </header>

      <main className="flex-1 bg-surface">
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}

/** Presentational global search field (no backend wired yet). */
function GlobalSearch() {
  return (
    <div className="relative hidden sm:block">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#B6ABA0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      <input
        type="search"
        placeholder="Search…"
        aria-label="Search"
        className="w-[170px] rounded-[9px] border border-border bg-surface py-[8px] pl-[33px] pr-3 text-[13px] text-neutral-900 outline-none placeholder:text-text-faint focus:border-teal"
      />
    </div>
  );
}

/** Presentational notification bell with an unread dot (no backend wired yet). */
function NotificationBell() {
  return (
    <button
      type="button"
      aria-label="Notifications"
      className="relative inline-flex size-[38px] items-center justify-center rounded-[9px] border border-border bg-surface transition-colors hover:bg-surface-subtle"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      <span className="absolute right-[9px] top-[8px] size-[7px] rounded-full border-[1.5px] border-white bg-pink" />
    </button>
  );
}
