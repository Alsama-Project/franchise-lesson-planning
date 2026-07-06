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
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
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
  clampGeom,
  duplicateBlock,
  insertBlocksAt,
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
import type { PaginationResult } from '@/lib/editor/pagination';
import type { WorksheetContext } from './context';
import { MasterFrame } from './MasterFrame';
import { AddExerciseMenu } from './AddExerciseMenu';
import { SortableBlock } from './SortableBlock';
import { ResourceBankModal } from './ResourceBankModal';
import { WordToolbar } from './WordToolbar';
import { WorksheetPrintView } from './WorksheetPrintView';
import { WorksheetMeasurer } from './WorksheetMeasurer';
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
  const t = useTranslations('worksheet');
  const [ws, setWs] = useState<Worksheet>(() => parseWorksheet(value));
  // Which add-block menu is open, keyed by insertion index: a divider before
  // block `i` uses `i`; the bottom "add another" / empty button uses
  // `ws.blocks.length`. `null` = closed. Only one is ever open.
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  // Where a bank resource will land once the modal resolves (set when its menu
  // item is clicked); null falls back to appending at the end.
  const pendingInsertIndex = useRef<number | null>(null);

  // ── Zoom (actual CSS scale; default = fit-to-width) ───────────────────────
  const [zoom, setZoom] = useState(0.72);
  const [pageHeight, setPageHeight] = useState(1123); // natural (unscaled) height
  const zoomRef = useRef(zoom);
  const initedRef = useRef(false);
  // Whether the page is tracking fit-to-width. Starts true (default = FIT), and
  // flips false the moment the teacher manually zooms, so a pane/window resize
  // keeps the whole page visible without ever fighting a deliberate zoom.
  const autoFitRef = useRef(true);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // ── Full screen ───────────────────────────────────────────────────────────
  // A CSS maximize overlay (fixed, full-viewport, high z-index) rather than the
  // native Fullscreen API — it gives full control over the styling (app-neutral
  // surface, pinned toolbar) and avoids the browser's native "press Esc" tooltip.
  const [maximised, setMaximised] = useState(false);

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

  // ── Pagination (whole-block flow onto A4 pages) ───────────────────────────
  // The hidden WorksheetMeasurer reports which block goes on which page, using
  // the SAME paginateBlocks the print render uses, so screen and PDF match.
  //
  // Apply policy:
  //  • dedupe — a result is applied only when the assignment actually CHANGES, so
  //    ordinary keystrokes (same packing) never re-render or re-home blocks;
  //  • structural changes (a block added/removed → block count differs) apply
  //    immediately, even mid-focus, so adding a block never collapses the view;
  //  • a pure height change while a block is focused (you're typing and the block
  //    grew past the page) is DEFERRED until blur, so re-homing never drops the
  //    caret — the page just grows until you click away, then it re-flows.
  const [pagination, setPagination] = useState<PaginationResult>({ pages: [], overflow: [] });
  const lastPagesSigRef = useRef('');
  const appliedCountRef = useRef(0);
  const pendingPaginationRef = useRef<{ result: PaginationResult; count: number } | null>(null);
  const activeRef = useRef(false);

  const applyPagination = useCallback((result: PaginationResult, count: number) => {
    appliedCountRef.current = count;
    const sig = JSON.stringify(result.pages) + '#' + JSON.stringify(result.overflow);
    if (sig === lastPagesSigRef.current) return;
    lastPagesSigRef.current = sig;
    setPagination(result);
  }, []);

  const onMeasureResult = useCallback(
    (result: PaginationResult) => {
      const count = result.pages.reduce((n, g) => n + g.length, 0);
      const structural = count !== appliedCountRef.current;
      if (structural || !activeRef.current) {
        pendingPaginationRef.current = null;
        applyPagination(result, count);
      } else {
        pendingPaginationRef.current = { result, count };
      }
    },
    [applyPagination],
  );

  // On blur (no block focused), flush the deferred page assignment.
  useEffect(() => {
    activeRef.current = active !== null;
    if (active === null && pendingPaginationRef.current) {
      const { result, count } = pendingPaginationRef.current;
      pendingPaginationRef.current = null;
      applyPagination(result, count);
    }
  }, [active, applyPagination]);

  // Latest worksheet, so editor-captured callbacks (a block's onUpdate / float
  // handler are bound once by tiptap) always mutate the current state, not a
  // stale snapshot.
  const wsRef = useRef(ws);
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  // ── Combined undo/redo history ────────────────────────────────────────────
  // One stack of whole-worksheet snapshots covers EVERYTHING: tiptap text edits
  // (each block/text-box doc lives in the worksheet) AND block ops (add, remove,
  // reorder, insert-between). So a single Cmd/Ctrl+Z reverses the last action
  // whatever its type — tiptap's own per-editor history is disabled (see
  // editorExtensions). Consecutive edits to the SAME surface within a short window
  // coalesce into one step via `coalesceKey`, so undo doesn't crawl char-by-char;
  // structural ops pass no key and are always discrete.
  const HISTORY_LIMIT = 100;
  const COALESCE_MS = 500;
  const historyRef = useRef<{
    past: Worksheet[];
    future: Worksheet[];
    lastKey: string | null;
    lastTime: number;
  }>({ past: [], future: [], lastKey: null, lastTime: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistoryFlags = useCallback(() => {
    const h = historyRef.current;
    setCanUndo(h.past.length > 0);
    setCanRedo(h.future.length > 0);
  }, []);

  const commit = useCallback(
    (next: Worksheet, coalesceKey?: string) => {
      const h = historyRef.current;
      const now = Date.now();
      const coalesce =
        !!coalesceKey && coalesceKey === h.lastKey && now - h.lastTime < COALESCE_MS;
      if (!coalesce) {
        h.past.push(wsRef.current);
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
      }
      h.future = [];
      h.lastKey = coalesceKey ?? null;
      h.lastTime = now;
      setWs(next);
      onChange(next);
      syncHistoryFlags();
    },
    [onChange, syncHistoryFlags],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past.pop() as Worksheet;
    h.future.push(wsRef.current);
    h.lastKey = null; // an undo always starts a fresh coalescing run
    setWs(prev);
    onChange(prev);
    syncHistoryFlags();
  }, [onChange, syncHistoryFlags]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future.pop() as Worksheet;
    h.past.push(wsRef.current);
    h.lastKey = null;
    setWs(next);
    onChange(next);
    syncHistoryFlags();
  }, [onChange, syncHistoryFlags]);

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
  const fitToWidth = useCallback(() => {
    autoFitRef.current = true;
    setZoom(computeFit());
  }, [computeFit]);
  // A manual zoom (buttons / keyboard / pinch): stop auto-fitting and apply it.
  const zoomManual = useCallback((next: React.SetStateAction<number>) => {
    autoFitRef.current = false;
    setZoom(next);
  }, []);

  // Initial fit (before paint, no flicker).
  useLayoutEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    setZoom(computeFit());
  }, [computeFit]);

  // Keep the whole page width visible as the pane/window resizes — but only while
  // still auto-fitting, so a teacher's manual zoom is never overridden.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (autoFitRef.current) setZoom(computeFit());
    });
    ro.observe(vp);
    return () => ro.disconnect();
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

  // Re-fit on full-screen enter/exit (the available area changes a lot).
  useEffect(() => {
    if (!initedRef.current) return;
    const id = requestAnimationFrame(() => setZoom(computeFit()));
    return () => cancelAnimationFrame(id);
  }, [maximised, computeFit]);

  // ── Keyboard zoom (Cmd/Ctrl +/-/0) ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomManual((z) => clampZoom(round2(z + 0.1)));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          zoomManual((z) => clampZoom(round2(z - 0.1)));
        } else if (e.key === '0') {
          e.preventDefault();
          fitToWidth();
        }
      } else if (e.key === 'Escape' && maximised) {
        setMaximised(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximised, fitToWidth, zoomManual]);

  // ── Keyboard undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y) ─────────────
  // Handled at the worksheet level for both text and block ops. Plain <input>/
  // <textarea> fields (the AI prompt, the adjust box) keep their NATIVE undo;
  // contenteditable (tiptap) surfaces route here, since their own history is off.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (key === 'y' || (key === 'z' && e.shiftKey)) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ── Pinch-to-zoom on the canvas (non-passive wheel + Safari gestures) ──────
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // ctrlKey set by Chromium/Firefox for trackpad pinch
      e.preventDefault();
      zoomManual((z) => clampZoom(round2(z * (1 - e.deltaY * 0.01))));
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
      zoomManual(clampZoom(round2(gestureBase * scale)));
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
  }, [zoomManual]);

  // ── Block actions ─────────────────────────────────────────────────────────
  // All insert paths are index-aware: a block can be added at any position (a
  // between-blocks divider) or appended (the bottom button / empty state).
  const createNewAt = useCallback(
    (index: number) => {
      setMenuAt(null);
      commit(insertBlocksAt(wsRef.current, index, [newFreeBlock()]));
    },
    [commit],
  );

  const chooseBankAt = useCallback((index: number) => {
    setMenuAt(null);
    pendingInsertIndex.current = index;
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
        const index = pendingInsertIndex.current ?? wsRef.current.blocks.length;
        commit(insertBlocksAt(wsRef.current, index, built));
      }
      pendingInsertIndex.current = null;
      void recordUsageAction(resource.id, context.lessonPlanId);
      setModalOpen(false);
    },
    [commit, context.lessonPlanId],
  );

  // changeFree + onElementsChange are bound once by each block's editor, so they
  // read the latest worksheet via wsRef rather than a captured snapshot.
  const changeFree = useCallback(
    (id: string, doc: WorksheetDoc, fromAI: boolean) => {
      // Coalesce a run of keystrokes in the same block into one undo step.
      commit(
        updateBlock(wsRef.current, id, (b) => (b.kind === 'free' ? { ...b, doc, fromAI } : b)),
        `doc:${id}`,
      );
    },
    [commit],
  );

  const deleteBlock = useCallback((id: string) => commit(removeBlock(wsRef.current, id)), [commit]);
  const duplicateFree = useCallback((id: string) => commit(duplicateBlock(wsRef.current, id)), [commit]);

  // Lift a Free block's contained floating elements (text boxes / images). A
  // coalesceKey is passed only for text-box typing (so it folds into one undo
  // step); add/remove/move/style changes pass none and stay discrete.
  const onElementsChange = useCallback(
    (blockId: string, elements: FloatingElement[], coalesceKey?: string) => {
      commit(
        updateBlock(wsRef.current, blockId, (b) => (b.kind === 'free' ? { ...b, elements } : b)),
        coalesceKey,
      );
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
  // Page groups from the measurer, validated against the current blocks. If the
  // assignment doesn't cover exactly the current blocks (a transient mismatch
  // right after add/remove, or any drift), fall back to a single page holding
  // every block — never a blank or overlapping page.
  const measuredPages = pagination.pages;
  const coversAll =
    measuredPages.length > 0 &&
    measuredPages.reduce((n, g) => n + g.length, 0) === ws.blocks.length;
  const pageGroups = coversAll ? measuredPages : [ws.blocks.map((_, i) => i)];
  const overflow = pagination.overflow;
  const scaledWidth = Math.round(PAGE_WIDTH * zoom);
  const scaledHeight = Math.round(pageHeight * zoom);
  // origin top-center: offset the (unscaled) page so its scaled box fills the sizer.
  const pageLeft = (PAGE_WIDTH / 2) * (zoom - 1);

  return (
    <div
      ref={shellRef}
      className="ws-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        // No inner card/panel fill: transparent so the pane background shows
        // through and the white A4 page is the only surface. Full-screen needs a
        // solid backdrop (it's a fixed overlay over the whole app).
        ...(maximised
          ? { position: 'fixed', inset: 0, zIndex: 120, height: '100vh', background: 'var(--color-surface)' }
          : // Fill the worksheet pane so the CHROME (toolbar) is a fixed header and
            // only the CANVAS scrolls beneath it — the toolbar never scrolls away.
            { flex: '1 1 auto', minHeight: 0, background: 'transparent' }),
      }}
    >
      {/* ── CHROME — two thin rows (view controls, then format toolbar) above the
             scrolling canvas. It is the flex header (FIX C), so it stays pinned and
             the page scrolls beneath it. A solid white strip separates the controls
             from the cream page below; `direction: ltr` keeps the tools laid out
             left-to-right even when the page content is RTL. ──────────────── */}
      <div
        className="ws-no-print"
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          direction: 'ltr',
          background: '#fff',
          borderBottom: '1px solid #ECE4D7',
        }}
      >
        {/* Row 1 — zoom · print preview · full screen (right-aligned) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap', padding: '5px 10px 3px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FBF8F3', border: '1px solid #E7DECF', borderRadius: 999, padding: '2px 6px' }}>
            <button type="button" onClick={() => zoomManual((z) => clampZoom(round2(z - 0.1)))} title={t('zoom.zoomOut')} style={zoomBtn}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
            </button>
            <span style={{ fontSize: 11, fontWeight: 600, minWidth: 30, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomManual((z) => clampZoom(round2(z + 0.1)))} title={t('zoom.zoomIn')} style={zoomBtn}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" onClick={fitToWidth} title={t('zoom.fitToWidth')} style={{ ...zoomBtn, width: 'auto', padding: '0 7px', fontSize: 10.5, fontWeight: 600, color: '#5C544E' }}>
              {t('zoom.fit')}
            </button>
          </div>

          <button type="button" onClick={() => setPrintOpen(true)} title={t('actions.printPreview')} aria-label={t('actions.printPreview')} style={chromeButton(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="6" rx="1" /><path d="M6 14h12v7H6z" /><path d="M6 14H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>
          </button>

          {/* Full screen — CSS maximize overlay; teal while active, Esc also leaves */}
          <button type="button" onClick={() => setMaximised((m) => !m)} title={maximised ? t('actions.exitFullScreenTitle') : t('actions.fullScreen')} aria-label={maximised ? t('actions.exitFullScreen') : t('actions.fullScreen')} style={chromeButton(maximised)}>
            {maximised ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
            )}
          </button>
        </div>

        {/* Row 2 — format toolbar (acts on the active block; insert controls add a
            text box / image INTO that block, disabled if none active). */}
        <div style={{ padding: '0 8px 4px' }}>
          <WordToolbar
            editor={active?.editor ?? null}
            canInsert={!!active}
            onInsertImage={insertFloatingImage}
            onInsertTextBox={insertTextBox}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </div>
      </div>

      {/* ── CANVAS (scrollable; only the page is scaled) ─────────────────── */}
      <div
        ref={viewportRef}
        className="ws-canvas ws-no-print"
        onClick={() => {
          if (menuAt !== null) setMenuAt(null);
          // Click-off deselects and commits the active box; it never creates one.
          setSelectedEl(null);
          setActive(null);
        }}
        style={{
          // Transparent: the pane background shows around the white A4 page — no
          // beige box. (Full screen keeps a soft neutral so the page reads as a
          // sheet on a surface.)
          background: maximised ? '#E8E1D6' : 'transparent',
          overflow: 'auto',
          // Fill the remaining pane height (chrome is the fixed header above);
          // the page scrolls inside here, so the toolbar stays pinned.
          ...(maximised ? { flex: '1 1 auto' } : { flex: '1 1 auto', minHeight: 0 }),
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
              {empty ? (
                <MasterFrame ctx={context}>
                  <div style={{ flex: 1, minHeight: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, border: '2px dashed #D9CDBB', borderRadius: 16, background: '#FCFAF6' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#5C544E' }}>{t('empty')}</div>
                    <AddExerciseMenu
                      variant="empty"
                      open={menuAt === 0}
                      onToggle={() => setMenuAt((cur) => (cur === 0 ? null : 0))}
                      onChooseBank={() => chooseBankAt(0)}
                      onCreateNew={() => createNewAt(0)}
                    />
                  </div>
                </MasterFrame>
              ) : (
                // One DndContext spans every page so blocks reorder across page
                // boundaries; the page frames are produced from the shared
                // measurement so the screen matches the printed/PDF layout.
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={ws.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                      {pageGroups.map((indices, p) => {
                        const isLastPage = p === pageGroups.length - 1;
                        return (
                          <MasterFrame
                            key={p}
                            ctx={context}
                            pageLabel={{ index: p + 1, total: pageGroups.length }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              {indices.map((i) => {
                                const block = ws.blocks[i];
                                if (!block) return null;
                                return (
                                  <Fragment key={block.id}>
                                    {/* Insert-between affordance: a hover teal
                                        divider that inserts a block at index `i`. */}
                                    <AddExerciseMenu
                                      variant="divider"
                                      open={menuAt === i}
                                      onToggle={() => setMenuAt((cur) => (cur === i ? null : i))}
                                      onChooseBank={() => chooseBankAt(i)}
                                      onCreateNew={() => createNewAt(i)}
                                    />
                                    {overflow[i] ? (
                                      <div
                                        className="ws-no-print"
                                        style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '2px 0 8px', padding: '7px 11px', borderRadius: 8, background: '#FBF1E7', border: '1px solid #EAD7BF', color: '#9A6B22', fontSize: 11.5, fontWeight: 600 }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                                        {t('pagination.tallBlock')}
                                      </div>
                                    ) : null}
                                    <SortableBlock
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
                                  </Fragment>
                                );
                              })}
                              {/* The bottom "add another" lives on the last page,
                                  appending at the end of the worksheet. */}
                              {isLastPage ? (
                                <AddExerciseMenu
                                  variant="another"
                                  open={menuAt === ws.blocks.length}
                                  onToggle={() =>
                                    setMenuAt((cur) => (cur === ws.blocks.length ? null : ws.blocks.length))
                                  }
                                  onChooseBank={() => chooseBankAt(ws.blocks.length)}
                                  onCreateNew={() => createNewAt(ws.blocks.length)}
                                />
                              ) : null}
                            </div>
                          </MasterFrame>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden, off-screen measurement of the print layout — the single source
          of the page assignment, shared with the print/PDF render. */}
      {!empty ? (
        <WorksheetMeasurer ws={ws} ctx={context} resolved={resolved} onResult={onMeasureResult} />
      ) : null}

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
  const t = useTranslations('worksheet');
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
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t('print.title')}</span>
        <span style={{ fontSize: 12, color: '#8A8178' }}>{t('print.subtitle')}</span>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 8 }}>
          <button type="button" onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#1F7A6C', border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="6" rx="1" /><path d="M6 14h12v7H6z" /><path d="M6 14H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>
            {t('print.print')}
          </button>
          <button type="button" onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2A2422', background: '#fff', border: '1px solid #DDD4C8', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}>
            {t('print.close')}
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

// Compact icon-only view button (print / full screen) for the slim header row.
function chromeButton(teal: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 26,
    color: teal ? '#1F7A6C' : '#5C544E',
    background: teal ? '#E4F0ED' : '#fff',
    border: `1px solid ${teal ? '#CFE6E0' : '#E7DECF'}`,
    padding: 0,
    borderRadius: 7,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: 'inherit',
  };
}
