'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

type NavItem = {
  /** Key into the `nav` message namespace. */
  key: string;
  href: string;
  isActive: (p: string) => boolean;
};

/**
 * Primary navigation pills in the shared shell. The active item is derived from
 * the current pathname (teal text on a pale-teal pill). "Lesson Planning" also
 * owns the editor route (`/plan/...`); "Curriculum" is the read-only browse view.
 */
const ITEMS: NavItem[] = [
  { key: 'lessonPlanning', href: '/', isActive: (p) => p === '/' || p.startsWith('/plan') },
  { key: 'curriculum', href: '/curriculum', isActive: (p) => p.startsWith('/curriculum') },
  { key: 'resources', href: '/resources', isActive: (p) => p.startsWith('/resources') },
];

// Settings is intentionally NOT a primary nav pill — it is reached through the
// avatar menu (UserMenu), which every role can open. Keeping it out of the top
// nav declutters the bar without stranding any role.

export function TopNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-[9px] px-[14px] py-[8px] text-[13.5px] transition-colors',
              active
                ? 'bg-teal-tint font-semibold text-teal-deep'
                : 'font-medium text-neutral-900 hover:bg-surface-subtle',
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
