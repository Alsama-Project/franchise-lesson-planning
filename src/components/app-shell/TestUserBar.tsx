'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import type { ToggleRole } from '@/lib/test-roles';

type TestUserBarProps = {
  /** Whether a real session is stashed (we are currently viewing-as). */
  impersonating: boolean;
  /** Toggle roles this caller may enter: admin → both; eligible non-admin → teacher only. */
  availableRoles: ToggleRole[];
  /** The toggle role currently being viewed, when impersonating. */
  currentRole?: ToggleRole;
};

/**
 * Dev/preview-only TEST MODE bar. Lets an eligible tester step into a fixed
 * canonical persona by ROLE — a two-state segmented toggle `[ Teacher | Coordinator ]`
 * for an admin caller, or a single "View as Teacher" affordance for an eligible
 * non-admin (who is caller-scoped to teacher only). This is a faithful, RLS-scoped
 * impersonation, not a cosmetic toggle: each switch swaps the real Supabase session
 * server-side, then we refresh so data re-loads as that persona.
 *
 * It only ever sends a toggle role to `POST /api/test-impersonate`; the server
 * resolves the role to a fixed persona and re-validates caller-scope in the
 * database definer (`resolve_impersonation_persona`) — no persona uid or email ever
 * reaches the client. Whether this renders at all, and which roles it may offer, is
 * decided server-side (see getImpersonationState); it is never shown in production
 * for real users.
 *
 * Colour is chrome: cream surface + teal TEST MODE marker and teal/neutral toggle.
 * Pink is reserved for editable content zones and is deliberately NOT used here to
 * signify the teacher role.
 */
export function TestUserBar({ impersonating, availableRoles, currentRole }: TestUserBarProps) {
  const router = useRouter();
  const t = useTranslations('testBar');
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabels: Record<ToggleRole, string> = {
    teacher: t('roleTeacher'),
    coordinator: t('roleCoordinator'),
  };

  async function post(payload: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/test-impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // The route returns { ok:false, stage, message } with a secret-free
        // reason; surface it so failures are diagnosable. Fall back if absent.
        let detail = t('switchFailed');
        try {
          const data = (await res.json()) as { stage?: unknown; message?: unknown };
          if (typeof data?.stage === 'string' && typeof data?.message === 'string') {
            detail = `${data.stage}: ${data.message}`;
          }
        } catch {
          // Non-JSON body; keep the generic message.
        }
        setError(detail);
        setBusy(false);
        return;
      }
      // A clean fallback (e.g. the real session expired while impersonating) asks
      // us to send the user to normal login rather than surfacing an error.
      let redirectTo: string | null = null;
      try {
        const data = (await res.json()) as { redirectTo?: unknown };
        if (typeof data?.redirectTo === 'string') redirectTo = data.redirectTo;
      } catch {
        // No / non-JSON body — just refresh in place.
      }
      // Cookies are now swapped; refresh so server components re-read the session
      // and RLS-scoped data re-loads as the new user (or go to login on fallback).
      startTransition(() => {
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
        setBusy(false);
      });
    } catch {
      setError(t('switchFailed'));
      setBusy(false);
    }
  }

  const disabled = isPending || busy;
  const viewing = impersonating && currentRole ? roleLabels[currentRole] : t('yourAccount');
  const isToggle = availableRoles.length > 1;

  return (
    <div className="sticky top-0 z-[60] flex h-10 items-center gap-3 border-b border-border-strong bg-surface-cream px-[30px] text-[12.5px]">
      <span className="inline-flex items-center gap-1.5 rounded-badge bg-teal px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
        <span className="size-[6px] rounded-full bg-white/90" aria-hidden />
        {t('testMode')}
      </span>

      <span className="text-neutral-700">
        {t('viewingAs')}{' '}
        <span className="font-semibold text-ink" dir="auto">
          {viewing}
        </span>
      </span>

      <div className="ml-auto flex items-center gap-2">
        {isToggle ? (
          // Admin caller: a two-state segmented toggle. The active segment (the
          // role currently being viewed) is filled teal; the other switches on click.
          <div
            role="group"
            aria-label={t('viewAs', { role: '' }).trim()}
            className="inline-flex items-center rounded-sm border border-teal/40 bg-surface p-0.5"
          >
            {availableRoles.map((role) => {
              const active = impersonating && currentRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  disabled={disabled || active}
                  aria-pressed={active}
                  onClick={() => post({ role })}
                  className={cn(
                    'rounded-[3px] px-[12px] py-[3px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40',
                    active
                      ? 'bg-teal text-white'
                      : 'text-teal hover:bg-teal-tint disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {roleLabels[role]}
                </button>
              );
            })}
          </div>
        ) : (
          // Eligible non-admin: a single "View as Teacher" affordance (caller-scoped
          // to teacher — the coordinator state is unreachable, enforced server-side).
          availableRoles.map((role) => {
            const active = impersonating && currentRole === role;
            return (
              <button
                key={role}
                type="button"
                disabled={disabled || active}
                onClick={() => post({ role })}
                className={cn(
                  'rounded-sm border px-[10px] py-[4px] font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-1',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  'border-teal/40 bg-surface text-teal hover:bg-teal-tint',
                )}
              >
                {t('viewAs', { role: roleLabels[role] })}
              </button>
            );
          })
        )}

        {impersonating ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => post({ action: 'return' })}
            className={cn(
              'ml-1.5 rounded-sm border border-border-strong bg-surface px-[10px] py-[4px] font-semibold text-neutral-800 transition-colors',
              'hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-1',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {t('returnToAccount')}
          </button>
        ) : null}

        {error ? <span className="ml-2 font-medium text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
