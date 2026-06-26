'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Block, LessonBlockType, PlanStatus } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import type { EditorPlanData } from '@/lib/editor/load-plan';
import { inSessionMinutes } from '@/lib/blocks';
import { composeObjective, stripStem } from '@/lib/editor/objective';
import { deriveMaterials, getBlock, patchBlock } from '@/lib/editor/plan-blocks';
import {
  normalizeLinkIt,
  applyLinkIt,
  techniqueLabelMap,
  type LinkIt,
} from '@/lib/editor/link-it';
import {
  isObjectiveCheckResult,
  requestObjectiveCheck,
  ObjectiveCheckRequestError,
  type ObjectiveCheckResult,
} from '@/lib/editor/objective-check';
import { saveLessonPlan, submitLessonPlan } from '@/lib/actions/lesson-plan';
import { recordUsageAction } from '@/lib/actions/resources';
import { EditorSubHeader } from '@/components/editor/EditorSubHeader';
import { Stepper, STEP_COUNT } from '@/components/editor/Stepper';
import { SubmitControl } from '@/components/editor/SubmitControl';
import { CurriculumBand } from '@/components/editor/CurriculumBand';
import { ObjectiveStep } from '@/components/editor/ObjectiveStep';
import { ObjectiveBanner } from '@/components/editor/ObjectiveBanner';
import { WritingStep } from '@/components/editor/WritingStep';
import { PractiseStep } from '@/components/editor/PractiseStep';
import type { WorksheetContext } from '@/components/editor/worksheet/context';
import { LinkItStep } from '@/components/editor/LinkItStep';
import { ReviewStep } from '@/components/editor/ReviewStep';

const AUTOSAVE_DELAY_MS = 1500;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Ensure every block carries an explicit editable `minutes` (older plans don't). */
function normalizeBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, minutes: b.minutes ?? b.duration_minutes }));
}

function SaveIndicator({ state }: { state: SaveState }) {
  const t = useTranslations('wizard.save');
  if (state === 'saving') return <span className="text-[13px] text-neutral-600">{t('saving')}</span>;
  if (state === 'error') {
    return <span className="text-[13px] text-pink">{t('failed')}</span>;
  }
  if (state === 'idle') return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-status-approved">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l4 4 10-11" />
      </svg>
      {t('saved')}
    </span>
  );
}

export function LessonPlanEditor({ data }: { data: EditorPlanData }) {
  const { plan, classContext, curriculum, activitiesByBlock, resourceBank } = data;
  const t = useTranslations('wizard');

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
        err instanceof ObjectiveCheckRequestError ? err.message : t('objective.checkFailed'),
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
      setSubmitError(res.error ?? t('errors.couldNotSubmit'));
    }
  }

  const submitControl = (
    <SubmitControl
      status={status}
      canSubmit={canSubmit}
      submitting={submitting}
      onSubmit={handleSubmit}
    />
  );

  const newContentBlock = getBlock(blocks, 'new_content');
  const practiceBlock = getBlock(blocks, 'independent_practice');

  // "Link it together" reads through the read-time normalizer (new or legacy
  // plans → one shape) and writes back into the blocks JSONB on change. The label
  // map resolves technique ids → display names from the real activity bank.
  const linkIt = useMemo(() => normalizeLinkIt(blocks), [blocks]);
  const techniqueLabels = useMemo(
    () => techniqueLabelMap(activitiesByBlock.cfu ?? [], activitiesByBlock.exit_ticket ?? []),
    [activitiesByBlock],
  );
  const onLinkItChange = useCallback(
    (next: LinkIt) => setBlocks((bs) => applyLinkIt(bs, next)),
    [],
  );

  // Real lesson/curriculum/class context for the worksheet builder's locked
  // master frame and the Generate/bank flows. Subject comes from the lesson's
  // subject space (classContext), curriculum from the resolved curriculum_lesson.
  const worksheetContext = useMemo<WorksheetContext>(
    () => ({
      subjectName: classContext.subjectName,
      // Class plans always carry a real class year (0–6). Centre/org plans have
      // no single class, so the loader coerces a missing year to 0; use the
      // plan's own nullable year there to avoid a spurious "Year 0".
      year: classContext.scope === 'class' ? classContext.year : plan.year,
      theme: curriculum?.theme ?? '',
      dailyOutcome: curriculum?.dailyLO ?? '',
      centreName: classContext.schoolName,
      lessonCode: curriculum?.lessonCode ?? plan.curriculum_lesson_id,
      // The worksheet's exit-ticket context now comes from the Link-it model: the
      // chosen exit techniques (label — note), joined.
      exitTicket: linkIt.exitTicket
        .map((e) => [techniqueLabels.get(e.technique) ?? '', e.note.trim()].filter(Boolean).join(' — '))
        .filter(Boolean)
        .join('; '),
      weeklyOutcome: curriculum?.weekLO ?? '',
      monthlyLo: curriculum?.monthlyLO ?? '',
      grammarVocab: curriculum?.grammarVocab ?? '',
      lessonPlanId: plan.id,
      subjectId: classContext.subjectId,
    }),
    [classContext, curriculum, linkIt, techniqueLabels, plan.id, plan.curriculum_lesson_id, plan.year],
  );

  return (
    <div className="mx-auto -my-8 max-w-[1340px]">
      <EditorSubHeader
        classContext={classContext}
        lessonDate={plan.lesson_date}
        total={total}
        actions={<SaveIndicator state={saveState} />}
        showTotal={step === STEP_COUNT}
      />

      <Stepper
        step={step}
        onGo={goStep}
        onBack={() => goStep(step - 1)}
        onNext={() => goStep(step + 1)}
        nextLabel={step === 4 ? t('nav.toReview') : t('nav.next')}
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
            title={t('teach.newContentTitle')}
            block={newContentBlock}
            onPatch={(patch) => patchType('new_content', patch)}
            subjectId={resourceBank.subjectId}
            vocabulary={resourceBank.vocabulary}
            folders={resourceBank.folders}
            attachedResources={attachedFor(newContentBlock)}
            onAttach={(resource) => attachResource('new_content', resource)}
            onRemove={(resourceId) => detachResource('new_content', resourceId)}
          />
        ) : null}

        {step === 3 && practiceBlock ? (
          <PractiseStep
            block={practiceBlock}
            onPatch={(patch) => patchType('independent_practice', patch)}
            worksheet={worksheet}
            onWorksheetChange={setWorksheet}
            context={worksheetContext}
            vocabulary={resourceBank.vocabulary}
          />
        ) : null}

        {step === 4 ? (
          <LinkItStep
            linkIt={linkIt}
            cfuActivities={activitiesByBlock.cfu ?? []}
            exitActivities={activitiesByBlock.exit_ticket ?? []}
            previousDailyLO={curriculum?.previousDailyLO ?? ''}
            onChange={onLinkItChange}
          />
        ) : null}

        {step === 5 ? (
          <ReviewStep
            planId={plan.id}
            status={status}
            blocks={blocks}
            total={total}
            materials={materials}
            worksheet={worksheet}
            worksheetContext={worksheetContext}
            techniqueLabels={techniqueLabels}
            attachedFor={attachedFor}
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
