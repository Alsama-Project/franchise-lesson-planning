'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block, LessonBlockType, PlanStatus } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import type { EditorPlanData } from '@/lib/editor/load-plan';
import { inSessionMinutes } from '@/lib/blocks';
import { composeObjective, stripStem } from '@/lib/editor/objective';
import { deriveMaterials, getBlock, patchBlock } from '@/lib/editor/plan-blocks';
import { STAGE_KEYWORDS, type SuggestContext } from '@/lib/editor/resource-suggest';
import {
  isObjectiveCheckResult,
  requestObjectiveCheck,
  ObjectiveCheckRequestError,
  type ObjectiveCheckResult,
} from '@/lib/editor/objective-check';
import { saveLessonPlan, submitLessonPlan, unsubmitLessonPlan } from '@/lib/actions/lesson-plan';
import { recordUsageAction } from '@/lib/actions/resources';
import { EditorSubHeader } from '@/components/editor/EditorSubHeader';
import { Stepper, STEP_COUNT } from '@/components/editor/Stepper';
import { SubmitControl } from '@/components/editor/SubmitControl';
import { CurriculumBand } from '@/components/editor/CurriculumBand';
import { ObjectiveStep } from '@/components/editor/ObjectiveStep';
import { ObjectiveBanner } from '@/components/editor/ObjectiveBanner';
import { WritingStep } from '@/components/editor/WritingStep';
import { WorksheetBuilder } from '@/components/editor/WorksheetBuilder';
import { LinkItStep } from '@/components/editor/LinkItStep';
import { ReviewStep } from '@/components/editor/ReviewStep';

const AUTOSAVE_DELAY_MS = 1500;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Ensure every block carries an explicit editable `minutes` (older plans don't). */
function normalizeBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, minutes: b.minutes ?? b.duration_minutes }));
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') return <span className="text-[13px] text-neutral-600">Saving…</span>;
  if (state === 'error') {
    return <span className="text-[13px] text-pink">Save failed — retrying on next edit</span>;
  }
  if (state === 'idle') return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-status-approved">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l4 4 10-11" />
      </svg>
      Saved
    </span>
  );
}

export function LessonPlanEditor({ data }: { data: EditorPlanData }) {
  const { plan, classContext, curriculum, activitiesByBlock, resourceBank } = data;

  const [step, setStep] = useState(1);
  const [remainder, setRemainder] = useState(() => stripStem(plan.smartt_objective));
  const [blocks, setBlocks] = useState<Block[]>(() => normalizeBlocks(plan.blocks));
  const [worksheet, setWorksheet] = useState<unknown>(() => plan.worksheet);
  const [materials, setMaterials] = useState<string[]>(() =>
    Array.isArray(plan.requiredMaterials) && plan.requiredMaterials.length > 0
      ? (plan.requiredMaterials as string[])
      : deriveMaterials(plan.blocks),
  );

  // A client-side cache of resources attached to any section, seeded from the
  // loader and grown as the teacher attaches more — so the "Attached from the
  // bank" lists and ✓ Added state resolve without a round-trip.
  const [resourceCache, setResourceCache] = useState<Record<string, ResourceWithTags>>(() =>
    Object.fromEntries(resourceBank.attached.map((r) => [r.id, r])),
  );
  const [checkResult, setCheckResult] = useState<ObjectiveCheckResult | null>(() =>
    isObjectiveCheckResult(plan.smartt_check) ? plan.smartt_check : null,
  );
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [status, setStatus] = useState<PlanStatus>(plan.status);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const total = useMemo(() => inSessionMinutes(blocks), [blocks]);

  // Autosave: debounce edits to objective / blocks / materials / check result.
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await saveLessonPlan({
        id: plan.id,
        smartt_objective: composeObjective(remainder),
        blocks,
        required_materials: materials,
        smartt_check: checkResult ?? undefined,
        worksheet,
      });
      setSaveState(res.ok ? 'saved' : 'error');
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [remainder, blocks, materials, checkResult, worksheet, plan.id]);

  const goStep = useCallback((n: number) => {
    setStep(Math.max(1, Math.min(STEP_COUNT, n)));
  }, []);

  const patchType = useCallback((type: LessonBlockType, patch: Partial<Block>) => {
    setBlocks((bs) => patchBlock(bs, type, patch));
  }, []);

  const setBlockMinutes = useCallback(
    (type: LessonBlockType, next: number) => patchType(type, { minutes: Math.max(0, next) }),
    [patchType],
  );

  // Attach a resource to a section: cache it, write its id onto the block (the
  // blocks change is what autosave persists), and record a use against this plan.
  const attachResource = useCallback(
    (type: LessonBlockType, resource: ResourceWithTags) => {
      setResourceCache((prev) => ({ ...prev, [resource.id]: resource }));
      setBlocks((bs) => {
        const block = getBlock(bs, type);
        const ids = block?.resourceIds ?? [];
        if (ids.includes(resource.id)) return bs;
        return patchBlock(bs, type, { resourceIds: [...ids, resource.id] });
      });
      // Fire-and-forget: a usage row feeds popularity + the user's "Most used".
      void recordUsageAction(resource.id, plan.id);
    },
    [plan.id],
  );

  const detachResource = useCallback((type: LessonBlockType, resourceId: string) => {
    setBlocks((bs) => {
      const block = getBlock(bs, type);
      const ids = (block?.resourceIds ?? []).filter((id) => id !== resourceId);
      return patchBlock(bs, type, { resourceIds: ids });
    });
  }, []);

  /** Resolve a block's attached resource ids to full resources via the cache. */
  const attachedFor = useCallback(
    (block: Block | undefined): ResourceWithTags[] =>
      (block?.resourceIds ?? [])
        .map((id) => resourceCache[id])
        .filter((r): r is ResourceWithTags => !!r),
    [resourceCache],
  );

  const teachContext = useMemo<SuggestContext>(
    () => ({
      subjectId: classContext.subjectId,
      year: classContext.year,
      themeLabel: curriculum?.theme ?? null,
      skillLabel: curriculum?.focusArea ?? null,
      stageKeywords: STAGE_KEYWORDS.teach,
    }),
    [classContext.subjectId, classContext.year, curriculum?.theme, curriculum?.focusArea],
  );

  const practiseContext = useMemo<SuggestContext>(
    () => ({ ...teachContext, stageKeywords: STAGE_KEYWORDS.practise }),
    [teachContext],
  );

  const canSubmit = remainder.trim().length > 0;

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await requestObjectiveCheck(composeObjective(remainder) || remainder, {
        dailyOutcome: curriculum?.dailyLO || undefined,
        grammarVocab: curriculum?.grammarVocab || undefined,
        theme: curriculum?.theme || undefined,
        year: classContext.year,
      });
      setCheckResult(result);
    } catch (err) {
      setCheckError(
        err instanceof ObjectiveCheckRequestError ? err.message : 'The objective check failed.',
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    if (timer.current) clearTimeout(timer.current);
    const res = await submitLessonPlan({
      id: plan.id,
      smartt_objective: composeObjective(remainder),
      blocks,
      required_materials: materials,
      smartt_check: checkResult ?? undefined,
      worksheet,
    });
    setSubmitting(false);
    if (res.ok) {
      setStatus('submitted');
      setSaveState('saved');
    } else {
      setSubmitError(res.error ?? 'Could not submit.');
    }
  }

  async function handleUnsubmit() {
    setSubmitting(true);
    setSubmitError(null);
    const res = await unsubmitLessonPlan({ id: plan.id });
    setSubmitting(false);
    if (res.ok) setStatus('in_progress');
    else setSubmitError(res.error ?? 'Could not revert to in progress.');
  }

  const submitControl = (
    <SubmitControl
      status={status}
      canSubmit={canSubmit}
      submitting={submitting}
      onSubmit={handleSubmit}
      onUnsubmit={handleUnsubmit}
    />
  );

  const newContentBlock = getBlock(blocks, 'new_content');
  const practiceBlock = getBlock(blocks, 'independent_practice');
  const cfuBlock = getBlock(blocks, 'cfu');
  const exitBlock = getBlock(blocks, 'exit_ticket');

  return (
    <div className="mx-auto -my-8 max-w-[1340px]">
      <EditorSubHeader
        classContext={classContext}
        lessonDate={plan.lesson_date}
        total={total}
        actions={<SaveIndicator state={saveState} />}
      />

      <Stepper
        step={step}
        onGo={goStep}
        onBack={() => goStep(step - 1)}
        onNext={() => goStep(step + 1)}
        nextLabel={step === 4 ? 'Review →' : 'Next →'}
        submitSlot={submitControl}
      />

      <div className="px-[22px] pb-10 pt-[22px] lg:px-[30px]">
        {step === 1 ? <CurriculumBand curriculum={curriculum} /> : null}

        {step > 1 ? <ObjectiveBanner remainder={remainder} /> : null}

        {step === 1 ? (
          <ObjectiveStep
            remainder={remainder}
            onChange={setRemainder}
            checkResult={checkResult}
            checking={checking}
            checkError={checkError}
            onCheck={handleCheck}
          />
        ) : null}

        {step === 2 && newContentBlock ? (
          <WritingStep
            title="Teach the new content"
            block={newContentBlock}
            onPatch={(patch) => patchType('new_content', patch)}
            subjectId={resourceBank.subjectId}
            vocabulary={resourceBank.vocabulary}
            folders={resourceBank.folders}
            suggestContext={teachContext}
            attachedResources={attachedFor(newContentBlock)}
            onAttach={(resource) => attachResource('new_content', resource)}
            onRemove={(resourceId) => detachResource('new_content', resourceId)}
          />
        ) : null}

        {step === 3 && practiceBlock ? (
          <WritingStep
            title="Practise"
            block={practiceBlock}
            onPatch={(patch) => patchType('independent_practice', patch)}
            subjectId={resourceBank.subjectId}
            vocabulary={resourceBank.vocabulary}
            folders={resourceBank.folders}
            suggestContext={practiseContext}
            attachedResources={attachedFor(practiceBlock)}
            onAttach={(resource) => attachResource('independent_practice', resource)}
            onRemove={(resourceId) => detachResource('independent_practice', resourceId)}
            worksheetSlot={
              <WorksheetBuilder
                value={worksheet as Parameters<typeof WorksheetBuilder>[0]['value']}
                onChange={setWorksheet}
              />
            }
          />
        ) : null}

        {step === 4 && cfuBlock && exitBlock ? (
          <LinkItStep
            cfuBlock={cfuBlock}
            exitBlock={exitBlock}
            cfuActivities={activitiesByBlock.cfu ?? []}
            exitActivities={activitiesByBlock.exit_ticket ?? []}
            literacy={classContext.literacy}
            onCfuChange={(patch) => patchType('cfu', patch)}
            onExitChange={(patch) => patchType('exit_ticket', patch)}
          />
        ) : null}

        {step === 5 ? (
          <ReviewStep
            planId={plan.id}
            status={status}
            blocks={blocks}
            total={total}
            materials={materials}
            onMaterialsChange={setMaterials}
            onBlockMinutes={setBlockMinutes}
          />
        ) : null}

        {submitError ? (
          <div className="mt-4 rounded-[12px] border border-status-review-border bg-status-review-bg px-4 py-3 text-[13px] text-pink">
            {submitError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
