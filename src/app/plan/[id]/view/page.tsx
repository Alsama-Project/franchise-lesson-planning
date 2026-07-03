import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell/AppShell';
import { ReadOnlyPlan } from '@/components/editor/ReadOnlyPlan';
import { AnnotationProvider } from '@/components/review/annotation/context';
import { AnnotationPane } from '@/components/review/annotation/AnnotationPane';
import { canCoordinatePlan } from '@/lib/actions/lesson-plan';
import { getPlanAnnotations } from '@/lib/review/annotations';
import { loadPlanForEditor } from '@/lib/editor/load-plan';
import { createClient } from '@/lib/supabase/server';
import { boardHref, toBoardCoordinate, toBoardView } from '@/lib/board-nav';

// Rendered per-request: the plan is loaded with the auth'd client (RLS).
export const dynamic = 'force-dynamic';

type SearchParams = { month?: string; week?: string; view?: string };

/**
 * The read-only view of a lesson plan and its inline coordinator-review annotation
 * layer. The board routes here when the viewer is not the plan's creator (editing is
 * creator-only by RLS), and the wizard's "coordinator feedback" pointer links here so
 * the teacher responds on ONE surface.
 *
 * The annotation pane mounts for any MEMBER of the plan's space — the coordinator (who
 * authors comments/suggestions and decides) and the plan's teacher (who accepts /
 * rejects / resolves / replies). A non-member gets the plain read-only plan with no
 * pane (RLS would return them nothing anyway). The read-side affordances woven into
 * ReadOnlyPlan share the AnnotationProvider, so badges/pills cross-highlight the pane.
 */
export default async function PlanViewPage({
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

  const supabase = await createClient();
  // The plan, the viewer, and whether the viewer may take a coordinator decision on
  // this plan (coordinator of its space, or admin) — independent reads.
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
  const viewerName = profile?.full_name ?? user?.email ?? 'there';

  const status = data.plan.status;
  const isReviewable = status !== 'in_progress';
  const isCreator = !!user && user.id === data.plan.created_by;
  // A member sees the pane: the coordinator (authors + decides) or the plan's teacher
  // (responds). Everyone else gets the plain read-only plan.
  const isMemberViewer = canDecide || isCreator;
  const role = canDecide ? 'coordinator' : 'teacher';

  const annotations = isMemberViewer
    ? await getPlanAnnotations(id, data.plan.created_by)
    : [];
  // Mount when there is something to review (a submitted/decided plan) or any feedback
  // already exists. A pristine draft shows the neutral note instead.
  const mountPane = isMemberViewer && (isReviewable || annotations.length > 0);

  // block.type → title, so a phase-anchored card can label itself.
  const phaseTitles = Object.fromEntries(data.plan.blocks.map((b) => [b.type, b.title]));

  // Neutral "nothing to review yet" note — only for a coordinator on a pristine draft.
  let draftNote: ReactNode = null;
  if (canDecide && !mountPane) {
    const t = await getTranslations('review');
    draftNote = (
      <div className="border-b border-[#EFE8DD] bg-surface-subtle px-[22px] py-[14px] lg:px-[30px]">
        <p className="text-[13px] font-bold uppercase tracking-[0.05em] text-text-faint">
          {t('comments.draftTitle')}
        </p>
        <p className="mt-[3px] text-[13.5px] text-text-muted">{t('comments.draftNote')}</p>
      </div>
    );
  }

  return (
    <AppShell
      name={viewerName}
      subtitle={`${data.classContext.schoolName} · ${data.classContext.subjectName}`}
    >
      {mountPane ? (
        <AnnotationProvider
          planId={id}
          status={status}
          role={role}
          viewerName={viewerName}
          annotations={annotations}
          phaseTitles={phaseTitles}
        >
          <ReadOnlyPlan data={data} decisionBar={null} rightRail={<AnnotationPane />} backHref={backHref} />
        </AnnotationProvider>
      ) : (
        <ReadOnlyPlan data={data} decisionBar={draftNote} rightRail={null} backHref={backHref} />
      )}
    </AppShell>
  );
}
