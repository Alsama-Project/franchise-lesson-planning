'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AdminUser, SubjectSpaceAxes } from '@/lib/console';
import {
  setUserAccess,
  setUserDeactivated,
  type AccessRole,
  type UsersActionResult,
} from '@/lib/actions/users';
import { avatarColors, initialsOf } from '@/components/weekly-overview/avatar';
import { cn } from '@/lib/cn';

// ── icons (inline, matching lucide's paths — no lucide dependency in this app) ──
// Role-tile glyphs use the exact paths from the design spec.
function TeacherIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5" />
    </svg>
  );
}
function CoordinatorIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function CheckMark() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const ROLE_ICON: Record<AccessRole, (props: { size?: number }) => ReactElement> = {
  teacher: TeacherIcon,
  coordinator: CoordinatorIcon,
  admin: ShieldIcon,
};

/** Derive the single access role to show from the user's current data. */
function deriveRole(user: AdminUser): AccessRole {
  if (user.isAdmin) return 'admin';
  if (user.spaces.some((s) => s.role === 'coordinator')) return 'coordinator';
  return 'teacher';
}

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
  // reverts the specific field and shows the server's raised message. The role and
  // the two chip groups are the desired access; each change reconciles the whole
  // set via setUserAccess (persist-on-the-spot).
  const initialRole = useMemo(() => deriveRole(user), [user]);
  const [role, setRole] = useState<AccessRole>(initialRole);
  const [schoolIds, setSchoolIds] = useState<Set<string>>(
    () => new Set(user.spaces.filter((s) => s.role === 'teacher' && s.schoolId).map((s) => s.schoolId!)),
  );
  const [subjectIds, setSubjectIds] = useState<Set<string>>(() => {
    const src: 'teacher' | 'coordinator' = initialRole === 'coordinator' ? 'coordinator' : 'teacher';
    return new Set(user.spaces.filter((s) => s.role === src && s.subjectId).map((s) => s.subjectId!));
  });
  const [isDeactivated, setIsDeactivated] = useState(user.isDeactivated);
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

  const isAdmin = role === 'admin';

  // ── lock logic — mirror exactly what the server (0035) refuses ────────────────
  const isLastActiveAdmin = isAdmin && !isDeactivated && otherActiveAdmins === 0;
  const roleLocked = isLastActiveAdmin; // whole selector locks to Admin
  const deactivateLocked = isLastActiveAdmin || isSelf;

  const commit = useCallback(
    (nextRole: AccessRole, nextSchools: Set<string>, nextSubjects: Set<string>) =>
      setUserAccess(user.userId, {
        role: nextRole,
        schoolIds: [...nextSchools],
        subjectIds: [...nextSubjects],
      }),
    [user.userId],
  );

  function selectRole(next: AccessRole) {
    if (next === role || roleLocked) return;
    const prev = role;
    persist(
      () => setRole(next),
      () => setRole(prev),
      () => commit(next, schoolIds, subjectIds),
    );
  }

  function toggleSchool(id: string) {
    const next = new Set(schoolIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(
      () => setSchoolIds(next),
      () => setSchoolIds(schoolIds),
      () => commit(role, next, subjectIds),
    );
  }

  function toggleSubject(id: string) {
    const next = new Set(subjectIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(
      () => setSubjectIds(next),
      () => setSubjectIds(subjectIds),
      () => commit(role, schoolIds, next),
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

  const roleOptions: Array<{ value: AccessRole; label: string }> = [
    { value: 'teacher', label: t('roles.teacher') },
    { value: 'coordinator', label: t('roles.coordinator') },
    { value: 'admin', label: t('users.adminBadge') },
  ];

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
          {/* Role selector */}
          <div className="mb-[10px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">
            {t('users.role')}
          </div>
          <div
            role="radiogroup"
            aria-label={t('users.role')}
            className={cn('flex flex-col gap-[8px]', roleLocked && 'pointer-events-none opacity-[.55]')}
          >
            {roleOptions.map(({ value, label }) => {
              const selected = role === value;
              const Icon = ROLE_ICON[value];
              const showLock = roleLocked && value === 'admin';
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={roleLocked}
                  onClick={() => selectRole(value)}
                  className={cn(
                    'flex w-full items-center gap-[12px] rounded-[11px] border px-[14px] py-[11px] text-start transition-colors',
                    selected ? 'border-[#CFE6E0] bg-[#F7FBFA]' : 'border-[#E7DECF] bg-white',
                    roleLocked ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors',
                      selected ? 'border-transparent bg-[#1F7A6C]' : 'border-[#CBBFB0] bg-white',
                    )}
                  >
                    {selected ? <span className="size-[6px] rounded-full bg-white" /> : null}
                  </span>
                  <span
                    className={cn(
                      'inline-flex size-[30px] shrink-0 items-center justify-center rounded-[8px]',
                      selected ? 'bg-[#E4F0ED] text-[#186155]' : 'bg-[#F3ECE2] text-[#A79E94]',
                    )}
                  >
                    <Icon />
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{label}</span>
                  {showLock ? (
                    <span className="shrink-0 text-[#B08A4A]">
                      <LockIcon />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {roleLocked ? (
            <div className="mt-[10px] flex items-start gap-[9px] rounded-[10px] border border-[#EDE1D0] bg-[#FBF5EE] px-[13px] py-[10px]">
              <span className="mt-[1px] shrink-0 text-[#B08A4A]">
                <LockIcon />
              </span>
              <span className="text-[12.5px] leading-[1.5] text-[#7A6A4E]">
                {t('users.lastAdminRoleNote')}
              </span>
            </div>
          ) : null}

          {/* Conditional selectors */}
          {role === 'teacher' ? (
            <ChipGroup
              className="mt-[24px]"
              label={t('users.schools')}
              items={axes.centres}
              selected={schoolIds}
              onToggle={toggleSchool}
              emptyLabel={t('users.noSchools')}
            />
          ) : null}

          {role === 'teacher' || role === 'coordinator' ? (
            <ChipGroup
              className="mt-[24px]"
              label={t('users.subjects')}
              items={axes.subjects}
              selected={subjectIds}
              onToggle={toggleSubject}
              emptyLabel={t('users.noSubjects')}
              hint={role === 'coordinator' ? t('users.coordinatorAllSchools') : undefined}
            />
          ) : null}

          {role === 'admin' ? (
            <div className="mt-[24px] flex items-center gap-[12px] rounded-[11px] border border-[#CFE6E0] bg-[#F7FBFA] px-[15px] py-[14px]">
              <span className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#E4F0ED] text-[#186155]">
                <ShieldIcon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-[#3A332E]">{t('users.orgWide')}</div>
                <div className="text-[12px] text-[#8A8178]">{t('users.orgWideNote')}</div>
              </div>
            </div>
          ) : null}
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

// ── chip group (schools / subjects) ─────────────────────────────────────────────
function ChipGroup({
  className,
  label,
  hint,
  items,
  selected,
  onToggle,
  emptyLabel,
}: {
  className?: string;
  label: string;
  hint?: string;
  items: Array<{ id: string; name: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className={className}>
      <div className="mb-[10px] flex items-baseline gap-[9px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A79E94]">{label}</span>
        {hint ? <span className="text-[11.5px] font-medium text-[#A79E94]">{hint}</span> : null}
      </div>
      {items.length === 0 ? (
        <div className="text-[12.5px] text-[#A79E94]">{emptyLabel}</div>
      ) : (
        <div className="flex flex-wrap gap-[8px]">
          {items.map((item) => {
            const checked = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={item.name}
                onClick={() => onToggle(item.id)}
                className={cn(
                  'inline-flex items-center gap-[9px] rounded-[9px] border px-[13px] py-[8px] text-[13.5px] transition-colors',
                  checked
                    ? 'border-[#1F7A6C] bg-[#F7FBFA] font-semibold text-[#186155]'
                    : 'border-[#E0D6C7] bg-white font-medium text-[#5A524B]',
                )}
              >
                <span
                  className={cn(
                    'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors',
                    checked ? 'border-[#1F7A6C] bg-[#1F7A6C]' : 'border-[#CBBFB0] bg-white',
                  )}
                >
                  {checked ? <CheckMark /> : null}
                </span>
                <span dir="auto">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
