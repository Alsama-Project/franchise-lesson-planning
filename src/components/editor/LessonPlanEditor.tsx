'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Block, LessonBlockType, PlanStatus } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import type { EditorPlanData } from '@/lib/editor/load-plan';
import { inSessionMinutes } from '@/lib/blocks';
import { composeObjective, stripStem } from '@/lib/editor/objective';
import { deriveMaterials, getBlock, patchBlock, setRoutinesMinutes } from '@/lib/editor/plan-blocks';
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
import {
  saveLessonPlan,
  saveWorksheet,
  submitLessonPlan,
  unsubmitLessonPlan,
} from '@/lib/actions/lesson-plan';
import { recordUsageAction } from '@/lib/actions/resources';
import Link from 'next/link';
import { EditorSubHeader } from '@/components/editor/EditorSubHeader';
import { Stepper, STEP_COUNT } from '@/components/editor/Stepper';
import { SubmitControl } from '@/components/editor/SubmitControl';
import { LockedBanner } from '@/components/editor/LockedBanner';
import { CurriculumCard } from '@/components/editor/CurriculumCard';
import { ObjectiveStep } from '@/components/editor/ObjectiveStep';
import { ObjectiveBanner } from '@/components/editor/ObjectiveBanner';
import { WritingStep } from '@/components/editor/WritingStep';
import { PractiseStep } from '@/components/editor/PractiseStep';
import { WorksheetBuilder } from '@/components/editor/worksheet/WorksheetBuilder';
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

export function LessonPlanEditor({
  data,
  hasFeedback,
  backHref = '/',
}: {
  data: EditorPlanData;
  /** Whether the plan carries any coordinator annotations (comments/suggestions).
   *  The wizard does NOT embed the response thread — the teacher responds on
   *  /plan/[id]/view (one surface). When true, the Review step shows a lightweight
   *  pointer that links there; the accept/reject/reply pane lives only on the view. */
  hasFeedback: boolean;
  /** Where "‹ This week" returns — the board week this plan was opened from. */
  backHref?: string;
}) {
  const { plan, classContext, curriculum, activitiesByBlock, resourceBank } = data;
  const t = useTranslations('wizard');
  const tReview = useTranslations('review');

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
  const [unlocking, setUnlocking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The single source of truth for "the lesson PLAN is locked": one derived value.
  // `submitted` and `approved` both lock the plan pane read-only; `in_progress`
  // and `needs_review` leave it editable. The student WORKSHEET pane is exempt —
  // it stays editable at every status (its writes go through `saveWorksheet`).
  const locked = status === 'submitted' || status === 'approved';

  const total = useMemo(() => inSessionMinutes(blocks), [blocks]);

  // ── Plan autosave ──────────────────────────────────────────────────────────
  // Debounce edits to objective / blocks / materials / check result. The student
  // worksheet is NOT in this payload — it has its own always-on autosave below —
  // so a locked plan can keep saving its worksheet without this path ever writing.
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest `locked` for the debounced writer to read. Kept in a ref (not a
  // dep) so flipping the lock never re-runs the autosave effect — only genuine
  // edits do — which avoids a save flicker on submit/unlock.
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      // Locked plans never persist their plan fields — the plan pane is read-only
      // in `submitted` / `approved`, so a stray state change (e.g. a non-form
      // control slipping past the disabled fieldsets) must not write back.
      if (lockedRef.current) {
        setSaveState('idle');
        return;
      }
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

  // ── Worksheet autosave (always on, every status) ───────────────────────────
  // The student worksheet stays editable and savable regardless of `plan.status`.
  // It patches ONLY the `worksheet` column (via `saveWorksheet`), so it never
  // touches — and never clobbers — the locked plan fields, and it is NOT gated by
  // `locked`. This is the one behaviour that differs from the plan-field lock.
  const wsFirstRender = useRef(true);
  const wsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (wsFirstRender.current) {
      wsFirstRender.current = false;
      return;
    }
    setSaveState('saving');
    if (wsTimer.current) clearTimeout(wsTimer.current);
    wsTimer.current = setTimeout(async () => {
      const res = await saveWorksheet(plan.id, worksheet);
      setSaveState(res.ok ? 'saved' : 'error');
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (wsTimer.current) clearTimeout(wsTimer.current);
    };
  }, [worksheet, plan.id]);

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

  // The Standard-routines row edits a single total; spread it across the three
  // opening routine blocks so their sum (and thus the in-session total) tracks it.
  const setRoutinesMin = useCallback(
    (next: number) => setBlocks((bs) => setRoutinesMinutes(bs, next)),
    [],
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
    // The worksheet is persisted by its own autosave, so it is not part of the
    // submit payload — submit only commits the plan fields + the status move.
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
      setSubmitError(res.error ?? t('errors.couldNotSubmit'));
    }
  }

  // Recall a submitted OR approved plan back to `in_progress`, unlocking the plan
  // pane. The author always lands in `in_progress` (never the prior
  // `needs_review`): the persisted comments carry the "changes requested" context,
  // so the status need not. Reachable from both locked states — the author may now
  // reopen their own approved plan (SubmitControl renders a recall control there).
  async function handleUnlock() {
    setUnlocking(true);
    setSubmitError(null);
    const res = await unsubmitLessonPlan({ id: plan.id });
    setUnlocking(false);
    if (res.ok) {
      setStatus('in_progress');
    } else {
      setSubmitError(res.error ?? t('errors.couldNotUnlock'));
    }
  }

  const submitControl = (
    <SubmitControl
      status={status}
      canSubmit={canSubmit}
      submitting={submitting}
      unlocking={unlocking}
      onSubmit={handleSubmit}
      onUnlock={handleUnlock}
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

  const errorBox = submitError ? (
    <div className="mt-4 rounded-[12px] border border-status-review-border bg-status-review-bg px-4 py-3 text-[13px] text-pink">
      {submitError}
    </div>
  ) : null;

  return (
    // Full-bleed, viewport-tall shell (past `lg`): the context strip + pipeline
    // tracker pin to the top and the working area fills the rest with full height.
    // On Step 1 the working area is one full-width column; on Steps 2–5 it splits
    // into plan (left) · persistent worksheet (right), each scrolling on its own.
    // Below `lg` it falls back to normal document flow (panes stack, page scrolls).
    <div className="-mx-6 -my-8 flex flex-col lg:-mx-10 lg:h-[calc(100vh-var(--app-chrome-height,64px))]">
      <div className="shrink-0">
        <EditorSubHeader
          classContext={classContext}
          lessonDate={plan.lesson_date}
          total={total}
          actions={<SaveIndicator state={saveState} />}
          backHref={backHref}
        />
      </div>

      {/* Pipeline tracker: the 5-step wizard as clickable nodes; Back / Next on
          steps 1–4, the SubmitControl on step 5 (states/colours unchanged). */}
      <div className="shrink-0">
        <Stepper
          step={step}
          onGo={goStep}
          onBack={() => goStep(step - 1)}
          onNext={() => goStep(step + 1)}
          nextLabel={step === 4 ? t('nav.toReview') : t('nav.next')}
          submitSlot={submitControl}
        />
      </div>

      {/* Working area */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {step === 1 ? (
          // STEP 1 — Objective: single full-width column, no worksheet, no divider.
          <section className="min-w-0 flex-1 overflow-visible px-[22px] py-[22px] lg:overflow-y-auto lg:px-[30px]">
            <div className="mx-auto max-w-[860px]">
              {locked ? (
                <LockedBanner status={status} onGoToReview={() => goStep(STEP_COUNT)} />
              ) : null}
              <CurriculumCard curriculum={curriculum} />
              <div className="mt-[22px]">
                <ObjectiveStep
                  remainder={remainder}
                  onChange={setRemainder}
                  checkResult={checkResult}
                  checking={checking}
                  checkError={checkError}
                  onCheck={handleCheck}
                  locked={locked}
                />
              </div>
              {errorBox}
            </div>
          </section>
        ) : (
          // STEPS 2–5 — split: plan (left) · persistent worksheet (right).
          <>
            <section className="min-w-0 flex-1 overflow-visible px-[22px] py-[22px] lg:overflow-y-auto lg:border-e lg:border-[#EFE8DD] lg:px-[30px]">
              <div className="mx-auto max-w-[820px]">
                {locked && step < STEP_COUNT ? (
                  <LockedBanner status={status} onGoToReview={() => goStep(STEP_COUNT)} />
                ) : null}

                <CurriculumCard curriculum={curriculum} />

                <div className="mt-[14px]">
                  <ObjectiveBanner remainder={remainder} />
                </div>

                {step === 2 && newContentBlock ? (
                  <WritingStep
                    title={t('teach.newContentTitle')}
                    block={newContentBlock}
                    onPatch={(patch) => patchType('new_content', patch)}
                    worksheetContext={worksheetContext}
                    vocabulary={resourceBank.vocabulary}
                    attachedResources={attachedFor(newContentBlock)}
                    onAttach={(resource) => attachResource('new_content', resource)}
                    onRemove={(resourceId) => detachResource('new_content', resourceId)}
                    locked={locked}
                  />
                ) : null}

                {step === 3 && practiceBlock ? (
                  <PractiseStep
                    block={practiceBlock}
                    onPatch={(patch) => patchType('independent_practice', patch)}
                    showWorksheet={false}
                    locked={locked}
                  />
                ) : null}

                {step === 4 ? (
                  <LinkItStep
                    linkIt={linkIt}
                    cfuActivities={activitiesByBlock.cfu ?? []}
                    exitActivities={activitiesByBlock.exit_ticket ?? []}
                    previousDailyLO={curriculum?.previousDailyLO ?? ''}
                    onChange={onLinkItChange}
                    locked={locked}
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
                    onRoutinesMinutes={setRoutinesMin}
                    locked={locked}
                  />
                ) : null}

                {step === STEP_COUNT && hasFeedback ? (
                  <div className="mt-[22px]">
                    <Link
                      href={`/plan/${plan.id}/view`}
                      className="flex items-center gap-[10px] rounded-[12px] border border-[#CBE1DA] bg-[#EEF6F3] px-[15px] py-[12px] transition-colors hover:bg-[#E4F0EC]"
                    >
                      <span className="inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-[#1F7A6C] text-white">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-[#15433C]">
                          {tReview('annotations.pointer.title')}
                        </span>
                        <span className="block text-[12.5px] text-[#5C6B66]">
                          {tReview('annotations.pointer.body')}
                        </span>
                      </span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F7A6C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 rtl:-scale-x-100" aria-hidden>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </Link>
                  </div>
                ) : null}

                {errorBox}
              </div>
            </section>

            {/* RIGHT — the persistent student worksheet for Steps 2–5. One
                WorksheetBuilder instance, editable at every step and every plan
                status (never wrapped in the plan-lock fieldset); edits autosave
                through `saveWorksheet`. Scrolls independently past `lg`. */}
            <section className="min-w-0 flex-1 overflow-visible bg-surface-subtle px-[16px] py-[22px] lg:overflow-y-auto lg:px-[22px]">
              <div className="mx-auto max-w-[900px]">
                <WorksheetBuilder
                  value={worksheet}
                  onChange={setWorksheet}
                  context={worksheetContext}
                  vocabulary={resourceBank.vocabulary}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
