import 'server-only';

// Notifications for the shell's bell. A notification is a lesson the signed-in
// teacher AUTHORED that has reached an outcome the coordinator decided: it was
// `approved`, or returned with edits (`needs_review`). Everything else (draft
// `in_progress`, `submitted`/pending) is not a notification — it lives in the
// status kanban on the board and is intentionally excluded here.
//
// RLS already scopes `lesson_plans` to rows the user may see; the `created_by`
// filter is an explicit narrowing on top so the bell only ever shows the user's
// OWN lessons (not teammates' plans they can otherwise see). The auth'd,
// cookie-bound client is used throughout — never the service-role key.

import { createClient } from '@/lib/supabase/server';
import type { PlanStatus } from '@/types/lesson';

/** The two outcome statuses that surface as notifications. */
export type NotificationStatus = Extract<PlanStatus, 'approved' | 'needs_review'>;

export interface NotificationItem {
  /** The lesson plan id — the row links to `/plan/{planId}` (the author can edit). */
  planId: string;
  /** `approved` or `needs_review` — drives the status indicator + wording. */
  status: NotificationStatus;
  /** "Year 3" etc., or null on legacy rows with no year. */
  yearLabel: string | null;
  /** A short lesson descriptor (focus area / daily outcome); may be empty. */
  lessonTitle: string;
  /** When the coordinator decided (`reviewed_at`), falling back to `updated_at`. */
  at: string | null;
  /** The coordinator's note when returned; null when approved. */
  reviewNote: string | null;
}

interface PlanRow {
  id: string;
  curriculum_lesson_id: string;
  year: number | null;
  status: NotificationStatus;
  review_note: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
}

/**
 * The signed-in teacher's own lessons that were approved or returned with edits,
 * most-recently-decided first. Returns an empty list when signed out or when none
 * match (the bell then shows no unread dot).
 */
export async function getMyNotifications(): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('lesson_plans')
    .select('id, curriculum_lesson_id, year, status, review_note, reviewed_at, updated_at')
    .eq('created_by', user.id)
    .in('status', ['approved', 'needs_review'])
    .order('reviewed_at', { ascending: false, nullsFirst: false });

  const rows = (data ?? []) as PlanRow[];
  if (rows.length === 0) return [];

  // Resolve a short title per curriculum lesson (curriculum_lesson_id == lesson_key).
  // curriculum_lesson is readable by any authenticated user (curr_read policy).
  const keys = [...new Set(rows.map((r) => r.curriculum_lesson_id).filter(Boolean))];
  const titleByKey = new Map<string, string>();
  if (keys.length > 0) {
    const { data: lessons } = await supabase
      .from('curriculum_lesson')
      .select('lesson_key, daily_outcome, focus_area')
      .in('lesson_key', keys);
    for (const l of (lessons ?? []) as Array<{
      lesson_key: string;
      daily_outcome: string | null;
      focus_area: string | null;
    }>) {
      titleByKey.set(l.lesson_key, (l.focus_area || l.daily_outcome || '').trim());
    }
  }

  return rows.map((r) => ({
    planId: r.id,
    status: r.status,
    yearLabel: r.year == null ? null : `Year ${r.year}`,
    lessonTitle: titleByKey.get(r.curriculum_lesson_id) ?? '',
    at: r.reviewed_at ?? r.updated_at,
    reviewNote: r.status === 'needs_review' ? r.review_note : null,
  }));
}
