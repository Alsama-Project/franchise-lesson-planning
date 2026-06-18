'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block, PlanStatus } from '@/types/lesson';
import type { EditorPlanData } from '@/lib/editor/load-plan';
import { composeObjective, stripStem } from '@/lib/editor/objective';
import { saveLessonPlan, submitLessonPlan, unsubmitLessonPlan } from '@/lib/actions/lesson-plan';
import { EditorHeader, type SaveState } from '@/components/editor/EditorHeader';
import { SmarttObjectiveBox } from '@/components/editor/SmarttObjectiveBox';
import { BlockList } from '@/components/editor/BlockList';
import { BlockPanel } from '@/components/editor/BlockPanel';

const AUTOSAVE_DELAY_MS = 1500;

export function LessonPlanEditor({ data }: { data: EditorPlanData }) {
  const { plan, classContext, curriculum, activitiesByBlock } = data;

  const [remainder, setRemainder] = useState(() => stripStem(plan.smartt_objective));
  const [blocks, setBlocks] = useState<Block[]>(plan.blocks);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<PlanStatus>(plan.status);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Autosave: debounce edits to objective/blocks, then persist via the action.
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
      });
      setSaveState(res.ok ? 'saved' : 'error');
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [remainder, blocks, plan.id]);

  const updateBlock = useCallback((index: number, patch: Partial<Block>) => {
    setBlocks((bs) => bs.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }, []);

  const canSubmit = remainder.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    if (timer.current) clearTimeout(timer.current);
    const res = await submitLessonPlan({
      id: plan.id,
      smartt_objective: composeObjective(remainder),
      blocks,
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
    if (res.ok) {
      setStatus('in_progress');
    } else {
      setSubmitError(res.error ?? 'Could not revert to in progress.');
    }
  }

  const selectedBlock = blocks[selected];
  const activities = selectedBlock ? activitiesByBlock[selectedBlock.type] ?? [] : [];

  return (
    <div>
      <EditorHeader
        classContext={classContext}
        curriculum={curriculum}
        lessonDate={plan.lesson_date}
        saveState={saveState}
        status={status}
        canSubmit={canSubmit}
        submitting={submitting}
        onSubmit={handleSubmit}
        onUnsubmit={handleUnsubmit}
      />

      <div className="px-[22px]">
        <SmarttObjectiveBox remainder={remainder} onChange={setRemainder} />
        {submitError ? (
          <div className="mt-2 rounded-sm border border-status-review-border bg-status-review-bg px-3 py-2 text-[13px] text-pink">
            {submitError}
          </div>
        ) : null}
      </div>

      <div className="mt-[18px] grid grid-cols-1 border-t border-border lg:grid-cols-[360px_1fr]">
        <BlockList blocks={blocks} selected={selected} onSelect={setSelected} />
        {selectedBlock ? (
          <BlockPanel
            block={selectedBlock}
            activities={activities}
            literacy={classContext.literacy}
            onChange={(patch) => updateBlock(selected, patch)}
          />
        ) : null}
      </div>
    </div>
  );
}
