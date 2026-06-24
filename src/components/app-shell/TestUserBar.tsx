'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { TEST_ROLES, type TestRole } from '@/lib/test-roles';

const ROLE_LABELS: Record<TestRole, string> = {
  teacher: 'Teacher',
  coordinator: 'Coordinator',
  admin: 'Admin',
};

type TestUserBarProps = {
  /** Whether a real session is stashed (we are currently viewing-as). */
  impersonating: boolean;
  /** The role currently being viewed, when impersonating. */
  currentRole: TestRole | null;
};

/**
 * Dev/preview-only TEST MODE bar. Lets an allowlisted admin view the app as one
 * of three seeded test users — a faithful, RLS-scoped impersonation, not a
 * cosmetic toggle: each switch swaps the real Supabase session server-side, then
 * we refresh so data re-loads as that user.
 *
 * It only ever sends a role KEY to `POST /api/test-impersonate`; the server maps
 * it to a UID and does all gating. Whether this renders at all is decided
 * server-side (see getImpersonationState); it is never shown in production.
 *
 * Colour is semantic: cream surface + pink TEST MODE marker so it reads as an
 * unmistakable, not-normal-chrome affordance; teal for the switch actions.
 */
export function TestUserBar({ impersonating, currentRole }: TestUserBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyRole, setBusyRole] = useState<TestRole | 'return' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>, busy: TestRole | 'return') {
    setError(null);
    setBusyRole(busy);
    try {
      const res = await fetch('/api/test-impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // The route returns { ok:false, stage, message } with a secret-free
        // reason; surface it so failures are diagnosable. Fall back if absent.
        let detail = 'Switch failed';
        try {
          const data = (await res.json()) as { stage?: unknown; message?: unknown };
          if (typeof data?.stage === 'string' && typeof data?.message === 'string') {
            detail = `${data.stage}: ${data.message}`;
          }
        } catch {
          // Non-JSON body; keep the generic message.
        }
        setError(detail);
        setBusyRole(null);
        return;
      }
      // Cookies are now swapped; refresh so server components re-read the session
      // and RLS-scoped data re-loads as the new user.
      startTransition(() => {
        router.refresh();
        setBusyRole(null);
      });
    } catch {
      setError('Switch failed');
      setBusyRole(null);
    }
  }

  const viewing = impersonating && currentRole ? ROLE_LABELS[currentRole] : 'your account';
  const busy = isPending || busyRole !== null;

  return (
    <div className="sticky top-0 z-[60] flex h-10 items-center gap-3 border-b border-pink/40 bg-surface-cream px-[30px] text-[12.5px]">
      <span className="inline-flex items-center gap-1.5 rounded-badge bg-pink px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
        <span className="size-[6px] rounded-full bg-white/90" aria-hidden />
        Test mode
      </span>

      <span className="text-neutral-700">
        Viewing as: <span className="font-semibold text-ink">{viewing}</span>
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="mr-1 hidden text-neutral-600 sm:inline">Switch role</span>
        {TEST_ROLES.map((role) => {
          const active = impersonating && currentRole === role;
          return (
            <button
              key={role}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => post({ role }, role)}
              className={cn(
                'rounded-sm border px-[10px] py-[4px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-1',
                'disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'border-teal bg-teal text-white'
                  : 'border-teal/40 bg-surface text-teal hover:bg-teal-tint',
              )}
            >
              {ROLE_LABELS[role]}
            </button>
          );
        })}

        {impersonating ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => post({ action: 'return' }, 'return')}
            className={cn(
              'ml-1.5 rounded-sm border border-border-strong bg-surface px-[10px] py-[4px] font-semibold text-neutral-800 transition-colors',
              'hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-1',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            Return to my account
          </button>
        ) : null}

        {error ? <span className="ml-2 font-medium text-pink">{error}</span> : null}
      </div>
    </div>
  );
}
