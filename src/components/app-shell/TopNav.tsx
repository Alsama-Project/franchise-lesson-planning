'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * Primary navigation pills in the shared shell. The active item is derived from
 * the current pathname (teal text on a pale-teal pill). "Lesson Planning" also
 * owns the editor route (`/plan/...`); "Curriculum" is a placeholder stub for now.
 */
const ITEMS = [
  { label: 'Lesson Planning', href: '/', isActive: (p: string) => p === '/' || p.startsWith('/plan') },
  { label: 'Curriculum', href: '/curriculum', isActive: (p: string) => p.startsWith('/curriculum') },
  { label: 'Resources', href: '/resources', isActive: (p: string) => p.startsWith('/resources') },
] as const;

export function TopNav() {
  const pathname = usePathname();

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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
