'use client';

// Sortable wrapper that renders the right block component (Free or From-bank) and
// wires @dnd-kit's drag listeners to its handle. The actual reorder is committed
// by the builder's DndContext onDragEnd.

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HTMLAttributes } from 'react';
import type { WorksheetBlock, WorksheetDoc } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import { FreeBlock } from './FreeBlock';
import { ResourceBlock } from './ResourceBlock';
import type { WorksheetContext } from './context';

export function SortableBlock({
  block,
  index,
  ctx,
  resource,
  resourceLoading,
  onChangeFree,
  onDelete,
  onDuplicateFree,
}: {
  block: WorksheetBlock;
  index: number;
  ctx: WorksheetContext;
  resource: ResourceWithTags | null;
  resourceLoading?: boolean;
  onChangeFree: (id: string, doc: WorksheetDoc, fromAI: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicateFree: (id: string) => void;
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
          onDelete={() => onDelete(block.id)}
          onDuplicate={() => onDuplicateFree(block.id)}
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
