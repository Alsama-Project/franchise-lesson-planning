import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { ReadOnlyPlan } from '@/components/editor/ReadOnlyPlan';
import { CoordinatorDecisionBar } from '@/components/editor/CoordinatorDecisionBar';
import { canCoordinatePlan } from '@/lib/actions/lesson-plan';
import { loadPlanForEditor } from '@/lib/editor/load-plan';
import { createClient } from '@/lib/supabase/server';

// Rendered per-request: the plan is loaded with the auth'd client (RLS).
export const dynamic = 'force-dynamic';

/**
 * The read-only view of a lesson plan. The board routes here when the viewer is
 * not the plan's creator (editing is creator-only by RLS). Anyone with RLS read
 * access — a colleague, a coordinator, or anyone seeing a shared centre/org plan —
 * can open it; the data load 404s if RLS hides the plan.
 */
export default async function PlanViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  // The plan, the viewer, and whether the viewer may take a coordinator decision
  // on this plan (coordinator of its space, or admin) — independent reads.
  const [data, { data: { user } }, canDecide] = await Promise.all([
    loadPlanForEditor(id),
    supabase.auth.getUser(),
    canCoordinatePlan(id),
  ]);
  if (!data) notFound();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id ?? '')
    .maybeSingle();
  const name = profile?.full_name ?? user?.email ?? 'there';

  return (
    <AppShell
      name={name}
      subtitle={`${data.classContext.schoolName} · ${data.classContext.subjectName}`}
    >
      <ReadOnlyPlan
        data={data}
        decisionBar={
          canDecide ? (
            <CoordinatorDecisionBar planId={id} status={data.plan.status} />
          ) : null
        }
      />
    </AppShell>
  );
}
