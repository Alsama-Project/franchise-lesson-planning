'use client';

// The generating worksheet pane — mounted by WorksheetPane whenever the document
// editor is live. It loads the plan's exercise rows once, then owns the pane
// header's primary slot, the buffered generation orchestration
// (useWorksheetGeneration), and the ONE surface: the continuous document editor.
//
// There is no cards/document toggle any more — the document is the only surface, the
// way a teacher expects a worksheet to behave. Per-exercise regenerate survives as a
// gutter affordance inside the document (anchored to each exercise's identity), and
// splices a single exercise's nodes in place rather than rebuilding the document, so
// the teacher's own edits are never lost.
//
// Header primary slot, in order (Submit for approval stays in the editor shell):
//   Generate worksheet (teal filled) → Aya is filling your worksheet (inline status)
//   → Regenerate all (teal tinted). Generate has no confirmation unless the teacher
//   has edited the document (it rebuilds the whole doc); Regenerate all ALWAYS
//   confirms (both are destructive — /plan replaces every exercise).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui/Spinner';
import type { Worksheet, WorksheetV3 } from '@/types/lesson';
import type { TagsByDimension } from '@/types/resource';
import type { WorksheetExercise } from '@/types/worksheet-exercise';
import { loadWorksheetExercises } from '@/lib/actions/worksheet-exercise';
import type { WorksheetContext } from '../context';
import { DocumentWorksheet, type DocumentWorksheetHandle, type SaveState } from '../doc/DocumentWorksheet';
import { CardConfirm } from './CardConfirm';
import { IMAGE_CAP, useWorksheetGeneration, type FillStage } from './useWorksheetGeneration';
import { WorksheetSkeleton } from './WorksheetSkeleton';
import { summariseWorksheetImages } from '@/lib/worksheet/image-summary';
import { ZoomControls } from '../doc/ZoomControls';
import { clampZoom, round2, ZOOM_STEP } from '../doc/zoom';

interface PaneProps {
  value: unknown;
  onChange: (worksheet: Worksheet | WorksheetV3) => void;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
  saveState?: SaveState;
}

/**
 * The header status line for a full generation — the REAL stage, not a spinner caption.
 * Each phase says what is actually happening now; `exercises` / `images` carry their live
 * count. Falls back to the generic "filling" string only for the sliver before the first
 * stage is set (filling and stage are set together, so this is effectively unreachable).
 */
function fillStageLabel(
  t: ReturnType<typeof useTranslations<'worksheetGen'>>,
  stage: FillStage | null,
): string {
  switch (stage?.phase) {
    case 'planning':
      return t('progress.planning');
    case 'exercises':
      return t('progress.exercises', { n: stage.index, total: stage.total });
    case 'images':
      return t('progress.images', { n: stage.index, total: stage.total });
    case 'compiling':
      return t('progress.compiling');
    default:
      return t('filling');
  }
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

  // Hold the mount until rows are known, so the editor never flashes before content.
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

  // The live document editor, written to imperatively for whole-document builds
  // (initial Generate / Regenerate all). Per-exercise regenerate splices through the
  // editor internally — see DocumentWorksheet.onRegenerateExercise.
  const docRef = useRef<DocumentWorksheetHandle>(null);

  // The document dirty flag: true once the teacher edits the document, false again
  // after a whole-document build. It gates the "your document will be replaced"
  // confirmation on Generate / Regenerate all (both rebuild the whole doc). A
  // per-exercise regenerate never sets or clears it — it never rebuilds.
  const [documentDirty, setDocumentDirty] = useState(false);

  // A whole-document build result (initial Generate / Regenerate all). It is applied
  // to the LIVE editor — never round-tripped through `value` (the seed-once editor
  // would ignore that) — so the editor's own onUpdate persists it through the one
  // debounce. Clearing the dirty flag here means "the document now matches the rows".
  const handleCompiled = useCallback((doc: WorksheetV3) => {
    docRef.current?.applyFullDoc(doc);
    setDocumentDirty(false);
  }, []);

  const gen = useWorksheetGeneration({
    lessonPlanId: context.lessonPlanId,
    subjectId: context.subjectId,
    initialExercises,
    onCompiled: handleCompiled,
  });
  const [confirmAll, setConfirmAll] = useState(false);

  // ── Page zoom (view-only CSS scale on the worksheet page) ─────────────────────
  // Ephemeral: resets to 100% on reload, changes nothing persisted/compiled/printed.
  // Buttons + this keyboard handler drive it; pinch is handled inside ZoomPage.
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

  // A pending compile action, deferred behind the "your document will be replaced"
  // confirmation. Set only when the document is dirty; otherwise the action runs at
  // once. Applies to whole-document builds (Generate); Regenerate all has its own
  // always-on confirm below.
  const [pendingCompile, setPendingCompile] = useState<null | (() => void)>(null);
  const guardCompile = useCallback(
    (action: () => void) => {
      if (documentDirty) setPendingCompile(() => action);
      else action();
    },
    [documentDirty],
  );

  // A real teacher edit in the document. Marks it dirty so the next whole-document
  // build warns before replacing it. Programmatic writes (our splice / full build)
  // never call this — DocumentWorksheet suppresses them.
  const onTeacherEdit = useCallback(() => setDocumentDirty(true), []);

  // The TRUE per-worksheet image tally: requested/completed for THIS sheet, failures
  // counted, and the cap surfaced only when it is actually exceeded (see image-summary).
  const {
    total: totalSlots,
    requested: requestedImages,
    ready: readyImages,
    failed: failedImages,
    capped: cappedImages,
  } = summariseWorksheetImages(gen.exercises, IMAGE_CAP);
  const readyCount = gen.exercises.filter((e) => e.status !== 'failed' && e.status !== 'generating').length;
  const failedAny = !gen.filling && gen.exercises.some((e) => e.status === 'failed');

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Pane header — print control + the single primary slot, right-aligned. */}
      <div className="ws-no-print relative flex shrink-0 items-center justify-end gap-3 border-b border-[#EFE8DD] bg-surface px-[14px] py-[9px]">
        {/* True per-worksheet counter: completed of requested (not the raw cap).
            Hidden while filling — the hook only settles the slot state at the atomic
            reveal, so a mid-run count would be stale. */}
        {!gen.filling && totalSlots > 0 ? (
          <span className="me-auto text-[12px] text-neutral-500">
            {t('image.count', { done: readyImages, total: requestedImages })}
            {failedImages > 0 ? <span className="text-pink"> · {t('image.failedInline', { n: failedImages })}</span> : null}
          </span>
        ) : null}

        {/* Page zoom — a view control over the document surface. */}
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
            {fillStageLabel(t, gen.stage)}
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
          // No rows → the teacher may have edited the scaffold; gate Generate too
          // (destructive /plan → whole-document rebuild).
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
            <p className="mt-1.5 text-[12.5px] leading-[1.5] text-neutral-600">{t('confirm.allBody')}</p>
            {/* Regenerate all rebuilds the whole document — warn when it carries edits,
                reusing the shared document-replaced string. */}
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
                style={{ background: documentDirty ? '#B23A2E' : '#1F7A6C' }}
              >
                {t('confirm.regenerate')}
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

      {/* Images turned off / not configured — the 503 short-circuit is now SAID once,
          clearly, instead of silently leaving raw [Picture: …] markers unexplained. */}
      {!gen.filling && gen.imagesDisabled ? (
        <div className="ws-no-print shrink-0 border-b border-[#ECE0CF] bg-[#FBF6EF] px-[16px] py-[8px] text-[12.5px] text-[#5C544E]">
          {t('image.disabledNotice')}
        </div>
      ) : null}

      {/* A slot that was requested and FAILED — a distinct, actionable trace, never
          confused with an exercise that simply has no picture (which shows nothing). */}
      {!gen.filling && !gen.imagesDisabled && failedImages > 0 ? (
        <div className="ws-no-print shrink-0 border-b border-[#ECE0CF] bg-[#FBF6EF] px-[16px] py-[8px] text-[12.5px] text-[#5C544E]">
          {t('image.failedNotice', { n: failedImages, total: requestedImages })}
        </div>
      ) : null}

      {/* The cap only becomes the teacher's business when it is actually reached. */}
      {!gen.filling && cappedImages > 0 ? (
        <div className="ws-no-print shrink-0 border-b border-[#ECE0CF] bg-[#FBF6EF] px-[16px] py-[8px] text-[12.5px] text-[#5C544E]">
          {t('image.capNote', { over: cappedImages, cap: IMAGE_CAP })}
        </div>
      ) : null}

      {/* The one surface: the continuous document editor. Whole-document builds land
          via docRef.applyFullDoc; per-exercise regenerate splices through the editor.
          While a full generation is filling, the skeleton overlay sits on top at the
          estimated heights (from the plan's specs) and is lifted at the atomic reveal —
          the page fills with structure, then content lands in one pass. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DocumentWorksheet
          ref={docRef}
          value={value}
          onChange={onChange}
          onTeacherEdit={onTeacherEdit}
          onRegenerateExercise={gen.regenerateExercise}
          context={context}
          vocabulary={vocabulary}
          saveState={saveState}
          zoom={zoom}
          onZoomChange={setZoom}
        />
        {gen.filling && gen.fillSpecs && gen.fillSpecs.length > 0 ? (
          <WorksheetSkeleton specs={gen.fillSpecs} />
        ) : null}
      </div>

      {/* The document-replaced gate — shown before a whole-document build when the
          teacher has edited the document since the last build. Confirm runs the
          deferred action (which rebuilds and clears the flag); Keep aborts it. */}
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
