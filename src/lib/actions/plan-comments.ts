'use server';

// Server action behind the coordinator review comments composer. Inserts a comment
// through the auth'd, RLS-scoped client: the `plan_comments` INSERT policy requires
// the caller to be a coordinator of the plan's (centre, subject) space (or an
// admin) and stamps `author_id = auth.uid()` by default, so authorisation rides on
// RLS — no permission logic is re-implemented here beyond a friendly empty-body
// guard. Returns the persisted row (with the author's name) so the sidebar can
// reconcile its optimistic add.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { PlanComment } from '@/lib/review/comments';

export interface AddCommentResult {
  ok: boolean;
  /** A short, non-user-facing error code; the client maps it to an i18n message. */
  error?: 'empty' | 'failed';
  comment?: PlanComment;
}

export async function addPlanComment(planId: string, body: string): Promise<AddCommentResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('plan_comments')
    .insert({ plan_id: planId, body: trimmed })
    .select('id, body, created_at, author_id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: 'failed' };
  const row = data as { id: string; body: string; created_at: string; author_id: string };

  // The author is the signed-in coordinator; resolve their own display name.
  let authorName = '';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    authorName = (profile as { full_name?: string | null } | null)?.full_name ?? '';
  }

  revalidatePath(`/plan/${planId}/view`);

  return {
    ok: true,
    comment: {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      authorId: row.author_id,
      authorName,
    },
  };
}
