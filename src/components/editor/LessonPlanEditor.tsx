'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block, LessonBlockType, PlanStatus, TeachingPhase } from '@/types/lesson';
import type { EditorPlanData } from '@/lib/editor/load-plan';
import { blockMinutes, inSessionMinutes } from '@/lib/blocks';
import { composeObjective, stripStem } from '@/lib/editor/objective';
import { deriveMaterials, getBlock, patchBlock } from '@/lib/editor/plan-blocks';
import {
  isObjectiveCheckResult,
  requestObjectiveCheck,
  ObjectiveCheckRequestError,
  type ObjectiveCheckResult,
} from '@/lib/editor/objective-check';
import { saveLessonPlan, submitLessonPlan, unsubmitLessonPlan } from '@/lib/actions/lesson-plan';
import { EditorSubHeader } from '@/components/editor/EditorSubHeader';
import { Stepper, STEP_COUNT } from '@/components/editor/Stepper';
import { SubmitControl } from '@/components/editor/SubmitControl';
import { CurriculumBand } from '@/components/editor/CurriculumBand';
import { ObjectiveStep } from '@/components/editor/ObjectiveStep';
import { ObjectiveBanner } from '@/components/editor/ObjectiveBanner';
import { PlaceholderStep } from '@/components/editor/PlaceholderStep';
import { LinkItStep } from '@/components/editor/LinkItStep';
import { ReviewStep } from '@/components/editor/ReviewStep';
import { Spinner } from '@/components/ui/Spinner';

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
  const { plan, classContext, curriculum, activitiesByBlock } = data;

  const [step, setStep] = useState(1);
  const [remainder, setRemainder] = useState(() => stripStem(plan.smartt_objective));
  const [blocks, setBlocks] = useState<Block[]>(() => normalizeBlocks(plan.blocks));
  const [materials, setMaterials] = useState<string[]>(() =>
    Array.isArray(plan.requiredMaterials) && plan.requiredMaterials.length > 0
      ? (plan.requiredMaterials as string[])
      : deriveMaterials(plan.blocks),
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
      });
      setSaveState(res.ok ? 'saved' : 'error');
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [remainder, blocks, materials, checkResult, plan.id]);

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
    <div className="-mx-6 -my-8 lg:-mx-10">
      <EditorSubHeader
        classContext={classContext}
        lessonDate={plan.lesson_date}
        total={total}
        actions={
          <>
            <SaveIndicator state={saveState} />
            <a
              href={`/api/pdf/plan/${plan.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[7px] rounded-[9px] border border-border-strong bg-surface px-[13px] py-2 text-[13px] font-medium text-ink hover:bg-surface-subtle"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              Download
            </a>
          </>
        }
      />

      <Stepper
        step={step}
        onGo={goStep}
        onBack={() => goStep(step - 1)}
        onNext={() => goStep(step + 1)}
        nextLabel={step === 4 ? 'Review lesson →' : 'Next →'}
        submitSlot={submitControl}
      />

      <div className="px-[22px] pb-10 pt-[22px] lg:px-[30px]">
        <CurriculumBand curriculum={curriculum} />

        {step > 1 ? (
          <div className="mt-[18px]">
            <ObjectiveBanner remainder={remainder} />
          </div>
        ) : null}

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
          <PlaceholderStep
            title="Teach the new content"
            subtitle="Model the reading, then guide the class through it."
            phase={newContentBlock.phase}
            onPhaseChange={(phase) =>
              patchType('new_content', { phase: phase as TeachingPhase | null })
            }
            minutes={blockMinutes(newContentBlock)}
            onMinutesChange={(next) => setBlockMinutes('new_content', next)}
            body="The two-pane writing area (What the teacher does / What students do) and the embedded resource bank arrive in Part 2. Phase and time are live now and feed the running total and Review."
          />
        ) : null}

        {step === 3 && practiceBlock ? (
          <PlaceholderStep
            title="Practise"
            subtitle="Plan the practice, then build the worksheet students use."
            phase={practiceBlock.phase}
            onPhaseChange={(phase) =>
              patchType('independent_practice', { phase: phase as TeachingPhase | null })
            }
            minutes={blockMinutes(practiceBlock)}
            onMinutesChange={(next) => setBlockMinutes('independent_practice', next)}
            body="The practice writing area, the student-worksheet builder, and the embedded resource bank arrive in Part 2. Phase and time are live now and feed the running total and Review."
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

        {/* Bottom step navigation (mirrors the stepper's group). */}
        <div className="mt-[22px] flex items-center justify-between gap-4 border-t border-[#EFE8DD] pt-[18px]">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => goStep(step - 1)}
              className="rounded-[10px] border border-border-strong bg-surface px-[18px] py-2.5 text-[14px] font-medium text-ink hover:bg-surface-subtle"
            >
              ← Back
            </button>
          ) : (
            <span className="text-[13px] text-neutral-400">Step 1 of 5 — start here</span>
          )}
          <div className="text-[13px] text-neutral-600">
            Step <b className="text-ink">{step}</b> of {STEP_COUNT}
          </div>
          {step < STEP_COUNT ? (
            <button
              type="button"
              onClick={() => goStep(step + 1)}
              className="inline-flex items-center gap-2 rounded-[10px] border-none bg-teal px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#1a6a5d]"
            >
              {submitting ? <Spinner size={14} /> : null}
              {step === 4 ? 'Review lesson →' : 'Next →'}
            </button>
          ) : (
            submitControl
          )}
        </div>
      </div>
    </div>
  );
}
