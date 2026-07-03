import 'server-only';

// Loading for the inline coordinator-review annotation layer (migration 0045).
// Reads through the auth'd, cookie-bound client so RLS scopes it: any member of the
// plan's (centre, subject) space — the coordinator AND the plan's teacher — reads
// the annotations and their replies; a non-member reads nothing (and the view never
// mounts the pane for them). The service-role key is never used on this path.

import { createClient } from '@/lib/supabase/server';
import type {
  Annotation,
  AnnotationReply,
  AnnotationRole,
  AnchorType,
  AnnotationKind,
  AnnotationStatus,
  SuggestionShape,
} from '@/types/annotation';

interface AnnotationRow {
  id: string;
  plan_id: string;
  author_id: string;
  kind: AnnotationKind;
  anchor_type: AnchorType;
  phase_ref: string | null;
  block_ref: string | null;
  suggestion_shape: SuggestionShape | null;
  from_value: string | null;
  to_value: string | null;
  note: string;
  status: AnnotationStatus;
  resolved: boolean;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

interface ReplyRow {
  id: string;
  annotation_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

/** Author role on this plan: its creator is the teacher, anyone else a coordinator
 *  (matches how the review sidebar has always tinted comment authors). */
function roleFor(authorId: string, teacherId: string): AnnotationRole {
  return authorId === teacherId ? 'teacher' : 'coordinator';
}

/**
 * Every annotation on a plan (oldest → newest) with its replies attached and author
 * names/roles resolved. Returns an empty list when there are none or RLS hides them.
 * `teacherId` is the plan's `created_by`, used to tint each author as teacher or
 * coordinator. Names are resolved in one extra read of `profiles` (the co-member
 * profiles policy lets any member read a teammate's name within the shared space),
 * mirroring how comments/events were resolved.
 */
export async function getPlanAnnotations(
  planId: string,
  teacherId: string,
): Promise<Annotation[]> {
  const supabase = await createClient();

  const [{ data: annData }, { data: replyData }] = await Promise.all([
    supabase
      .from('plan_annotations')
      .select(
        `id, plan_id, author_id, kind, anchor_type, phase_ref, block_ref,
         suggestion_shape, from_value, to_value, note, status, resolved,
         decided_by, decided_at, created_at`,
      )
      .eq('plan_id', planId)
      .order('created_at', { ascending: true }),
    supabase
      .from('plan_annotation_replies')
      .select('id, annotation_id, author_id, body, created_at')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true }),
  ]);

  const annRows = (annData ?? []) as AnnotationRow[];
  if (annRows.length === 0) return [];
  const replyRows = (replyData ?? []) as ReplyRow[];

  // Resolve every author name (annotation + reply authors) in one read.
  const ids = [
    ...new Set(
      [...annRows.map((r) => r.author_id), ...replyRows.map((r) => r.author_id)].filter(Boolean),
    ),
  ];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids);
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (p.full_name) nameById.set(p.id, p.full_name);
    }
  }

  // Group replies under their annotation (rows already sorted oldest → newest).
  const repliesByAnnotation = new Map<string, AnnotationReply[]>();
  for (const r of replyRows) {
    const list = repliesByAnnotation.get(r.annotation_id) ?? [];
    list.push({
      id: r.id,
      annotationId: r.annotation_id,
      authorId: r.author_id,
      authorName: nameById.get(r.author_id) ?? '',
      authorRole: roleFor(r.author_id, teacherId),
      body: r.body,
      createdAt: r.created_at,
    });
    repliesByAnnotation.set(r.annotation_id, list);
  }

  return annRows.map((r) => ({
    id: r.id,
    planId: r.plan_id,
    kind: r.kind,
    anchorType: r.anchor_type,
    phaseRef: r.phase_ref,
    blockRef: r.block_ref,
    suggestionShape: r.suggestion_shape,
    fromValue: r.from_value,
    toValue: r.to_value,
    note: r.note,
    status: r.status,
    resolved: r.resolved,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
    authorId: r.author_id,
    authorName: nameById.get(r.author_id) ?? '',
    authorRole: roleFor(r.author_id, teacherId),
    replies: repliesByAnnotation.get(r.id) ?? [],
  }));
}

/**
 * Whether a plan has any annotations — a cheap existence check for the wizard
 * editor's "coordinator feedback to review" pointer (which links to /view rather
 * than embedding the response pane). RLS scopes it to a plan the caller can see.
 */
export async function planHasAnnotations(planId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('plan_annotations')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId);
  return (count ?? 0) > 0;
}
