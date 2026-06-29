import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { LessonPlanEditor } from '@/components/editor/LessonPlanEditor';
import { canCoordinatePlan } from '@/lib/actions/lesson-plan';
import { loadPlanForEditor } from '@/lib/editor/load-plan';
import { getPlanComments, getPlanEvents } from '@/lib/review/comments';
import { createClient } from '@/lib/supabase/server';

// Rendered per-request: the plan is loaded with the auth'd client (RLS).
export const dynamic = 'force-dynamic';

export default async function PlanEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The plan load and the shell-chrome identity are independent, so run them in
  // parallel rather than waterfalling.
  const supabase = await createClient();
  // Comments load in parallel: coordinator→teacher feedback the teacher needs to
  // see on a returned plan. RLS scopes the read — it returns [] (degrading
  // gracefully) until the teacher-SELECT comments policy (migration 0025) lands.
  const [data, { data: { user } }, canCoordinate, comments, events] = await Promise.all([
    loadPlanForEditor(id),
    supabase.auth.getUser(),
    canCoordinatePlan(id),
    getPlanComments(id),
    getPlanEvents(id),
  ]);
  if (!data) notFound();

  // The editor is the AUTHORING surface. A coordinator of this plan's space who is
  // not its author opens it to REVIEW, not edit — their controls (Approve / Return
  // for edits) live on /view, never the teacher's "Unlock for editing". Route them
  // there regardless of how they arrived (board card, bell, or a direct link), so
  // the review/edit split holds at the page level and not only at the board's card.
  // The author keeps the editor even when they coordinate their own space.
  if (canCoordinate && data.plan.created_by !== user?.id) {
    redirect(`/plan/${id}/view`);
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
      <LessonPlanEditor data={data} comments={comments} events={events} />
    </AppShell>
  );
}
