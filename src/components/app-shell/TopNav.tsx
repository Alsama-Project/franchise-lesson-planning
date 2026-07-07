'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/**
 * Primary navigation pills in the shared shell. The active item is derived from the
 * current pathname (teal text on a pale-teal pill). "Lesson Planning" also owns the editor
 * route (`/plan/...`); "Curriculum" is the read-only browse view.
 *
 * The Curriculum pill is a SPLIT BUTTON for admins (`canSeeInsights`): the label still
 * navigates straight to the Explorer (high-traffic — no extra click for non-admins, who
 * get a plain pill), while a caret opens a small dropdown of curriculum surfaces —
 * "Browser" (the Explorer, same destination as the label) and the admin-only "Insights",
 * with room for more. Coordinators and teachers never see the caret, and
 * `/curriculum/insights` redirects them regardless.
 */
export function TopNav({ canSeeInsights = false }: { canSeeInsights?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  const lessonActive = pathname === '/' || pathname.startsWith('/plan');
  const curriculumActive = pathname.startsWith('/curriculum');
  const resourcesActive = pathname.startsWith('/resources');

  return (
    <nav className="flex items-center gap-1">
      <NavPill href="/" active={lessonActive} label={t('lessonPlanning')} />
      {canSeeInsights ? (
        <CurriculumSplit
          active={curriculumActive}
          label={t('curriculum')}
          menuLabel={t('curriculumMenu')}
          browserLabel={t('browser')}
          insightsLabel={t('insights')}
        />
      ) : (
        <NavPill href="/curriculum" active={curriculumActive} label={t('curriculum')} />
      )}
      <NavPill href="/resources" active={resourcesActive} label={t('resources')} />
    </nav>
  );
}

// Settings is intentionally NOT a primary nav pill — it is reached through the avatar menu
// (UserMenu), which every role can open. Keeping it out of the top nav declutters the bar
// without stranding any role.

function NavPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-[9px] px-[14px] py-[8px] text-[13.5px] transition-colors',
        active
          ? 'bg-teal-tint font-semibold text-teal-deep'
          : 'font-medium text-neutral-900 hover:bg-surface-subtle',
      )}
    >
      {label}
    </Link>
  );
}

function CurriculumSplit({
  active,
  label,
  menuLabel,
  browserLabel,
  insightsLabel,
}: {
  active: boolean;
  label: string;
  menuLabel: string;
  browserLabel: string;
  insightsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          'flex items-center rounded-[9px] text-[13.5px] transition-colors',
          active ? 'bg-teal-tint text-teal-deep' : 'text-neutral-900',
        )}
      >
        <Link
          href="/curriculum"
          aria-current={active ? 'page' : undefined}
          className={cn(
            'rounded-s-[9px] py-[8px] pe-[9px] ps-[14px] transition-colors',
            active ? 'font-semibold' : 'font-medium hover:bg-surface-subtle',
          )}
        >
          {label}
        </Link>
        <span className="h-[16px] w-px bg-current opacity-20" aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            'flex items-center rounded-e-[9px] py-[8px] pe-[10px] ps-[7px] transition-colors',
            active ? '' : 'hover:bg-surface-subtle',
          )}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={cn('transition-transform', open && 'rotate-180')}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+6px)] z-50 min-w-[184px] overflow-hidden rounded-[11px] border border-border bg-surface py-[5px] shadow-card"
        >
          <Link
            role="menuitem"
            href="/curriculum"
            onClick={() => setOpen(false)}
            className="flex items-center px-[12px] py-[9px] text-[13px] font-medium text-neutral-900 transition-colors hover:bg-surface-subtle"
          >
            {browserLabel}
          </Link>
          <Link
            role="menuitem"
            href="/curriculum/insights"
            onClick={() => setOpen(false)}
            className="flex items-center px-[12px] py-[9px] text-[13px] font-medium text-neutral-900 transition-colors hover:bg-surface-subtle"
          >
            {insightsLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
