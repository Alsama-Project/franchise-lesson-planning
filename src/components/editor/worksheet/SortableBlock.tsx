'use client';

// Sortable wrapper that renders the right block component (Free or From-bank) and
// wires @dnd-kit's drag listeners to its handle. The actual reorder is committed
// by the builder's DndContext onDragEnd.

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HTMLAttributes } from 'react';
import type { FloatingElement, WorksheetBlock, WorksheetDoc } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import { FreeBlock, type ActiveBlock } from './FreeBlock';
import { ResourceBlock } from './ResourceBlock';
import type { WorksheetContext } from './context';

export function SortableBlock({
  block,
  index,
  ctx,
  resource,
  resourceLoading,
  onChangeFree,
  onElementsChange,
  onDelete,
  onDuplicateFree,
  onActivate,
  onDeactivate,
  selectedElementId,
  onSelectElement,
}: {
  block: WorksheetBlock;
  index: number;
  ctx: WorksheetContext;
  resource: ResourceWithTags | null;
  resourceLoading?: boolean;
  onChangeFree: (id: string, doc: WorksheetDoc, fromAI: boolean) => void;
  onElementsChange: (blockId: string, elements: FloatingElement[]) => void;
  onDelete: (id: string) => void;
  onDuplicateFree: (id: string) => void;
  onActivate: (api: ActiveBlock) => void;
  onDeactivate: (id: string) => void;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const dragHandleProps = { ...attributes, ...listeners } as HTMLAttributes<HTMLSpanElement>;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        position: 'relative',
        zIndex: isDragging ? 5 : 'auto',
      }}
    >
      {block.kind === 'free' ? (
        <FreeBlock
          block={block}
          index={index}
          ctx={ctx}
          onChange={(doc, fromAI) => onChangeFree(block.id, doc, fromAI)}
          onElementsChange={onElementsChange}
          onDelete={() => onDelete(block.id)}
          onDuplicate={() => onDuplicateFree(block.id)}
          onActivate={onActivate}
          onDeactivate={onDeactivate}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          dragHandleProps={dragHandleProps}
        />
      ) : (
        <ResourceBlock
          resource={resource}
          uploaderName={block.uploaderName}
          index={index}
          loading={resourceLoading}
          onDelete={() => onDelete(block.id)}
          dragHandleProps={dragHandleProps}
        />
      )}
    </div>
  );
}
