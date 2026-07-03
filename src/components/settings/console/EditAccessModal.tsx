'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AdminUser, SubjectSpaceAxes } from '@/lib/console';
import type { MembershipRole } from '@/lib/auth';
import {
  setUserAdmin,
  setUserDeactivated,
  setUserMembership,
  type UsersActionResult,
} from '@/lib/actions/users';
import { avatarColors, initialsOf } from '@/components/weekly-overview/avatar';
import { Checkbox } from './ui';
import { cn } from '@/lib/cn';

// ── icons (inline, matching lucide's paths — no lucide dependency in this app) ──
function ShieldIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}
function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function LockIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const spaceKey = (schoolId: string, subjectId: string) => `${schoolId}:${subjectId}`;

export function EditAccessModal({
  user,
  isSelf,
  otherActiveAdmins,
  axes,
  onClose,
}: {
  user: AdminUser;
  isSelf: boolean;
  /** Active, non-deactivated admins OTHER than this user (from the live list). */
  otherActiveAdmins: number;
  axes: SubjectSpaceAxes;
  onClose: () => void;
}) {
  const t = useTranslations('settings');
  const router = useRouter();

  // Optimistic local state — the UI never waits on the round-trip; a failed write
  // reverts the specific field and shows the server's raised message.
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [isDeactivated, setIsDeactivated] = useState(user.isDeactivated);
  const [spaceRoles, setSpaceRoles] = useState<Map<string, MembershipRole>>(() => {
    const m = new Map<string, MembershipRole>();
    for (const s of user.spaces) {
      if (s.schoolId && s.subjectId) m.set(spaceKey(s.schoolId, s.subjectId), s.role);
    }
    return m;
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const persist = useCallback(
    (optimistic: () => void, revert: () => void, action: () => Promise<UsersActionResult>) => {
      optimistic();
      void (async () => {
        const res = await action();
        if (!res.ok) {
          revert();
          setToast(res.error ?? t('common.somethingWrong'));
        } else {
          router.refresh();
        }
      })();
    },
    [router, t],
  );

  // ── lock logic — mirror exactly what the server (0035) refuses ────────────────
  const isLastActiveAdmin = isAdmin && !isDeactivated && otherActiveAdmins === 0;
  const deactivateLocked = isLastActiveAdmin || isSelf;

  function toggleAdmin(next: boolean) {
    // Toggling admin must NOT touch memberships (that is what makes dim-not-clear
    // correct: the ticks persist so unchecking admin restores them exactly).
    persist(
      () => setIsAdmin(next),
      () => setIsAdmin(!next),
      () => setUserAdmin(user.userId, next),
    );
  }

  function toggleRole(schoolId: string, subjectId: string, role: MembershipRole) {
    const key = spaceKey(schoolId, subjectId);
    const current = spaceRoles.get(key) ?? null;
    // Teacher/Coordinator are mutually exclusive per space: clicking the checked
    // role clears it (→ no membership); clicking the other switches to it.
    const next: MembershipRole | null = current === role ? null : role;
    const write = (value: MembershipRole | null) =>
      setSpaceRoles((prev) => {
        const m = new Map(prev);
        if (value) m.set(key, value);
        else m.delete(key);
        return m;
      });
    persist(
      () => write(next),
      () => write(current),
      () => setUserMembership(user.userId, schoolId, subjectId, next),
    );
  }

  function toggleDeactivated(next: boolean) {
    persist(
      () => setIsDeactivated(next),
      () => setIsDeactivated(!next),
      () => setUserDeactivated(user.userId, next),
    );
  }

  const name = user.fullName ?? user.email ?? '—';
  const { bg: avatarBg, fg: avatarFg } = useMemo(() => avatarColors(user.userId), [user.userId]);

  // ── focus trap + restore ──────────────────────────────────────────────────────
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const focusables = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    (focusables()[0] ?? node)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(34,26,20,.34)' }}
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('users.editAccessFor', { name })}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full flex-col overflow-hidden bg-white outline-none"
        style={{ width: 568, borderRadius: 14, boxShadow: '0 30px 70px -24px rgba(40,28,18,.55)' }}
      >
        {/* ── Header strip ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-[13px] border-b border-[#EFE7DA] bg-[#FCFAF6] px-[22px] py-[16px]">
          <span
            className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            style={{ background: avatarBg, color: avatarFg }}
            aria-hidden
          >
            {initialsOf(name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[8px]">
              <span className="truncate text-[17px] font-semibold text-ink" dir="auto">
                {name}
              </span>
              {isSelf ? (
                <span className="shrink-0 rounded-[5px] bg-[#F3ECE2] px-[6px] py-[2px] text-[9.5px] font-bold tracking-[0.05em] text-[#8A8178]">
                  {t('users.you')}
                </span>
              ) : null}
            </div>
            <div className="truncate text-[12.5px] text-[#A79E94]" dir="ltr">
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 rounded-[8px] p-[6px] text-[#8A8178] transition-colors hover:bg-[#F0EAE1] hover:text-ink"
          >
            <XIcon />
          </button>
        </div>

        {/* ── Body (scrolls) ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-[22px] py-[20px]">
          {/* Global access */}
          <div className="mb-[10px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#B4AA9E]">
            {t('users.globalAccess')}
          </div>
          <div
            className={cn(
              'flex items-center gap-[12px] rounded-[11px] border px-[14px] py-[12px]',
              isAdmin ? 'border-[#CFE6E0] bg-[#F7FBFA]' : 'border-[#E7DECF] bg-white',
            )}
          >
            <Checkbox
              checked={isAdmin}
              locked={isLastActiveAdmin}
              onChange={toggleAdmin}
              aria-label={t('users.adminBadge')}
            />
            <span
              className={cn(
                'inline-flex size-[34px] shrink-0 items-center justify-center rounded-[9px]',
                isAdmin ? 'bg-[#E4F0ED] text-[#186155]' : 'bg-[#F3ECE2] text-[#8A8178]',
              )}
            >
              <ShieldIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">{t('users.adminBadge')}</div>
              <div className={cn('text-[12px]', isAdmin ? 'text-[#186155]' : 'text-[#8A8178]')}>
                {isAdmin ? t('users.orgWide') : t('users.standardAccess')}
              </div>
            </div>
          </div>

          {isLastActiveAdmin ? (
            <div className="mt-[10px] flex items-start gap-[9px] rounded-[10px] border border-[#EDE1D0] bg-[#FBF5EE] px-[13px] py-[10px]">
              <span className="mt-[1px] shrink-0 text-[#B08A4A]">
                <LockIcon />
              </span>
              <span className="text-[12.5px] leading-[1.5] text-[#7A6A4E]">
                {t('users.lastAdminNote')}
              </span>
            </div>
          ) : null}

          {/* Subject spaces */}
          <div className="mb-[10px] mt-[22px] flex items-center gap-[9px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#B4AA9E]">
              {t('users.col.spaces')}
            </span>
            {isAdmin ? (
              <span className="rounded-[6px] bg-[#F3ECE2] px-[8px] py-[2px] text-[10.5px] font-semibold text-[#8A8178]">
                {t('users.notUsedWhileAdmin')}
              </span>
            ) : null}
          </div>

          <div className={cn(isAdmin && 'pointer-events-none opacity-[.42]')} aria-disabled={isAdmin}>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_72px_96px] items-center border-b border-[#F0EAE1] px-[4px] pb-[8px]">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#B4AA9E]">
                {t('users.spaceCol')}
              </span>
              <span className="text-center text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#B4AA9E]">
                {t('roles.teacher')}
              </span>
              <span className="text-center text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#B4AA9E]">
                {t('roles.coordinator')}
              </span>
            </div>

            {axes.centres.length === 0 || axes.subjects.length === 0 ? (
              <div className="px-[4px] py-[20px] text-center text-[12.5px] text-[#A79E94]">
                {t('users.noSpaces')}
              </div>
            ) : (
              axes.centres.map((centre) => (
                <div key={centre.id}>
                  <div className="px-[4px] pb-[5px] pt-[13px] text-[12px] font-semibold text-[#5A524B]" dir="auto">
                    {centre.name}
                  </div>
                  {axes.subjects.map((subject) => {
                    const role = spaceRoles.get(spaceKey(centre.id, subject.id)) ?? null;
                    return (
                      <div
                        key={subject.id}
                        className="grid grid-cols-[1fr_72px_96px] items-center border-b border-[#F0EAE1] px-[4px] py-[9px]"
                      >
                        <span className="text-[13px] text-ink" dir="auto">
                          {subject.name}
                        </span>
                        <span className="flex justify-center">
                          <Checkbox
                            checked={role === 'teacher'}
                            onChange={() => toggleRole(centre.id, subject.id, 'teacher')}
                            aria-label={`${subject.name} · ${centre.name} · ${t('roles.teacher')}`}
                          />
                        </span>
                        <span className="flex justify-center">
                          <Checkbox
                            checked={role === 'coordinator'}
                            onChange={() => toggleRole(centre.id, subject.id, 'coordinator')}
                            aria-label={`${subject.name} · ${centre.name} · ${t('roles.coordinator')}`}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Footer strip ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-[12px] border-t border-[#EFE7DA] bg-[#FCFAF6] px-[22px] py-[14px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#B4AA9E]">
            {t('users.col.status')}
          </span>
          {isDeactivated ? (
            <span className="rounded-[6px] bg-[#F0EAE1] px-[9px] py-[3px] text-[11px] font-bold text-[#9A8C7B]">
              {t('users.status.deactivated')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] text-[12.5px] text-[#5A524B]">
              <span className="size-[7px] rounded-full bg-[#1F7A6C]" />
              {t('users.status.active')}
            </span>
          )}

          <div className="ms-auto flex items-center gap-[9px]">
            {isDeactivated ? (
              <button
                type="button"
                onClick={() => toggleDeactivated(false)}
                className="rounded-[9px] bg-[#1F7A6C] px-[14px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#1a6a5d]"
              >
                {t('users.action.reactivate')}
              </button>
            ) : (
              <span className="group relative">
                <button
                  type="button"
                  onClick={deactivateLocked ? undefined : () => toggleDeactivated(true)}
                  disabled={deactivateLocked}
                  className={cn(
                    'inline-flex items-center gap-[6px] rounded-[9px] border px-[14px] py-[9px] text-[13px] font-semibold transition-colors',
                    deactivateLocked
                      ? 'cursor-not-allowed border-[#E7DECF] text-[#C7BFB5]'
                      : 'border-[#EBC9C2] text-[#B23A2E] hover:bg-[#FBECE8]',
                  )}
                >
                  {deactivateLocked ? <LockIcon size={12} /> : null}
                  {t('users.action.deactivate')}
                </button>
                {deactivateLocked ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+8px)] end-0 z-10 w-[214px] rounded-[8px] bg-[#2A2422] px-[11px] py-[8px] text-[11.5px] leading-[1.5] text-[#F5EFE7] opacity-0 shadow-[0_8px_24px_-8px_rgba(40,30,20,0.5)] transition-opacity group-hover:opacity-100"
                  >
                    {isLastActiveAdmin ? t('users.lastAdminNote') : t('users.selfDeactivateNote')}
                  </span>
                ) : null}
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-[9px] bg-[#1F7A6C] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#1a6a5d]"
            >
              {t('users.done')}
            </button>
          </div>
        </div>
      </div>

      {/* Error toast */}
      {toast ? (
        <div className="fixed bottom-[20px] left-1/2 z-[120] -translate-x-1/2 rounded-[10px] bg-[#B23A2E] px-[16px] py-[10px] text-[13px] font-medium text-white shadow-card">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
