import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { LessonPlanEditor } from '@/components/editor/LessonPlanEditor';
import { canCoordinatePlan } from '@/lib/actions/lesson-plan';
import { loadPlanForEditor } from '@/lib/editor/load-plan';
import { planHasAnnotations } from '@/lib/review/annotations';
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
      <LessonPlanEditor data={data} hasFeedback={hasFeedback} />
    </AppShell>
  );
}
