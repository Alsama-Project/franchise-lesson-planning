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
// auth'd, cookie-bound client scopes every PLAN read — never the service-role key;
// the per-plan curriculum label is resolved through the shared curriculum layer
// (global reference data), PINNED to each plan's stamped curriculum version so a
// notification for a historical plan reads the same curriculum the plan renders.

import { createClient } from '@/lib/supabase/server';
import { getMyCoordinatedSubjectIds } from '@/lib/auth';
import { getPlanCurriculumLabels, planCurriculumLabelKey } from '@/lib/curriculumUtils';
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
  curriculum_version_id: string | null;
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
    .select('id, curriculum_lesson_id, curriculum_version_id, year, status, review_note, reviewed_at, updated_at')
    .eq('created_by', userId)
    .in('status', ['approved', 'needs_review'])
    .is('deleted_at', null) // a trashed plan (0048) raises no outcome notification
    .order('reviewed_at', { ascending: false, nullsFirst: false });

  const rows = (data ?? []) as OutcomeRow[];
  if (rows.length === 0) return [];

  // Resolve a short title per plan, PINNED to the plan's stamped curriculum version
  // (a re-authored subject must not retitle an old plan's notification). Falls back to
  // the active version for legacy/unstamped plans; keyed by (lesson_key, version).
  const labels = await getPlanCurriculumLabels(
    rows
      .filter((r) => r.curriculum_lesson_id)
      .map((r) => ({ lessonKey: r.curriculum_lesson_id, versionId: r.curriculum_version_id })),
  );

  return rows.map((r) => {
    const label = labels.get(planCurriculumLabelKey(r.curriculum_lesson_id, r.curriculum_version_id));
    return {
      kind: 'outcome' as const,
      key: `outcome:${r.id}`,
      planId: r.id,
      href: `/plan/${r.id}`,
      status: r.status,
      yearLabel: yearLabel(r.year),
      lessonTitle: (label ? label.focusArea || label.dailyOutcome : '').trim(),
      at: r.reviewed_at ?? r.updated_at,
      reviewNote: r.status === 'needs_review' ? r.review_note : null,
    };
  });
}

/**
 * The `submitted` plans awaiting the signed-in coordinator's review — one per plan
 * in a SUBJECT they COORDINATE, most-recently-submitted first. Coordinator-ness is
 * subject-wide and school-agnostic (`coordinator_subject`, migration 0040) — the
 * SAME source `is_coordinator_of_subject` and the RLS policies read, so the queue
 * and the per-card review routing can never disagree on who coordinates what.
 * Resolves each plan's subject the class-optional way (class join, else the plan's
 * own `subject_id`) and keeps only those the viewer coordinates. The viewer's own
 * submissions are excluded (a coordinator's own plan is never a review task, and a
 * coordinator-authored plan is born `approved` and never `submitted` anyway).
 * Returns an empty list when the viewer coordinates no subject.
 */
async function getReviewNotifications(supabase: Supa, userId: string): Promise<ReviewNotification[]> {
  const coordinatedSubjectIds = await getMyCoordinatedSubjectIds();
  if (coordinatedSubjectIds.size === 0) return [];

  // RLS (`lp_select`) returns every submitted plan for subjects the viewer
  // participates in; we then keep only those whose subject they COORDINATE. A
  // class-scoped plan resolves its subject via the class join; a class-less
  // (centre/coordinator-authored) plan via its own `subject_id` column.
  const { data } = await supabase
    .from('lesson_plans')
    .select('id, year, school_id, subject_id, submitted_at, created_by, classes ( school_id, subject_id )')
    .eq('status', 'submitted')
    .is('deleted_at', null) // a trashed plan (0048) leaves the coordinator's review queue
    .order('submitted_at', { ascending: false, nullsFirst: false });

  const rows = (data ?? []) as unknown as SubmittedRow[];

  const coordinated = rows
    .map((r) => ({ row: r, subjectId: r.classes?.subject_id ?? r.subject_id }))
    .filter(
      (x) =>
        x.subjectId != null &&
        coordinatedSubjectIds.has(x.subjectId) &&
        x.row.created_by !== userId,
    );

  if (coordinated.length === 0) return [];

  // Subject display names for the context line — reference data, readable to any
  // authenticated user (`subjects_select_authenticated`, 0006).
  const subjectIds = [...new Set(coordinated.map((x) => x.subjectId as string))];
  const subjectNameById = new Map<string, string>();
  const { data: subjRows } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
  for (const s of (subjRows ?? []) as Array<{ id: string; name: string | null }>) {
    subjectNameById.set(s.id, s.name ?? '');
  }

  // Resolve author display names. The co-member profiles policy (0013/0040) lets a
  // teammate's id + name be read within a shared subject, RLS-scoped by the client.
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

  return coordinated.map(({ row, subjectId }) => ({
    kind: 'review' as const,
    key: `review:${row.id}`,
    planId: row.id,
    href: `/plan/${row.id}/view`,
    status: 'submitted' as const,
    author: nameById.get(row.created_by) ?? 'A teacher',
    context: [yearLabel(row.year), subjectNameById.get(subjectId as string)].filter(Boolean).join(' · '),
    at: row.submitted_at,
  }));
}
