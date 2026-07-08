// Read-only rendering of a lesson plan, shown at /plan/[id]/view when the viewer
// is NOT the plan's creator (a coordinator on a colleague's plan, or anyone seeing
// a shared centre/org plan they didn't make). Editing is creator-only by RLS, so a
// non-creator save would be rejected — this view never exposes the editable wizard.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CurriculumBand } from '@/components/editor/CurriculumBand';
import { PartContent } from '@/components/editor/PartContent';
import { PhaseRow } from '@/components/review/annotation/PhaseRow';
import { ObjectiveAnnotations } from '@/components/review/annotation/ObjectiveAnnotations';
import { ObjectiveField } from '@/components/review/annotation/ObjectiveField';
import { AnnotatedSection } from '@/components/review/annotation/AnnotatedSection';
import { blockMinutes, inSessionMinutes, IN_SESSION_TARGET_MINUTES, ROUTINE_BLOCK_TYPES } from '@/lib/blocks';
import { routinesMinutes } from '@/lib/editor/plan-blocks';
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
  decision,
  rightRail,
  backHref = '/',
  embedded = false,
}: {
  data: EditorPlanData;
  /** Coordinator decision bar, rendered at the top of the content column when the
   *  viewer may decide on this plan. Omitted (null) for non-coordinators. */
  decisionBar?: ReactNode;
  /** The decision cluster (Return / Approve · Resubmit), rendered in the plan HEADER
   *  beside the minute total per the mock. A client node reading the AnnotationProvider;
   *  omitted (null) on a non-member plain read-only view and in the embedded editor
   *  (where the editor's own SubmitControl owns the teacher's Resubmit). */
  decision?: ReactNode;
  /** Reserved ~360px right rail. The comments sidebar slots in here in a later
   *  slice; the content column is width-capped so adding it never reflows the
   *  plan body. Nothing is rendered here in this slice. */
  rightRail?: ReactNode;
  /** Where "‹ This week" returns — the board week this plan was opened from. */
  backHref?: string;
  /** Rendered inside the editor's Review step (not the standalone /view page). The
   *  editor already supplies its own chrome (sub-header · pipeline tracker ·
   *  Submit control), so the page-level header (back-link · Year · "Read only"
   *  badge · edit action · minute total) is dropped and the outer page-padding
   *  compensation is removed — only the reviewable surface (plan sections + the
   *  comments rail) is kept, identical to /view. */
  embedded?: boolean;
}) {
  const { plan, classContext, curriculum, activitiesByBlock, resourceBank } = data;
  const total = inSessionMinutes(plan.blocks);
  const onTarget = total === IN_SESSION_TARGET_MINUTES;

  // The fixed opening routines (anthem · warm-up · cool down) aren't planned, so
  // they render as one grouped, non-editable strip at the start of the blocks —
  // not as individual blocks with empty planning areas. Everything else is a
  // genuinely plannable block, rendered individually below.
  const routineBlocks = plan.blocks.filter((b) => ROUTINE_BLOCK_TYPES.has(b.type));
  const contentBlocks = plan.blocks.filter((b) => !ROUTINE_BLOCK_TYPES.has(b.type));

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
    <div className={embedded ? 'relative mx-auto max-w-[1340px]' : 'relative mx-auto -my-8 max-w-[1340px]'}>
      {/* The decision bar + plan header span the FULL width (the decision cluster sits
          flush right, beside the minute total). In the embedded editor context this
          whole header is dropped — the editor's own chrome already owns it. */}
      {embedded ? null : (
      <div>
        {decisionBar}
        <div className="border-b border-[#EFE8DD] px-[22px] py-4 lg:px-[30px]">
          <Link
            href={backHref}
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
            <div className="flex flex-wrap items-center gap-[14px]">
              {/* No "Edit plan" affordance: the author of an editable plan is redirected
                  from /view straight into the editor, so this surface is only ever the
                  coordinator's (or a non-author's read-only) view. */}
              <span className={`text-[13.5px] font-bold ${onTarget ? 'text-[#2E7D5B]' : 'text-[#B0651E]'}`}>
                {total} / {IN_SESSION_TARGET_MINUTES} min
              </span>
              {/* Decision cluster (Return / Approve · Resubmit) — beside the total,
                  per the mock. A divider precedes it (rendered by the cluster). */}
              {decision}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Full-width curriculum reference block — daily outcome / grammar & vocabulary /
          theme span the FULL width like the header (reference content at the top), NOT part
          of the left/right split below. */}
      <div className="px-[22px] pt-[22px] lg:px-[30px]">
        <CurriculumBand curriculum={curriculum} />
      </div>

      {/* Split BEGINS at the SMARTT objective, and uses the SAME grid as the curriculum
          block above — 1.6fr / 1fr columns, 14px gap, same page padding — so the columns
          line up top-to-bottom as ONE grid: the objective + lesson steps take the
          daily-outcome (left) column; the comment cards take the grammar/theme (right)
          column — same width, same left edge. The divide sits on one line the whole way
          down. Below md both columns stack (matching the curriculum band's md breakpoint). */}
      <div className="px-[22px] pb-10 pt-[24px] md:grid md:grid-cols-[1.6fr_1fr] md:gap-[14px] lg:px-[30px]">
        <div className="min-w-0">
        <section>
          <h2 className="mb-[8px] text-[13px] font-bold uppercase tracking-[0.05em] text-text-faint">
            SMARTT objective
          </h2>
          {/* The objective box is a commented SECTION — it carries the teal left
              border and its card floats beside it (sectionKey 'objective'). */}
          <AnnotatedSection
            sectionKey="objective"
            className="rounded-[11px] border border-border bg-surface px-[15px] py-[13px] text-[14px] leading-[1.5] text-neutral-900"
          >
            {/* Stem is a fixed scaffold rendered OUTSIDE the editable value (like
                the wizard editor); only the remainder is fed to ProseField, so a
                coordinator's inline edit never captures the scaffold. */}
            <ObjectiveField
              value={plan.smartt_objective}
              placeholder="No objective written yet."
            />
          </AnnotatedSection>
          {/* Comment trigger + composer sit BELOW the objective — never a floating
              box above it (plain-clicking the text now edits it in place). */}
          <ObjectiveAnnotations />
        </section>

        <section className="mt-[24px]">
          <h2 className="mb-[10px] text-[13px] font-bold uppercase tracking-[0.05em] text-text-faint">
            Lesson blocks
          </h2>
          <div className="flex flex-col gap-[10px]">
            {routineBlocks.length > 0 ? (
              <div className="rounded-[11px] border border-given-border bg-given px-[15px] py-[12px]">
                <div className="flex items-center gap-[8px]">
                  <span className="rounded-badge bg-surface px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-600">
                    {PHASE_LABEL.we_do}
                  </span>
                  <span className="text-[13px] font-semibold text-ink">Standard routines</span>
                  <span className="ml-auto text-[12.5px] font-semibold text-text-faint">
                    {routinesMinutes(plan.blocks)} min
                  </span>
                </div>
                <div className="mt-[7px] flex flex-wrap items-center gap-x-[8px] gap-y-[3px] text-[12.5px] text-neutral-700">
                  {routineBlocks.map((b, i) => (
                    <span key={b.type} className="inline-flex items-center gap-[8px]">
                      {i > 0 ? <span className="text-neutral-300">·</span> : null}
                      <span className="font-medium text-ink">{b.title}</span>
                      <span className="text-text-faint">{blockMinutes(b)} min</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {contentBlocks.map((block, i) => (
              // Each content block is a commented SECTION (sectionKey = its block
              // type) — the teal left border marks it and its cards float beside it.
              <AnnotatedSection
                key={`${block.type}-${i}`}
                sectionKey={block.type}
                className="rounded-[11px] border border-border bg-surface px-[15px] py-[12px]"
              >
                <PhaseRow
                  type={block.type}
                  title={block.title}
                  phase={block.phase}
                  minutes={blockMinutes(block)}
                />
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
              </AnnotatedSection>
            ))}
          </div>
        </section>
        </div>

        {rightRail ? (
          // RIGHT COLUMN (the grammar/theme track): the comment cards live here, each
          // anchored to the vertical position of its section (the pane measures section
          // offsets and packs cards down to avoid overlap). It's a grid column, so its left
          // edge and width match the curriculum's grammar/theme column exactly and its
          // presence never reflows the left column's width. Below md it stacks under the
          // plan; the pane floats (anchors cards) at lg+.
          <div className="relative mt-6 min-w-0 md:mt-0">{rightRail}</div>
        ) : null}
      </div>
    </div>
  );
}
