import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell/AppShell';
import { ReadOnlyPlan } from '@/components/editor/ReadOnlyPlan';
import { ReviewCommentsSidebar } from '@/components/review/ReviewCommentsSidebar';
import { canCoordinatePlan } from '@/lib/actions/lesson-plan';
import { getPlanComments, getPlanEvents } from '@/lib/review/comments';
import { loadPlanForEditor } from '@/lib/editor/load-plan';
import { createClient } from '@/lib/supabase/server';

// Rendered per-request: the plan is loaded with the auth'd client (RLS).
export const dynamic = 'force-dynamic';

/**
 * The read-only view of a lesson plan. The board routes here when the viewer is
 * not the plan's creator (editing is creator-only by RLS). Anyone with RLS read
 * access — a colleague, a coordinator, or anyone seeing a shared centre/org plan —
 * can open it; the data load 404s if RLS hides the plan.
 *
 * For a coordinator of the plan's space, the reserved right rail carries the review
 * comments sidebar (thread + decisions) — but only on a reviewable plan
 * (`submitted` / `needs_review` / `approved`). On a draft we keep the neutral
 * "nothing to review yet" note and mount no sidebar.
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
  const viewerName = profile?.full_name ?? user?.email ?? 'there';

  const status = data.plan.status;
  const isReviewable = status !== 'in_progress';

  // Comments are loaded for any coordinator of the plan, in every status: their
  // display is EXISTENCE-gated, not status-gated, so a plan returned to draft
  // (in_progress) still shows the feedback that was left on it. The sidebar mounts
  // when the plan is reviewable OR any comment exists; the decision bar inside
  // keeps its own status gating. (Loaded only for a coordinator — a non-coordinator
  // reads [] by RLS and never sees the sidebar.)
  const [comments, events] = canDecide
    ? await Promise.all([getPlanComments(id), getPlanEvents(id)])
    : [[], []];
  const hasComments = comments.length > 0;
  const showSidebar = canDecide && (isReviewable || hasComments || events.length > 0);
  const authorName = showSidebar ? await resolveAuthorName(supabase, data.plan.created_by) : '';

  // The neutral "nothing to review yet" note appears only when there is genuinely
  // nothing — a draft with no comments. Once any comment exists it gives way to the
  // sidebar, so returned feedback is never hidden behind the draft message.
  let draftNote: ReactNode = null;
  if (canDecide && !isReviewable && !hasComments && events.length === 0) {
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
      <ReadOnlyPlan
        data={data}
        decisionBar={draftNote}
        rightRail={
          showSidebar ? (
            <ReviewCommentsSidebar
              planId={id}
              status={status}
              authorName={authorName}
              viewerName={viewerName}
              initialComments={comments}
              initialEvents={events}
            />
          ) : null
        }
      />
    </AppShell>
  );
}

/** The plan author's (teacher's) display name, for the return microcopy. Empty
 *  when RLS hides it. */
async function resolveAuthorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorId: string,
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', authorId)
    .maybeSingle();
  return (data as { full_name?: string | null } | null)?.full_name ?? '';
}
