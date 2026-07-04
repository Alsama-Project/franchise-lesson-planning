'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { LinkPending } from '@/components/ui/LinkPending';
import { usePlanHref } from '@/components/weekly-overview/BoardReturn';

const BASE = 'block rounded-[14px] border border-border bg-surface px-[15px] py-[13px]';

/**
 * The flat lesson card surface shared by the Calendar and Status views — white,
 * 1px border, 12px radius, no shadow. A card with a plan links to the plan: the
 * editable wizard (`/plan/[id]`) when the viewer may edit it, otherwise the
 * read-only view (`/plan/[id]/view`) — a non-creator save would be rejected by
 * RLS. A "Not started" card (no plan id) is handled by the views themselves.
 */
export function CardShell({
  planId,
  canEdit = true,
  readOnly = false,
  children,
}: {
  planId: string | null;
  /** Whether the viewer may edit this plan (creator / coordinator / admin). */
  canEdit?: boolean;
  /**
   * Force the read-only review route regardless of `canEdit`. Set on the
   * coordinator board: a coordinator can edit in-space plans, but their board is a
   * review surface, so cards open `/plan/[id]/view` (where the decision bar lives),
   * not the editor.
   */
  readOnly?: boolean;
  children: ReactNode;
}) {
  // Round-trip the board's current week: a plan opened from a card carries the week
  // in its URL so the plan's "back to overview" returns to the same week.
  const planHref = usePlanHref();
  if (!planId) {
    return <div className={BASE}>{children}</div>;
  }

  const href = planHref(canEdit && !readOnly ? `/plan/${planId}` : `/plan/${planId}/view`);

  return (
    <Link
      href={href}
      // The Status board makes this card a @dnd-kit draggable. Disabling the
      // browser's native link drag-and-drop keeps that pointer drag clean; a
      // plain click still navigates to the plan.
      draggable={false}
      className={cn(BASE, 'relative transition-colors hover:bg-surface-subtle')}
    >
      <LinkPending size={13} className="absolute end-[8px] top-[8px] text-teal" />
      {children}
    </Link>
  );
}
