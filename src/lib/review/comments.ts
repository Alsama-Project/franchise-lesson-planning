import 'server-only';

// Loading for the coordinator review comments thread. A flat, chronological list
// of coordinator→teacher feedback on a lesson plan, read through the auth'd,
// cookie-bound client so RLS scopes it — this slice's `plan_comments` policy is
// coordinator-only, so a non-coordinator simply loads an empty list (and the
// review page never mounts the sidebar for them). The service-role key is never
// used on this path.

import { createClient } from '@/lib/supabase/server';
import type { PlanEvent, PlanEventType } from '@/lib/review/timeline';

export interface PlanComment {
  id: string;
  body: string;
  /** ISO timestamp (`created_at`). */
  createdAt: string;
  authorId: string;
  /** The comment author's display name (always a coordinator in this slice). */
  authorName: string;
}

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
}

/**
 * The plan's comments, oldest → newest. Returns an empty list when there are none
 * or RLS hides them. Author names are resolved in a second read (the co-member
 * profiles policy lets a coordinator read a teammate coordinator's name within the
 * shared space), mirroring how the board resolves plan owners.
 */
export async function getPlanComments(planId: string): Promise<PlanComment[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('plan_comments')
    .select('id, body, created_at, author_id')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as CommentRow[];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.author_id).filter(Boolean))];
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

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorId: r.author_id,
    authorName: nameById.get(r.author_id) ?? '',
  }));
}

interface EventRow {
  id: string;
  type: PlanEventType;
  created_at: string;
  actor_id: string | null;
}

/**
 * The plan's recorded lifecycle events (migration 0027 `plan_events`), oldest →
 * newest, with actor names resolved the same way as comments. RLS scopes the read
 * to plans the viewer may see (`plan_events_member_select`).
 *
 * DEGRADES GRACEFULLY before the migration is applied: if `plan_events` does not
 * exist yet the query returns a PostgREST error (not a throw), which we treat as an
 * empty timeline — so the pane renders comments-only and never crashes pre-migration.
 */
export async function getPlanEvents(planId: string): Promise<PlanEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('plan_events')
    .select('id, type, created_at, actor_id')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  const rows = data as unknown as EventRow[];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
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

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    createdAt: r.created_at,
    actorId: r.actor_id,
    actorName: r.actor_id ? nameById.get(r.actor_id) ?? '' : '',
  }));
}
