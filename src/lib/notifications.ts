import 'server-only';

// Notifications for the shell's bell. The bell is DERIVED FROM PLAN STATE — there
// is no notifications table and no per-row read/unread state. Two directions feed
// the same list, mirroring the two halves of the review workflow:
//
//  • OUTCOME (teacher-facing) — a lesson the signed-in user AUTHORED that the
//    coordinator decided on: `approved`, or returned with edits (`needs_review`).
//    Reads `reviewed_at`; links to `/plan/{id}` (the author can edit). Unchanged.
//
//  • REVIEW (coordinator-facing) — a lesson awaiting THIS user's review: a
//    `submitted` plan in a (centre, subject) space they COORDINATE. It appears on
//    submit and clears itself when the plan leaves `submitted` (the coordinator
//    approves or returns it), so it needs no read-state and doubles as a live
//    review-queue badge. Reads `submitted_at`; links to `/plan/{id}/view` (review).
//
// Everything else (draft `in_progress`, a teacher's own `submitted`/pending) is
// not a notification. RLS already scopes `lesson_plans` to rows the user may see;
// the explicit `created_by` / coordinator-space filters narrow on top of that. The
// auth'd, cookie-bound client is used throughout — never the service-role key.

import { createClient } from '@/lib/supabase/server';
import { getMyMemberships } from '@/lib/auth';
import type { PlanStatus } from '@/types/lesson';

/** The two outcome statuses that surface as teacher-facing notifications. */
export type NotificationStatus = Extract<PlanStatus, 'approved' | 'needs_review'>;

interface NotificationBase {
  /** Stable list key (`kind:planId`); a plan can only ever be in one feed at a time. */
  key: string;
  /** The lesson plan id. */
  planId: string;
  /** Where the row navigates — editor for outcomes, review view for review items. */
  href: string;
  /** The timestamp driving ordering + the relative line (most-recent first). */
  at: string | null;
}

/** A teacher's OWN lesson that was approved or returned with edits. */
export interface OutcomeNotification extends NotificationBase {
  kind: 'outcome';
  /** `approved` or `needs_review` — drives the status chip + wording. */
  status: NotificationStatus;
  /** "Year 3" etc., or null on legacy rows with no year. */
  yearLabel: string | null;
  /** A short lesson descriptor (focus area / daily outcome); may be empty. */
  lessonTitle: string;
  /** The coordinator's note when returned; null when approved. */
  reviewNote: string | null;
}

/** A `submitted` plan awaiting the signed-in coordinator's review. */
export interface ReviewNotification extends NotificationBase {
  kind: 'review';
  /** Always `submitted` — drives the status chip. */
  status: Extract<PlanStatus, 'submitted'>;
  /** The plan author's display name ("Amal Haddad"). */
  author: string;
  /** "Year 3 · English" context line for the plan's space. */
  context: string;
}

export type NotificationItem = OutcomeNotification | ReviewNotification;

interface OutcomeRow {
  id: string;
  curriculum_lesson_id: string;
  year: number | null;
  status: NotificationStatus;
  review_note: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
}

interface SubmittedRow {
  id: string;
  year: number | null;
  school_id: string | null;
  subject_id: string | null;
  submitted_at: string | null;
  created_by: string;
  classes: { school_id: string; subject_id: string } | null;
}

function yearLabel(year: number | null): string | null {
  return year == null ? null : `Year ${year}`;
}

/**
 * The bell's full feed for the signed-in user: their own decided lessons (outcomes)
 * merged with the plans awaiting their review (review items), most-recent first.
 * Returns an empty list when signed out or when nothing matches (no unread dot).
 */
export async function getBellNotifications(): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [outcomes, reviews] = await Promise.all([
    getOutcomeNotifications(supabase, user.id),
    getReviewNotifications(supabase, user.id),
  ]);

  return [...outcomes, ...reviews].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * The signed-in teacher's own lessons that were approved or returned with edits,
 * most-recently-decided first. (The teacher-facing half — behaviour unchanged.)
 */
async function getOutcomeNotifications(supabase: Supa, userId: string): Promise<OutcomeNotification[]> {
  const { data } = await supabase
    .from('lesson_plans')
    .select('id, curriculum_lesson_id, year, status, review_note, reviewed_at, updated_at')
    .eq('created_by', userId)
    .in('status', ['approved', 'needs_review'])
    .is('deleted_at', null) // a trashed plan (0048) raises no outcome notification
    .order('reviewed_at', { ascending: false, nullsFirst: false });

  const rows = (data ?? []) as OutcomeRow[];
  if (rows.length === 0) return [];

  // Resolve a short title per curriculum lesson (curriculum_lesson_id == lesson_key).
  // curriculum_lesson is readable by any authenticated user (curr_read policy).
  const keys = [...new Set(rows.map((r) => r.curriculum_lesson_id).filter(Boolean))];
  const titleByKey = new Map<string, string>();
  if (keys.length > 0) {
    const { data: lessons } = await supabase
      .from('curriculum_lesson_active')
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
    kind: 'outcome' as const,
    key: `outcome:${r.id}`,
    planId: r.id,
    href: `/plan/${r.id}`,
    status: r.status,
    yearLabel: yearLabel(r.year),
    lessonTitle: titleByKey.get(r.curriculum_lesson_id) ?? '',
    at: r.reviewed_at ?? r.updated_at,
    reviewNote: r.status === 'needs_review' ? r.review_note : null,
  }));
}

/**
 * The `submitted` plans awaiting the signed-in coordinator's review — one per plan
 * in a (centre, subject) space they COORDINATE, most-recently-submitted first.
 * Resolves each plan's space the class-optional way (class join, else the plan's
 * own scope columns) and keeps only those the viewer coordinates. The viewer's own
 * submissions are excluded (they are not a review task for their author). Returns
 * an empty list when the viewer coordinates no space.
 */
async function getReviewNotifications(supabase: Supa, userId: string): Promise<ReviewNotification[]> {
  const memberships = await getMyMemberships();
  const subjectNameBySpace = new Map<string, string>();
  for (const m of memberships) {
    if (m.role === 'coordinator') {
      subjectNameBySpace.set(`${m.schoolId}:${m.subjectId}`, m.subjectName ?? '');
    }
  }
  if (subjectNameBySpace.size === 0) return [];

  // RLS returns every submitted plan in spaces the viewer is a member of (any
  // role); we then keep only those in a space they COORDINATE. Class-scoped plans
  // resolve their space via the class join; centre-/org-scoped via own columns.
  const { data } = await supabase
    .from('lesson_plans')
    .select('id, year, school_id, subject_id, submitted_at, created_by, classes ( school_id, subject_id )')
    .eq('status', 'submitted')
    .is('deleted_at', null) // a trashed plan (0048) leaves the coordinator's review queue
    .order('submitted_at', { ascending: false, nullsFirst: false });

  const rows = (data ?? []) as unknown as SubmittedRow[];

  const coordinated = rows
    .map((r) => {
      const schoolId = r.classes?.school_id ?? r.school_id;
      const subjectId = r.classes?.subject_id ?? r.subject_id;
      return { row: r, spaceKey: schoolId && subjectId ? `${schoolId}:${subjectId}` : null };
    })
    .filter((x) => x.spaceKey !== null && subjectNameBySpace.has(x.spaceKey) && x.row.created_by !== userId);

  if (coordinated.length === 0) return [];

  // Resolve author display names. The co-member profiles policy (0013) lets a
  // teammate's id + name be read within a shared space, RLS-scoped by the client.
  const authorIds = [...new Set(coordinated.map((x) => x.row.created_by))];
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds);
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(p.id, p.full_name ?? 'A teacher');
    }
  }

  return coordinated.map(({ row, spaceKey }) => ({
    kind: 'review' as const,
    key: `review:${row.id}`,
    planId: row.id,
    href: `/plan/${row.id}/view`,
    status: 'submitted' as const,
    author: nameById.get(row.created_by) ?? 'A teacher',
    context: [yearLabel(row.year), subjectNameBySpace.get(spaceKey!)].filter(Boolean).join(' · '),
    at: row.submitted_at,
  }));
}
