import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { LessonPlanEditor } from '@/components/editor/LessonPlanEditor';
import { canCoordinatePlan } from '@/lib/actions/lesson-plan';
import { loadPlanForEditor } from '@/lib/editor/load-plan';
import { planHasAnnotations } from '@/lib/review/annotations';
import { createClient } from '@/lib/supabase/server';
import { boardHref, toBoardCoordinate, toBoardView } from '@/lib/board-nav';

// Rendered per-request: the plan is loaded with the auth'd client (RLS).
export const dynamic = 'force-dynamic';

type SearchParams = { month?: string; week?: string; view?: string };

export default async function PlanEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  // The board threads its current week onto the plan link; return "‹ This week" there.
  const { month, week, view } = await searchParams;
  const backHref = boardHref(toBoardCoordinate(month, week), toBoardView(view));

  // The plan load and the shell-chrome identity are independent, so run them in
  // parallel rather than waterfalling.
  const supabase = await createClient();
  // Whether the plan carries any coordinator feedback. The wizard no longer embeds
  // the response thread — the teacher responds on /plan/[id]/view (one surface) — so
  // here we only need to know whether to show the "feedback to review" pointer. RLS
  // scopes the check to a plan the caller can see.
  const [data, { data: { user } }, canCoordinate, hasFeedback] = await Promise.all([
    loadPlanForEditor(id),
    supabase.auth.getUser(),
    canCoordinatePlan(id),
    planHasAnnotations(id),
  ]);
  // A missing plan — genuinely absent, RLS-hidden, or SOFT-DELETED (loadPlanForEditor
  // filters deleted_at) — is not openable. Return to the board instead of a raw 404,
  // so trashing a lesson (or following a stale link to one) lands somewhere sensible.
  if (!data) redirect(backHref);

  // The editor is the AUTHORING surface. A coordinator of this plan's space who is
  // not its author opens it to REVIEW, not edit — their controls (Approve / Return
  // for edits) live on /view, never the teacher's "Unlock for editing". Route them
  // there regardless of how they arrived (board card, bell, or a direct link), so
  // the review/edit split holds at the page level and not only at the board's card.
  // The author keeps the editor even when they coordinate their own space.
  if (canCoordinate && data.plan.created_by !== user?.id) {
    // Preserve the board week across the review-route redirect so /view returns here.
    const query = new URLSearchParams();
    if (month) query.set('month', month);
    if (week) query.set('week', week);
    if (view) query.set('view', view);
    const qs = query.toString();
    redirect(qs ? `/plan/${id}/view?${qs}` : `/plan/${id}/view`);
  }

  // Display name for the shell chrome (depends on the resolved user).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id ?? '')
    .maybeSingle();
  const name = profile?.full_name ?? user?.email ?? 'there';

  return (
    <AppShell name={name} subtitle={`${data.classContext.schoolName} · ${data.classContext.subjectName}`}>
      <LessonPlanEditor data={data} hasFeedback={hasFeedback} backHref={backHref} />
    </AppShell>
  );
}
