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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CardConfirm } from './CardConfirm';
import { IMAGE_CAP, useWorksheetGeneration } from './useWorksheetGeneration';
import { skeletonHeight } from './heights';
import { ZoomControls } from '../doc/ZoomControls';
import { clampZoom, round2, ZOOM_STEP } from '../doc/zoom';

/** Which worksheet surface the teacher is looking at when rows exist. Cards are the
 *  generation + review step; the document is the artifact once they are happy. */
type SurfaceMode = 'cards' | 'document';

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

  // The document dirty flag: true once the teacher edits the continuous document and
  // false again once a compile has run. It lives HERE, not in the generation hook,
  // because the two writers to `worksheet` are distinguishable at this boundary — a
  // DOCUMENT edit flows through `handleDocumentEdit` (sets the flag), a COMPILE write
  // flows through `handleCompiled` (clears it). The hook stays untouched.
  const [documentDirty, setDocumentDirty] = useState(false);

  // A compile write (the four triggers → compileAndPersist → onCompiled). Clearing the
  // flag here means "reset after a compile completes", for every trigger, in one place.
  const handleCompiled = useCallback(
    (doc: WorksheetV3) => {
      setDocumentDirty(false);
      onChange(doc);
    },
    [onChange],
  );

  // A teacher edit in the document surface. TipTap does not fire onUpdate for the
  // initial `content` seed, so mounting / remounting the editor never trips this —
  // only real edits do.
  const handleDocumentEdit = useCallback(
    (ws: Worksheet | WorksheetV3) => {
      setDocumentDirty(true);
      onChange(ws);
    },
    [onChange],
  );

  const gen = useWorksheetGeneration({
    lessonPlanId: context.lessonPlanId,
    subjectId: context.subjectId,
    initialExercises,
    onCompiled: handleCompiled,
  });
  const [confirmAll, setConfirmAll] = useState(false);

  // ── Page zoom (view-only CSS scale on the worksheet page) ─────────────────────
  // Ephemeral, like `mode`: resets to 100% on reload, applies to whichever surface
  // is showing, changes nothing persisted/compiled/printed. Buttons + this keyboard
  // handler drive it; pinch is handled inside ZoomPage.
  const [zoom, setZoom] = useState(1);
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(round2(z + ZOOM_STEP))), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(round2(z - ZOOM_STEP))), []);
  const resetZoom = useCallback(() => setZoom(1), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut, resetZoom]);

  const hasRows = gen.exercises.length > 0;

  // Surface mode (only meaningful once rows exist). No rows → the document is the only
  // surface. Rows present → default to cards so the teacher sees generated output
  // before working on it, then they toggle freely. Mode is ephemeral component state:
  // a reload returns to this default (documented; not persisted for this branch).
  const [mode, setMode] = useState<SurfaceMode>(() => (initialExercises.length > 0 ? 'cards' : 'document'));
  // Land on cards exactly once, when rows first appear (e.g. after the first Generate).
  // A ref (not a hasRows effect that re-runs) so a later teacher switch to the document
  // is never overridden.
  const landedOnCards = useRef(initialExercises.length > 0);
  useEffect(() => {
    if (hasRows && !landedOnCards.current) {
      landedOnCards.current = true;
      setMode('cards');
    }
  }, [hasRows]);

  // A pending compile action, deferred behind the "your document will be replaced"
  // confirmation. Set only when the document is dirty; otherwise the action runs at
  // once. One gate, one string, across every compile trigger.
  const [pendingCompile, setPendingCompile] = useState<null | (() => void)>(null);
  const guardCompile = useCallback(
    (action: () => void) => {
      if (documentDirty) setPendingCompile(() => action);
      else action();
    },
    [documentDirty],
  );
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Pane header — print control + the single primary slot, right-aligned. */}
      <div className="ws-no-print relative flex shrink-0 items-center justify-end gap-3 border-b border-[#EFE8DD] bg-surface px-[14px] py-[9px]">
        {/* Card ⇄ document toggle — offered only when rows exist (with none, cards have
            nothing to show) and not mid-fill. Switching compiles nothing and discards
            nothing; it only changes which surface renders. */}
        {hasRows && !gen.filling ? (
          <div className="me-auto inline-flex rounded-[9px] border border-border bg-surface-subtle p-[3px]">
            <ViewTab active={mode === 'cards'} onClick={() => setMode('cards')}>
              {t('view.cards')}
            </ViewTab>
            <ViewTab active={mode === 'document'} onClick={() => setMode('document')}>
              {t('view.document')}
            </ViewTab>
          </div>
        ) : null}

        {totalSlots > 0 ? (
          <span className="text-[12px] text-neutral-500">{t('image.count', { n: readyImages, cap: IMAGE_CAP })}</span>
        ) : null}

        {/* Page zoom — a view control over whichever surface is showing. */}
        <ZoomControls zoom={zoom} onZoomOut={zoomOut} onZoomIn={zoomIn} onReset={resetZoom} />

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
          // No rows → the document surface is showing; the teacher may have edited the
          // scaffold, so gate Generate too (destructive /plan → recompile).
          <button
            type="button"
            onClick={() => guardCompile(() => gen.generateAll())}
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
            {/* Regenerate all also recompiles, which replaces the whole document — warn
                when it carries edits, reusing the shared document-replaced string. */}
            {documentDirty ? (
              <p className="mt-1.5 text-[12.5px] leading-[1.5] text-neutral-600">{t('confirm.documentEditedBody')}</p>
            ) : null}
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
                style={{ background: anyEdited || documentDirty ? '#B23A2E' : '#1F7A6C' }}
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

      {/* Body. Mid-fill → skeletons. Otherwise: no rows OR document mode → the
          continuous document editor; cards mode with rows → the A4 page of cards.
          Switching mode never compiles or discards; the document remounts and re-seeds
          from live `value` (cursor/scroll/undo reset, content safe). */}
      {!gen.filling && (!hasRows || mode === 'document') ? (
        <DocumentWorksheet
          value={value}
          onChange={handleDocumentEdit}
          context={context}
          vocabulary={vocabulary}
          saveState={saveState}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      ) : (
        <PageFrame ctx={context} zoom={zoom} onZoomChange={setZoom}>
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
                  onRegenerate={() => guardCompile(() => gen.regenerateCard(ex.id))}
                  onRetry={() => guardCompile(() => gen.retryCard(ex.id))}
                  onRegenerateSlot={(slotId) => guardCompile(() => gen.generateSlot(ex.id, slotId, true))}
                  onRetrySlot={(slotId) => guardCompile(() => gen.generateSlot(ex.id, slotId, false))}
                  onEdit={(doc) => guardCompile(() => gen.applyEdit(ex.id, doc))}
                />
              ))}
            </div>
          )}
        </PageFrame>
      )}

      {/* The document-replaced gate — shown before any compile trigger when the teacher
          has edited the document since the last compile. One dialog, one string, for
          every trigger. Confirm runs the deferred action (which recompiles and clears
          the flag); Keep aborts it and the document is left untouched. */}
      {pendingCompile ? (
        <CardConfirm
          title={t('confirm.documentEditedTitle')}
          body={t('confirm.documentEditedBody')}
          confirmLabel={t('confirm.documentEditedConfirm')}
          cancelLabel={t('confirm.documentEditedKeep')}
          danger
          onConfirm={() => {
            const action = pendingCompile;
            setPendingCompile(null);
            action?.();
          }}
          onCancel={() => setPendingCompile(null)}
        />
      ) : null}
    </div>
  );
}

/** A segmented-control tab for the card ⇄ document toggle (matches the review pane's
 *  segmented toggle styling). */
function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-[7px] px-[12px] py-[5px] text-[12.5px] font-semibold transition-colors ' +
        (active ? 'bg-surface text-ink shadow-sm' : 'text-neutral-500 hover:text-ink')
      }
    >
      {children}
    </button>
  );
}
