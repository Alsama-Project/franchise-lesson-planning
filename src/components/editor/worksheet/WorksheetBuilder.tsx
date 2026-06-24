'use client';

// The student-worksheet builder for Step 3 (Practise). It renders the A4 page
// canvas inline — locked "Master" frame (cream, read-only) wrapping the editable
// BODY — and owns the worksheet block list, persisting it as the versioned
// Worksheet envelope to lesson_plans.worksheet (via the parent's autosave).
//
// Body states mirror the mockup: empty ("This worksheet is empty" + Add
// exercise), Free blocks (write / image / Generate with AI), and From-bank
// blocks. The Add exercise dropdown offers "Choose from resource bank" (opens the
// faceted modal) and "Create new" (inserts a Free block).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Worksheet, WorksheetDoc } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import {
  appendBlock,
  duplicateBlock,
  isWorksheetEmpty,
  moveBlock,
  newFreeBlock,
  newResourceBlock,
  parseWorksheet,
  removeBlock,
  updateBlock,
} from '@/lib/editor/worksheet';
import { getResourcesByIdsAction, recordUsageAction } from '@/lib/actions/resources';
import type { WorksheetContext } from './context';
import { MasterFrame } from './MasterFrame';
import { AddExerciseMenu } from './AddExerciseMenu';
import { SortableBlock } from './SortableBlock';
import { ResourceBankModal } from './ResourceBankModal';

const PAGE_WIDTH = 794;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1;

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
  const [zoom, setZoom] = useState(0.72);

  // Resolved resources for From-bank blocks. `attempted` distinguishes "still
  // loading" from "truly missing" so a block doesn't flash "unavailable".
  const [resolved, setResolved] = useState<Record<string, ResourceWithTags>>({});
  const [attempted, setAttempted] = useState<Set<string>>(new Set());

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
    let active = true;
    getResourcesByIdsAction(missing).then((rows) => {
      if (!active) return;
      setResolved((prev) => {
        const next = { ...prev };
        for (const r of rows) next[r.id] = r;
        return next;
      });
      setAttempted((prev) => new Set([...prev, ...missing]));
    });
    return () => {
      active = false;
    };
    // resourceIdsKey captures the set of ids; attempted is intentionally omitted
    // to avoid re-running on its own state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceIdsKey]);

  const createNew = useCallback(() => {
    setMenuOpen(false);
    commit(appendBlock(ws, newFreeBlock()));
  }, [commit, ws]);

  const chooseBank = useCallback(() => {
    setMenuOpen(false);
    setModalOpen(true);
  }, []);

  const addFromBank = useCallback(
    (resource: ResourceWithTags, uploaderName: string | null) => {
      setResolved((prev) => ({ ...prev, [resource.id]: resource }));
      setAttempted((prev) => new Set([...prev, resource.id]));
      commit(appendBlock(ws, newResourceBlock(resource.id, uploaderName)));
      void recordUsageAction(resource.id, context.lessonPlanId);
      setModalOpen(false);
    },
    [commit, ws, context.lessonPlanId],
  );

  const changeFree = useCallback(
    (id: string, doc: WorksheetDoc, fromAI: boolean) => {
      commit(updateBlock(ws, id, (b) => (b.kind === 'free' ? { ...b, doc, fromAI } : b)));
    },
    [commit, ws],
  );

  const deleteBlock = useCallback((id: string) => commit(removeBlock(ws, id)), [commit, ws]);

  const duplicateFree = useCallback((id: string) => commit(duplicateBlock(ws, id)), [commit, ws]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const from = ws.blocks.findIndex((b) => b.id === active.id);
      const to = ws.blocks.findIndex((b) => b.id === over.id);
      commit(moveBlock(ws, from, to));
    },
    [commit, ws],
  );

  const empty = isWorksheetEmpty(ws);
  const containerWidth = Math.round(PAGE_WIDTH * zoom);

  return (
    <div className="bg-surface">
      {/* Builder toolbar */}
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
            <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 10) / 10))} title="Zoom out" style={zoomBtn}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
            </button>
            <span style={{ fontSize: 11.5, fontWeight: 600, minWidth: 30, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 10) / 10))} title="Zoom in" style={zoomBtn}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
          {/* Print preview / Full screen are visual-only for v1 (TODO: dedicated
              full-screen + print routes). Left inert per the build brief. */}
          <button type="button" title="Print preview (coming soon)" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, color: '#2A2422', background: '#fff', border: '1px solid #DDD4C8', padding: '7px 13px', borderRadius: 9, cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="6" rx="1" /><path d="M6 14h12v7H6z" /><path d="M6 14H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>
            Print preview
          </button>
          <button type="button" title="Full screen (coming soon)" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#1F7A6C', background: '#E4F0ED', border: '1px solid #CFE6E0', padding: '7px 13px', borderRadius: 9, cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F7A6C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
            Full screen
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        onClick={() => menuOpen && setMenuOpen(false)}
        style={{ background: '#E8E1D6', padding: '38px 20px 40px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto' }}
      >
        <div style={{ width: containerWidth, flexShrink: 0 }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', width: PAGE_WIDTH, margin: '0 auto' }}>
            <MasterFrame ctx={context}>
              {empty ? (
                <div style={{ flex: 1, minHeight: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, border: '2px dashed #D9CDBB', borderRadius: 16, background: '#FCFAF6' }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#5C544E' }}>This worksheet is empty</div>
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
                            resource={
                              block.kind === 'resource'
                                ? resolved[block.resourceId] ?? null
                                : null
                            }
                            resourceLoading={
                              block.kind === 'resource' && !attempted.has(block.resourceId)
                            }
                            onChangeFree={changeFree}
                            onDelete={deleteBlock}
                            onDuplicateFree={duplicateFree}
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

      {modalOpen ? (
        <ResourceBankModal
          ctx={context}
          vocabulary={vocabulary}
          onClose={() => setModalOpen(false)}
          onAdd={addFromBank}
        />
      ) : null}
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
