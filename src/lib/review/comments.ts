import 'server-only';

// Loading for the coordinator review comments thread. A flat, chronological list
// of coordinator→teacher feedback on a lesson plan, read through the auth'd,
// cookie-bound client so RLS scopes it — this slice's `plan_comments` policy is
// coordinator-only, so a non-coordinator simply loads an empty list (and the
// review page never mounts the sidebar for them). The service-role key is never
// used on this path.

import { createClient } from '@/lib/supabase/server';

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
