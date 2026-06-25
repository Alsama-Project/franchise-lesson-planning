'use client';

// The student-worksheet builder for Step 3 (Practise). It renders the A4 page
// canvas inline — locked "Master" frame (cream, read-only) wrapping the editable
// BODY — and owns the worksheet block list, persisting it as the versioned
// Worksheet envelope to lesson_plans.worksheet (via the parent's autosave).
//
// Structure (the zoom/print fix): the editor is two layers —
//   • CHROME — title, the shared formatting toolbar, zoom controls, Generate,
//     full-screen and print. Always rendered at 100%, never transformed.
//   • CANVAS — a scrollable viewport whose ONLY scaled child is the A4 page
//     surface (transform: scale(zoom), origin top-center). The scroll content is
//     sized to the scaled page so it can be panned when zoomed past fit.
//
// Body states mirror the mockup: empty ("This worksheet is empty" + Add
// exercise), Free blocks (write / image / Generate with AI), and From-bank
// blocks. The Add exercise dropdown offers "Choose from resource bank" (opens the
// faceted modal) and "Create new" (inserts a Free block).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { FloatingElement, Worksheet, WorksheetDoc } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import {
  appendBlock,
  clampGeom,
  duplicateBlock,
  isWorksheetEmpty,
  moveBlock,
  newFreeBlock,
  nextZ,
  parseWorksheet,
  removeBlock,
  updateBlock,
} from '@/lib/editor/worksheet';
import { buildBlocksFromResource } from '@/lib/editor/resource-to-block';
import { getResourcesByIdsAction, recordUsageAction } from '@/lib/actions/resources';
import type { WorksheetContext } from './context';
import { MasterFrame } from './MasterFrame';
import { AddExerciseMenu } from './AddExerciseMenu';
import { SortableBlock } from './SortableBlock';
import { ResourceBankModal } from './ResourceBankModal';
import { WordToolbar } from './WordToolbar';
import { WorksheetPrintView } from './WorksheetPrintView';
import type { ScreenRect } from './FloatingElementView';
import type { ActiveBlock } from './FreeBlock';

const MIN_TEXTBOX = { w: 120, h: 56 };
const MIN_IMAGE = { w: 48, h: 48 };

const PAGE_WIDTH = 794;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const CANVAS_PAD_X = 40; // breathing room used when computing fit-to-width

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const round2 = (z: number) => Math.round(z * 100) / 100;

export function WorksheetBuilder({
  value,
  onChange,
  context,
  vocabulary,
}: {
  /** The stored worksheet column (any legacy or v2 shape). */
  value: unknown;
  /** Lift the full worksheet envelope for autosave. */
  onChange: (worksheet: Worksheet) => void;
  context: WorksheetContext;
  /** Tag vocabulary for the bank modal's facets (loaded with the plan). */
  vocabulary: TagsByDimension;
}) {
  const [ws, setWs] = useState<Worksheet>(() => parseWorksheet(value));
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  // ── Zoom (actual CSS scale; default = fit-to-width) ───────────────────────
  const [zoom, setZoom] = useState(0.72);
  const [pageHeight, setPageHeight] = useState(1123); // natural (unscaled) height
  const zoomRef = useRef(zoom);
  const initedRef = useRef(false);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const [isFs, setIsFs] = useState(false); // native Fullscreen API
  const [maximised, setMaximised] = useState(false); // CSS fallback
  const fsActive = isFs || maximised;

  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Resolved resources for From-bank blocks. `attempted` distinguishes "still
  // loading" from "truly missing" so a block doesn't flash "unavailable".
  const [resolved, setResolved] = useState<Record<string, ResourceWithTags>>({});
  const [attempted, setAttempted] = useState<Set<string>>(new Set());

  // ── Floating element selection (which element, across all blocks) ─────────
  const [selectedEl, setSelectedEl] = useState<string | null>(null);

  // ── Active block context for the chrome toolbar (formatting + insert) ──────
  const [active, setActive] = useState<ActiveBlock | null>(null);
  const onActivate = useCallback((api: ActiveBlock) => setActive(api), []);
  const onDeactivate = useCallback(
    (activeId: string) => setActive((cur) => (cur && cur.activeId === activeId ? null : cur)),
    [],
  );

  // Latest worksheet, so editor-captured callbacks (a block's onUpdate / float
  // handler are bound once by tiptap) always mutate the current state, not a
  // stale snapshot.
  const wsRef = useRef(ws);
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  const commit = useCallback(
    (next: Worksheet) => {
      setWs(next);
      onChange(next);
    },
    [onChange],
  );

  // Resolve any From-bank resource ids we don't have yet.
  const resourceIds = useMemo(
    () => ws.blocks.filter((b) => b.kind === 'resource').map((b) => (b as { resourceId: string }).resourceId),
    [ws.blocks],
  );
  const resourceIdsKey = resourceIds.join(',');
  useEffect(() => {
    const missing = resourceIds.filter((id) => !attempted.has(id));
    if (missing.length === 0) return;
    let act = true;
    getResourcesByIdsAction(missing)
      .then((rows) => {
        if (!act) return;
        setResolved((prev) => {
          const next = { ...prev };
          for (const r of rows) next[r.id] = r;
          return next;
        });
      })
      .finally(() => {
        if (act) setAttempted((prev) => new Set([...prev, ...missing]));
      });
    return () => {
      act = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceIdsKey]);

  // ── Fit-to-width ──────────────────────────────────────────────────────────
  const computeFit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return zoomRef.current;
    const avail = vp.clientWidth - CANVAS_PAD_X;
    return clampZoom(avail / PAGE_WIDTH);
  }, []);
  const fitToWidth = useCallback(() => setZoom(computeFit()), [computeFit]);

  // Initial fit (before paint, no flicker).
  useLayoutEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    setZoom(computeFit());
  }, [computeFit]);

  // Track the page's natural height so the scroll content can be sized to the
  // scaled page (transforms don't reflow layout).
  useEffect(() => {
    const el = pageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPageHeight(el.offsetHeight));
    ro.observe(el);
    setPageHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Re-fit on fullscreen enter/exit (the available area changes a lot).
  useEffect(() => {
    if (!initedRef.current) return;
    const id = requestAnimationFrame(() => setZoom(computeFit()));
    return () => cancelAnimationFrame(id);
  }, [isFs, maximised, computeFit]);

  // ── Keyboard zoom (Cmd/Ctrl +/-/0) ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setZoom((z) => clampZoom(round2(z + 0.1)));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom((z) => clampZoom(round2(z - 0.1)));
        } else if (e.key === '0') {
          e.preventDefault();
          setZoom(computeFit());
        }
      } else if (e.key === 'Escape' && maximised) {
        setMaximised(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [computeFit, maximised]);

  // ── Pinch-to-zoom on the canvas (non-passive wheel + Safari gestures) ──────
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // ctrlKey set by Chromium/Firefox for trackpad pinch
      e.preventDefault();
      setZoom((z) => clampZoom(round2(z * (1 - e.deltaY * 0.01))));
    };
    vp.addEventListener('wheel', onWheel, { passive: false });

    // Safari pinch
    let gestureBase = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureBase = zoomRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as unknown as { scale: number }).scale ?? 1;
      setZoom(clampZoom(round2(gestureBase * scale)));
    };
    const onGestureEnd = (e: Event) => e.preventDefault();
    vp.addEventListener('gesturestart', onGestureStart);
    vp.addEventListener('gesturechange', onGestureChange);
    vp.addEventListener('gestureend', onGestureEnd);

    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
    };
  }, []);

  // ── Fullscreen API ────────────────────────────────────────────────────────
  useEffect(() => {
    const onChangeFs = () => {
      const d = document as Document & { webkitFullscreenElement?: Element };
      setIsFs(Boolean(d.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChangeFs);
    document.addEventListener('webkitfullscreenchange', onChangeFs);
    return () => {
      document.removeEventListener('fullscreenchange', onChangeFs);
      document.removeEventListener('webkitfullscreenchange', onChangeFs);
    };
  }, []);

  // ── Block actions ─────────────────────────────────────────────────────────
  const createNew = useCallback(() => {
    setMenuOpen(false);
    commit(appendBlock(ws, newFreeBlock()));
  }, [commit, ws]);

  const chooseBank = useCallback(() => {
    setMenuOpen(false);
    setModalOpen(true);
  }, []);

  // Adding a bank resource builds editable free block(s) populated with a COPY of
  // its content (rich text / image / PDF-page images), then appends them — the
  // teacher edits them exactly like self-made blocks, and edits never touch the
  // saved resource. The modal stays open (showing a busy state) until this
  // resolves, since image/PDF copies involve uploads.
  const addFromBank = useCallback(
    async (resource: ResourceWithTags) => {
      const built = await buildBlocksFromResource(resource);
      if (built.length > 0) {
        let next = wsRef.current;
        for (const block of built) next = appendBlock(next, block);
        commit(next);
      }
      void recordUsageAction(resource.id, context.lessonPlanId);
      setModalOpen(false);
    },
    [commit, context.lessonPlanId],
  );

  // changeFree + onElementsChange are bound once by each block's editor, so they
  // read the latest worksheet via wsRef rather than a captured snapshot.
  const changeFree = useCallback(
    (id: string, doc: WorksheetDoc, fromAI: boolean) => {
      commit(updateBlock(wsRef.current, id, (b) => (b.kind === 'free' ? { ...b, doc, fromAI } : b)));
    },
    [commit],
  );

  const deleteBlock = useCallback((id: string) => commit(removeBlock(wsRef.current, id)), [commit]);
  const duplicateFree = useCallback((id: string) => commit(duplicateBlock(wsRef.current, id)), [commit]);

  // Lift a Free block's contained floating elements (text boxes / images).
  const onElementsChange = useCallback(
    (blockId: string, elements: FloatingElement[]) => {
      commit(updateBlock(wsRef.current, blockId, (b) => (b.kind === 'free' ? { ...b, elements } : b)));
    },
    [commit],
  );

  // ── Cross-block drag (re-home an element into the block it's dropped over) ──
  const blockBoxes = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerBox = useCallback((blockId: string, el: HTMLDivElement | null) => {
    if (el) blockBoxes.current.set(blockId, el);
    else blockBoxes.current.delete(blockId);
  }, []);

  const onElementDrop = useCallback(
    (fromBlockId: string, element: FloatingElement | null, rect: ScreenRect) => {
      if (!element) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // The block whose content box contains the dropped element's centre wins;
      // default to the source block (snap back) if it lands outside every block.
      let targetId = fromBlockId;
      let targetEl = blockBoxes.current.get(fromBlockId) ?? null;
      for (const [bid, bel] of blockBoxes.current) {
        const r = bel.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
          targetId = bid;
          targetEl = bel;
          break;
        }
      }
      if (!targetEl) return;
      const tRect = targetEl.getBoundingClientRect();
      const scale = targetEl.clientWidth ? tRect.width / targetEl.clientWidth : 1;
      const box = { w: targetEl.clientWidth, h: targetEl.clientHeight };
      const min = element.kind === 'image' ? MIN_IMAGE : MIN_TEXTBOX;
      const geom = clampGeom(
        {
          x: (rect.left - tRect.left) / scale,
          y: (rect.top - tRect.top) / scale,
          w: rect.width / scale,
          h: rect.height / scale,
        },
        box,
        min,
      );

      const cur = wsRef.current;
      if (targetId === fromBlockId) {
        commit(
          updateBlock(cur, fromBlockId, (b) =>
            b.kind === 'free'
              ? { ...b, elements: b.elements.map((e) => (e.id === element.id ? { ...e, ...geom } : e)) }
              : b,
          ),
        );
        return;
      }
      // Re-home: remove from the source block, add to the target block on top.
      let next = updateBlock(cur, fromBlockId, (b) =>
        b.kind === 'free' ? { ...b, elements: b.elements.filter((e) => e.id !== element.id) } : b,
      );
      next = updateBlock(next, targetId, (b) =>
        b.kind === 'free'
          ? { ...b, elements: [...b.elements, { ...element, ...geom, z: nextZ(b.elements) }] }
          : b,
      );
      commit(next);
    },
    [commit],
  );

  // Insert into the active Free block (the toolbar enables these only when one is
  // active, so clicking the page never spawns an element).
  const insertTextBox = useCallback(() => active?.insertTextBox(), [active]);
  const insertFloatingImage = useCallback(() => active?.insertFloatingImage(), [active]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active: a, over } = e;
      if (!over || a.id === over.id) return;
      const from = ws.blocks.findIndex((b) => b.id === a.id);
      const to = ws.blocks.findIndex((b) => b.id === over.id);
      commit(moveBlock(ws, from, to));
    },
    [commit, ws],
  );

  const empty = isWorksheetEmpty(ws);
  const scaledWidth = Math.round(PAGE_WIDTH * zoom);
  const scaledHeight = Math.round(pageHeight * zoom);
  // origin top-center: offset the (unscaled) page so its scaled box fills the sizer.
  const pageLeft = (PAGE_WIDTH / 2) * (zoom - 1);

  return (
    <div
      ref={shellRef}
      className="ws-shell"
      style={{
        background: fsActive ? '#241f1b' : 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        ...(maximised
          ? { position: 'fixed', inset: 0, zIndex: 120 }
          : null),
        ...(fsActive ? { height: '100vh' } : null),
      }}
    >
      {/* ── CHROME (never zoom-scaled) ───────────────────────────────────── */}
      <div className="ws-no-print" style={{ flexShrink: 0 }}>
        {/* Top bar */}
        <div
          style={{
            padding: '13px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            background: '#FBF8F3',
            borderBottom: '1px solid #EFE8DD',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B62A5C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Student worksheet</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#B62A5C', background: '#FBF2F5', border: '1px solid #F1D8E1', borderRadius: 6, padding: '3px 9px' }}>
              students see this
            </span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E7DECF', borderRadius: 999, padding: '5px 7px 5px 12px' }}>
              <span style={{ fontSize: 11.5, color: '#8A8178' }}>A4</span>
              <button type="button" onClick={() => setZoom((z) => clampZoom(round2(z - 0.1)))} title="Zoom out (Ctrl −)" style={zoomBtn}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
              </button>
              <span style={{ fontSize: 11.5, fontWeight: 600, minWidth: 32, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => clampZoom(round2(z + 0.1)))} title="Zoom in (Ctrl +)" style={zoomBtn}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <button type="button" onClick={fitToWidth} title="Fit to width (Ctrl 0)" style={{ ...zoomBtn, width: 'auto', padding: '0 9px', fontSize: 11, fontWeight: 600, color: '#5C544E' }}>
                Fit
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              title="Print preview"
              style={chromeButton(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="6" rx="1" /><path d="M6 14h12v7H6z" /><path d="M6 14H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>
              Print preview
            </button>
          </div>
        </div>

        {/* Shared formatting toolbar — everything acts on the active block; insert
            controls add a text box / image INTO that block (disabled if none). */}
        <WordToolbar
          editor={active?.editor ?? null}
          canInsert={!!active}
          onInsertImage={insertFloatingImage}
          onInsertTextBox={insertTextBox}
        />
      </div>

      {/* ── CANVAS (scrollable; only the page is scaled) ─────────────────── */}
      <div
        ref={viewportRef}
        className="ws-canvas ws-no-print"
        onClick={() => {
          if (menuOpen) setMenuOpen(false);
          // Click-off deselects and commits the active box; it never creates one.
          setSelectedEl(null);
          setActive(null);
        }}
        style={{
          background: fsActive ? '#2A2320' : '#E8E1D6',
          overflow: 'auto',
          ...(fsActive ? { flex: '1 1 auto' } : { height: 'clamp(420px, 64vh, 920px)' }),
        }}
      >
        <div style={{ minWidth: '100%', width: 'fit-content', padding: '38px 20px 40px', boxSizing: 'border-box' }}>
          <div style={{ width: scaledWidth, height: scaledHeight, margin: '0 auto', position: 'relative' }}>
            <div
              ref={pageRef}
              style={{
                position: 'absolute',
                top: 0,
                left: pageLeft,
                width: PAGE_WIDTH,
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
            >
              <MasterFrame ctx={context}>
                {empty ? (
                  <div style={{ flex: 1, minHeight: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, border: '2px dashed #D9CDBB', borderRadius: 16, background: '#FCFAF6' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#5C544E' }}>This worksheet is empty</div>
                    <AddExerciseMenu
                      variant="empty"
                      open={menuOpen}
                      onToggle={() => setMenuOpen((o) => !o)}
                      onChooseBank={chooseBank}
                      onCreateNew={createNew}
                    />
                  </div>
                ) : (
                  <>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={ws.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                          {ws.blocks.map((block, i) => (
                            <SortableBlock
                              key={block.id}
                              block={block}
                              index={i}
                              ctx={context}
                              resource={block.kind === 'resource' ? resolved[block.resourceId] ?? null : null}
                              resourceLoading={block.kind === 'resource' && !attempted.has(block.resourceId)}
                              onChangeFree={changeFree}
                              onElementsChange={onElementsChange}
                              onDelete={deleteBlock}
                              onDuplicateFree={duplicateFree}
                              onActivate={onActivate}
                              onDeactivate={onDeactivate}
                              selectedElementId={selectedEl}
                              onSelectElement={setSelectedEl}
                              onElementDrop={onElementDrop}
                              registerBox={registerBox}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    <AddExerciseMenu
                      variant="another"
                      open={menuOpen}
                      onToggle={() => setMenuOpen((o) => !o)}
                      onChooseBank={chooseBank}
                      onCreateNew={createNew}
                    />
                  </>
                )}
              </MasterFrame>
            </div>
          </div>
        </div>
      </div>

      {modalOpen ? (
        <ResourceBankModal
          ctx={context}
          vocabulary={vocabulary}
          onClose={() => setModalOpen(false)}
          onAdd={addFromBank}
        />
      ) : null}

      {printOpen ? (
        <PrintPreview ws={ws} ctx={context} resolved={resolved} onClose={() => setPrintOpen(false)} />
      ) : null}
    </div>
  );
}

/** Print-preview modal: shows the page at true A4 (scaled to fit on screen) and
 *  prints only the page surface via the @media print rules in globals.css. */
function PrintPreview({
  ws,
  ctx,
  resolved,
  onClose,
}: {
  ws: Worksheet;
  ctx: WorksheetContext;
  resolved: Record<string, ResourceWithTags>;
  onClose: () => void;
}) {
  const [previewScale, setPreviewScale] = useState(0.85);

  useEffect(() => {
    const calc = () => setPreviewScale(Math.min(1, (window.innerWidth - 96) / PAGE_WIDTH));
    calc();
    window.addEventListener('resize', calc);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div className="ws-no-print" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,16,12,0.72)' }} />

      <div
        className="ws-no-print"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 18px',
          background: '#fff',
          borderBottom: '1px solid #EFE8DD',
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700 }}>Print preview</span>
        <span style={{ fontSize: 12, color: '#8A8178' }}>A4 portrait · prints at true size</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
          <button type="button" onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#1F7A6C', border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="6" rx="1" /><path d="M6 14h12v7H6z" /><path d="M6 14H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>
            Print
          </button>
          <button type="button" onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2A2422', background: '#fff', border: '1px solid #DDD4C8', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}>
            Close
          </button>
        </span>
      </div>

      <div
        className="ws-print-scroll"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '74px 20px 30px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}
      >
        <div
          className="ws-print-scale"
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', flexShrink: 0 }}
        >
          <div className="ws-print-area">
            <WorksheetPrintView ws={ws} ctx={ctx} resolved={resolved} />
          </div>
        </div>
      </div>
    </div>
  );
}

const zoomBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  background: '#F3ECE2',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
};

function chromeButton(teal: boolean): React.CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: teal ? 600 : 500,
    color: teal ? '#1F7A6C' : '#2A2422',
    background: teal ? '#E4F0ED' : '#fff',
    border: `1px solid ${teal ? '#CFE6E0' : '#DDD4C8'}`,
    padding: '7px 13px',
    borderRadius: 9,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  };
}
