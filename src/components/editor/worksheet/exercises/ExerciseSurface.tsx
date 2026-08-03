'use client';

// The generating worksheet pane — mounted by WorksheetPane whenever the document
// editor is live. It loads the plan's exercise rows once, then owns the pane
// header's primary slot, the buffered generation orchestration
// (useWorksheetGeneration), and the body, which is one of three things:
//
//   • no rows, idle   → the untouched continuous DocumentWorksheet (the scaffold —
//     seeded template + its hint placeholders; we do NOT rebuild it here);
//   • filling         → the A4 page holding skeletons at estimated heights;
//   • rows exist       → the A4 page of exercise cards.
//
// Header primary slot, in order (Submit for approval stays in the editor shell):
//   Generate worksheet (teal filled) → Aya is filling your worksheet (inline status)
//   → Regenerate all (teal tinted). Generate has no confirmation; Regenerate all
//   ALWAYS confirms (red only when an edit is at stake — /plan is destructive).

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui/Spinner';
import type { Worksheet, WorksheetV3 } from '@/types/lesson';
import type { TagsByDimension } from '@/types/resource';
import type { WorksheetExercise } from '@/types/worksheet-exercise';
import { loadWorksheetExercises } from '@/lib/actions/worksheet-exercise';
import type { WorksheetContext } from '../context';
import { DocumentWorksheet, type SaveState } from '../doc/DocumentWorksheet';
import { PageFrame } from './PageFrame';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseSkeleton } from './ExerciseSkeleton';
import { IMAGE_CAP, useWorksheetGeneration } from './useWorksheetGeneration';
import { skeletonHeight } from './heights';

interface PaneProps {
  value: unknown;
  onChange: (worksheet: Worksheet | WorksheetV3) => void;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
  saveState?: SaveState;
}

/** Whole-worksheet flattened index of each row's first image slot (for the cap). */
function slotBaseIndices(exercises: WorksheetExercise[]): number[] {
  const bases: number[] = [];
  let running = 0;
  for (const ex of exercises) {
    bases.push(running);
    running += Array.isArray(ex.image_slots) ? ex.image_slots.length : 0;
  }
  return bases;
}

export function GeneratingPane(props: PaneProps) {
  const { context } = props;
  const [loaded, setLoaded] = useState<WorksheetExercise[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadWorksheetExercises(context.lessonPlanId).then((rows) => {
      if (alive) setLoaded(rows);
    });
    return () => {
      alive = false;
    };
  }, [context.lessonPlanId]);

  // Hold the mount until rows are known, so the editor never flashes before cards.
  if (loaded === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-subtle text-neutral-400">
        <Spinner size={20} />
      </div>
    );
  }
  return <GenBody {...props} initialExercises={loaded} />;
}

function GenBody({ value, onChange, context, vocabulary, saveState, initialExercises }: PaneProps & {
  initialExercises: WorksheetExercise[];
}) {
  const t = useTranslations('worksheetGen');
  const gen = useWorksheetGeneration({
    lessonPlanId: context.lessonPlanId,
    subjectId: context.subjectId,
    initialExercises,
    onCompiled: onChange,
  });
  const [confirmAll, setConfirmAll] = useState(false);

  const hasRows = gen.exercises.length > 0;
  const anyEdited = gen.exercises.some((e) => e.status === 'edited');
  const bases = useMemo(() => slotBaseIndices(gen.exercises), [gen.exercises]);

  const readyImages = gen.exercises.reduce(
    (n, e) => n + (e.image_slots?.filter((s) => s.status === 'ready' && s.storage_path).length ?? 0),
    0,
  );
  const totalSlots = gen.exercises.reduce((n, e) => n + (e.image_slots?.length ?? 0), 0);
  const readyCount = gen.exercises.filter((e) => e.status !== 'failed' && e.status !== 'generating').length;
  const failedAny = !gen.filling && gen.exercises.some((e) => e.status === 'failed');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Pane header — print control + the single primary slot, right-aligned. */}
      <div className="ws-no-print relative flex shrink-0 items-center justify-end gap-3 border-b border-[#EFE8DD] bg-surface px-[14px] py-[9px]">
        {totalSlots > 0 ? (
          <span className="text-[12px] text-neutral-500">{t('image.count', { n: readyImages, cap: IMAGE_CAP })}</span>
        ) : null}

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-[6px] rounded-[9px] border border-border-strong bg-surface px-[12px] py-[7px] text-[13px] font-semibold text-ink hover:bg-surface-subtle"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
          </svg>
          {t('print')}
        </button>

        {gen.filling ? (
          <span className="inline-flex items-center gap-2 rounded-[9px] bg-[#E4F0ED] px-[13px] py-[8px] text-[13px] font-semibold text-teal">
            <Spinner size={14} />
            {t('filling')}
          </span>
        ) : hasRows ? (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            className="inline-flex items-center rounded-[9px] bg-[#E4F0ED] px-[13px] py-[8px] text-[13px] font-semibold text-teal hover:bg-[#d6ebe0]"
          >
            {t('regenerateAll')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => gen.generateAll()}
            className="inline-flex items-center rounded-[9px] bg-[#1F7A6C] px-[14px] py-[8px] text-[13px] font-semibold text-white hover:bg-[#186155]"
          >
            {t('generate')}
          </button>
        )}

        {confirmAll ? (
          <div className="absolute end-[14px] top-[calc(100%+6px)] z-30 w-[360px] rounded-[13px] border border-border bg-surface p-[16px] shadow-lg">
            <div className="text-[14px] font-bold text-ink">{t('confirm.allTitle')}</div>
            <p className="mt-1.5 text-[12.5px] leading-[1.5] text-neutral-600">
              {anyEdited ? t('confirm.allEditedBody') : t('confirm.allBody')}
            </p>
            <div className="mt-3.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAll(false)}
                className="rounded-[8px] border border-border-strong bg-surface px-[13px] py-[7px] text-[12.5px] font-semibold text-ink hover:bg-surface-subtle"
              >
                {t('confirm.keep')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmAll(false);
                  gen.generateAll();
                }}
                className="rounded-[8px] px-[13px] py-[7px] text-[12.5px] font-semibold text-white"
                style={{ background: anyEdited ? '#B23A2E' : '#1F7A6C' }}
              >
                {anyEdited ? t('confirm.regenerateAnyway') : t('confirm.regenerate')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {failedAny ? (
        <div className="ws-no-print shrink-0 border-b border-[#ECE0CF] bg-[#FBF6EF] px-[16px] py-[8px] text-[12.5px] text-[#5C544E]">
          <b className="text-ink">{t('partial.someReady', { ready: readyCount, total: gen.exercises.length })}</b>{' '}
          {t('partial.carryOn')}
        </div>
      ) : null}

      {gen.error ? (
        <div className="ws-no-print shrink-0 border-b border-status-review-border bg-status-review-bg px-[16px] py-[8px] text-[12.5px] text-pink">
          {gen.error}
        </div>
      ) : null}

      {/* Body. No rows & idle → the untouched scaffold editor; otherwise the A4 page. */}
      {!gen.filling && !hasRows ? (
        <DocumentWorksheet value={value} onChange={onChange} context={context} vocabulary={vocabulary} saveState={saveState} />
      ) : (
        <PageFrame ctx={context}>
          {gen.filling && gen.fillSpecs ? (
            <div className="flex flex-col gap-[26px]">
              {gen.fillSpecs.map((spec) => (
                <div key={spec.position}>
                  <div className="mb-[9px] text-[15px] font-bold text-ink" dir="auto">{spec.title}</div>
                  <div className="rounded-[16px] bg-[#F7E4EB] p-[10px]">
                    <ExerciseSkeleton height={skeletonHeight(spec.estimated_height)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-[26px]">
              {gen.exercises.map((ex, i) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  position={i + 1}
                  contentLanguage={context.contentLanguage}
                  regenerating={gen.regenerating.has(ex.id)}
                  slotBaseIndex={bases[i]}
                  onRegenerate={() => gen.regenerateCard(ex.id)}
                  onRetry={() => gen.retryCard(ex.id)}
                  onRegenerateSlot={(slotId) => gen.generateSlot(ex.id, slotId, true)}
                  onRetrySlot={(slotId) => gen.generateSlot(ex.id, slotId, false)}
                  onEdit={(doc) => gen.applyEdit(ex.id, doc)}
                />
              ))}
            </div>
          )}
        </PageFrame>
      )}
    </div>
  );
}
