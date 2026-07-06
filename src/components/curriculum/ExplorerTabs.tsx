'use client';

// The Curriculum Explorer tab bar: Calendar · Logic tree · Topics · Search.
// A thin chrome row above the active tab body (passed as `children`). Each tab is a
// link that preserves the resolved subject + year in the URL, so subject/year chosen
// in one tab's own selector row carries across tabs.
//
// GATING. The Logic tree binds to the outcome taxonomy, which exists for only some
// subjects. When the current subject has no well-formed taxonomy, the tab is rendered
// DISABLED with a reason (never a calendar-shaped fallback tree). Search is a
// deliberately inert slot — a separate in-flight slice owns it.

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export type ExplorerTab = 'calendar' | 'tree' | 'topics' | 'search';

export function ExplorerTabs({
  tab,
  subjectCode,
  subjectName,
  year,
  logicTreeEnabled,
  children,
}: {
  tab: ExplorerTab;
  subjectCode: string;
  subjectName: string;
  year: number;
  /** False when the subject's taxonomy coverage is below the threshold. */
  logicTreeEnabled: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations('curriculum');

  const hrefFor = (next: ExplorerTab) => {
    const sp = new URLSearchParams();
    sp.set('tab', next);
    sp.set('subject', subjectCode);
    sp.set('year', String(year));
    return `/curriculum?${sp.toString()}`;
  };

  return (
    <div className="rounded-[18px] border border-border bg-surface shadow-card">
      <div className="flex gap-[28px] overflow-x-auto border-b border-border px-[26px]">
        <TabLink href={hrefFor('calendar')} active={tab === 'calendar'} label={t('tabs.calendar')} icon={<CalendarIcon />} />
        <TabLink
          href={hrefFor('tree')}
          active={tab === 'tree'}
          label={t('tabs.logicTree')}
          icon={<TreeIcon />}
          disabled={!logicTreeEnabled}
          disabledReason={t('tabs.logicTreeDisabled', { subject: subjectName })}
        />
        <TabLink href={hrefFor('topics')} active={tab === 'topics'} label={t('tabs.topics')} icon={<TopicsIcon />} />
        <TabLink href={hrefFor('search')} active={tab === 'search'} label={t('tabs.search')} icon={<SearchIcon />} />
      </div>
      {children}
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  icon,
  disabled = false,
  disabledReason,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const inner = (
    <span className="relative flex items-center gap-[7px] py-[15px] text-[15px] font-medium">
      {icon}
      {label}
      {active ? (
        <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-[2px] bg-teal" />
      ) : null}
    </span>
  );

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title={disabledReason}
        className="flex cursor-not-allowed items-center text-text-faint opacity-60"
      >
        {inner}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center text-ink transition-colors hover:text-teal',
        active && 'text-ink',
      )}
    >
      {inner}
    </Link>
  );
}

// ── Icons (ported from the mock) ────────────────────────────────────────────────────

const iconProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function CalendarIcon() {
  return (
    <svg {...iconProps} className="text-[#6C6259]">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 4v16" />
    </svg>
  );
}
function TreeIcon() {
  return (
    <svg {...iconProps} className="text-[#6C6259]">
      <path d="M9 4h6v4H9zM4 16h6v4H4zM14 16h6v4h-6zM12 8v4M7 16v-4h10v4" />
    </svg>
  );
}
function TopicsIcon() {
  return (
    <svg {...iconProps} className="text-[#6C6259]">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg {...iconProps} className="text-[#6C6259]">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
