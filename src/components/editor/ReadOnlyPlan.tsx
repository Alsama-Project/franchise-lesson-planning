// Read-only rendering of a lesson plan, shown at /plan/[id]/view when the viewer
// is NOT the plan's creator (a coordinator on a colleague's plan, or anyone seeing
// a shared centre/org plan they didn't make). Editing is creator-only by RLS, so a
// non-creator save would be rejected — this view never exposes the editable wizard.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CurriculumBand } from '@/components/editor/CurriculumBand';
import { PartContent } from '@/components/editor/PartContent';
import { blockMinutes, inSessionMinutes, IN_SESSION_TARGET_MINUTES } from '@/lib/blocks';
import { normalizeLinkIt, resolveTechniques, techniqueLabelMap } from '@/lib/editor/link-it';
import type { Block, TeachingPhase } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import type { EditorPlanData } from '@/lib/editor/load-plan';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

const PHASE_LABEL: Record<TeachingPhase, string> = {
  i_do: 'I do',
  we_do: 'We do',
  you_do: 'You do',
};

const SCOPE_LABEL = {
  class: 'Class plan',
  centre: 'Centre plan',
  org: 'All-centres plan',
} as const;

export function ReadOnlyPlan({
  data,
  decisionBar,
  rightRail,
}: {
  data: EditorPlanData;
  /** Coordinator decision bar, rendered at the top of the content column when the
   *  viewer may decide on this plan. Omitted (null) for non-coordinators. */
  decisionBar?: ReactNode;
  /** Reserved ~360px right rail. The comments sidebar slots in here in a later
   *  slice; the content column is width-capped so adding it never reflows the
   *  plan body. Nothing is rendered here in this slice. */
  rightRail?: ReactNode;
}) {
  const { plan, classContext, curriculum, activitiesByBlock, resourceBank } = data;
  const total = inSessionMinutes(plan.blocks);
  const onTarget = total === IN_SESSION_TARGET_MINUTES;

  // "Link it together" selections, resolved to display rows for the cfu / exit blocks.
  const linkIt = normalizeLinkIt(plan.blocks);
  const techniqueLabels = techniqueLabelMap(
    activitiesByBlock.cfu ?? [],
    activitiesByBlock.exit_ticket ?? [],
  );
  const techniquesFor = (type: Block['type']) =>
    type === 'cfu'
      ? resolveTechniques(linkIt.checkForUnderstanding, techniqueLabels)
      : type === 'exit_ticket'
        ? resolveTechniques(linkIt.exitTicket, techniqueLabels)
        : undefined;

  // Resources attached to any block were resolved by the loader; index them so
  // each block can list its own attachments without another round-trip.
  const resourcesById = new Map<string, ResourceWithTags>(
    resourceBank.attached.map((r) => [r.id, r]),
  );
  const attachedFor = (block: Block): ResourceWithTags[] =>
    (block.resourceIds ?? [])
      .map((id) => resourcesById.get(id))
      .filter((r): r is ResourceWithTags => !!r);

  // Master-frame context for the read-only worksheet render (mirrors the editor's
  // WorksheetContext; only the fields the static print view reads are populated).
  const exitBlock = plan.blocks.find((b) => b.type === 'exit_ticket');
  const worksheetContext: WorksheetContext = {
    subjectName: classContext.subjectName,
    year: classContext.scope === 'class' ? classContext.year : plan.year,
    theme: curriculum?.theme ?? '',
    dailyOutcome: curriculum?.dailyLO ?? '',
    centreName: classContext.schoolName,
    lessonCode: curriculum?.lessonCode ?? plan.curriculum_lesson_id,
    exitTicket:
      exitBlock?.students_do?.trim() ||
      exitBlock?.activity_title?.trim() ||
      exitBlock?.note?.trim() ||
      '',
    weeklyOutcome: curriculum?.weekLO ?? '',
    monthlyLo: curriculum?.monthlyLO ?? '',
    grammarVocab: curriculum?.grammarVocab ?? '',
    lessonPlanId: plan.id,
    subjectId: classContext.subjectId,
  };

  const groupSuffix =
    classContext.scope === 'centre'
      ? 'Whole centre'
      : classContext.scope === 'org'
        ? 'All centres'
        : null;
  const context = [classContext.subjectName, classContext.schoolName].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto -my-8 max-w-[1340px]">
      {/* The decision bar + plan header sit ABOVE the content/rail split, width-capped
          to the content column. That way the comments rail (right, below) top-aligns
          with the lesson content block (DAILY OUTCOME / GRAMMAR & VOCAB / THEME row)
          rather than with the back-link header. */}
      <div className="lg:max-w-[940px]">
        {decisionBar}
        <div className="border-b border-[#EFE8DD] px-[22px] py-4 lg:px-[30px]">
          <Link
            href="/"
            className="mb-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            This week
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-[10px]">
              <span className="text-[19px] font-semibold">
                Year {classContext.year}
                {groupSuffix ? ` · ${groupSuffix}` : ''}
              </span>
              {context ? <span className="text-[13px] text-neutral-600">{context}</span> : null}
              <span className="rounded-badge bg-[#F3ECE2] px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-600">
                Read only · {SCOPE_LABEL[classContext.scope]}
              </span>
            </div>
            <span className={`text-[13.5px] font-bold ${onTarget ? 'text-[#2E7D5B]' : 'text-[#B0651E]'}`}>
              {total} / {IN_SESSION_TARGET_MINUTES} min
            </span>
          </div>
        </div>
      </div>

      {/* Content column + reserved right rail. On large screens the content sits in a
          width-capped left column so the ~360px comments rail slots beside it via
          `rightRail` without reflowing the plan body. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="min-w-0 lg:flex-1 lg:max-w-[940px]">
          <div className="px-[22px] pb-10 pt-[22px] lg:px-[30px]">
        <CurriculumBand curriculum={curriculum} />

        <section className="mt-[24px]">
          <h2 className="mb-[8px] text-[13px] font-bold uppercase tracking-[0.05em] text-text-faint">
            SMARTT objective
          </h2>
          <div className="rounded-[11px] border border-border bg-surface px-[15px] py-[13px] text-[14px] leading-[1.5] text-neutral-900">
            {plan.smartt_objective?.trim() || (
              <span className="text-text-muted">No objective written yet.</span>
            )}
          </div>
        </section>

        <section className="mt-[24px]">
          <h2 className="mb-[10px] text-[13px] font-bold uppercase tracking-[0.05em] text-text-faint">
            Lesson blocks
          </h2>
          <div className="flex flex-col gap-[10px]">
            {plan.blocks.map((block, i) => (
              <div
                key={`${block.type}-${i}`}
                className="rounded-[11px] border border-border bg-surface px-[15px] py-[12px]"
              >
                <div className="flex items-center gap-[8px]">
                  {block.phase ? (
                    <span className="rounded-badge bg-surface-subtle px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-600">
                      {PHASE_LABEL[block.phase]}
                    </span>
                  ) : null}
                  <span className="text-[14px] font-semibold text-ink">{block.title}</span>
                  <span className="ml-auto text-[12.5px] font-semibold text-text-faint">
                    {blockMinutes(block)} min
                  </span>
                </div>
                <div className="mt-[8px]">
                  <PartContent
                    block={block}
                    attachedResources={attachedFor(block)}
                    worksheet={block.type === 'independent_practice' ? plan.worksheet : undefined}
                    worksheetContext={
                      block.type === 'independent_practice' ? worksheetContext : undefined
                    }
                    techniques={techniquesFor(block.type)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
          </div>
        </div>

        {rightRail ? (
          // The rail WRAPPER is the sticky element — its containing block is the
          // flex row, whose height is driven by the (tall) plan content beside it,
          // so the pane has room to travel and actually sticks. (Sticky on the inner
          // card instead would pin it to this short wrapper and scroll away.)
          // `lg:self-start` keeps the wrapper its content height under the row's
          // `items-start`; `lg:mt-[22px]` matches the content block's top padding so
          // the rail's top lines up with the DAILY OUTCOME / GRAMMAR & VOCAB / THEME row.
          // `top` clears the full fixed chrome (header + TEST MODE bar when present)
          // via the --app-chrome-height token set in AppShell, plus a 16px gap, so the
          // "Coordinator comments" title sits fully below the nav and is never clipped.
          <aside className="mt-6 lg:sticky lg:top-[calc(var(--app-chrome-height,64px)+16px)] lg:mt-[22px] lg:w-[360px] lg:flex-shrink-0 lg:self-start">
            {rightRail}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
