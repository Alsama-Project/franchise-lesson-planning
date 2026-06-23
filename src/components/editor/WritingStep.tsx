'use client';

// The shared two-pane layout for steps 2 (Teach it) and 3 (Practise). The LEFT
// pane is the teacher's writing — "What the teacher does" / "What students do" —
// plus this section's "Attached from the bank" list and, on Practise, the
// student worksheet builder. The RIGHT pane is the embedded Resource Bank panel
// (a fixed 396px column, a 1px divider, no shadow), identical on both steps.

import type { ReactNode } from 'react';
import type { Block, TeachingPhase } from '@/types/lesson';
import type { Folder, ResourceWithTags, TagsByDimension } from '@/types/resource';
import type { SuggestContext } from '@/lib/editor/resource-suggest';
import { blockMinutes } from '@/lib/blocks';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
import { TimeStepper } from '@/components/editor/TimeStepper';
import { FieldLabel, Textarea } from '@/components/editor/fields';
import { AttachedList } from '@/components/editor/AttachedList';
import { ResourcePanel } from '@/components/editor/ResourcePanel';

export function WritingStep({
  title,
  block,
  onPatch,
  subjectId,
  vocabulary,
  folders,
  suggestContext,
  attachedResources,
  onAttach,
  onRemove,
  worksheetSlot,
}: {
  title: string;
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  subjectId: string | null;
  vocabulary: TagsByDimension;
  folders: Folder[];
  suggestContext: SuggestContext;
  attachedResources: ResourceWithTags[];
  onAttach: (resource: ResourceWithTags) => void;
  onRemove: (resourceId: string) => void;
  /** The student worksheet builder, rendered on the Practise step only. */
  worksheetSlot?: ReactNode;
}) {
  return (
    <div className="mt-[22px] overflow-hidden rounded-[16px] border border-border">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-[14px] border-b border-[#EFE8DD] px-6 py-[18px]">
        <div>
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="text-[20px] font-semibold">{title}</span>
            <PhaseSelect
              value={block.phase}
              onChange={(phase) => onPatch({ phase: phase as TeachingPhase | null })}
            />
          </div>
        </div>
        <TimeStepper
          label="min"
          value={blockMinutes(block)}
          onChange={(next) => onPatch({ minutes: next })}
        />
      </div>

      {/* Two panes: writing (left) · embedded resource bank (right, 396px) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_396px]">
        <div className="flex flex-col gap-[18px] p-6">
          <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
            <div>
              <FieldLabel>What the teacher does</FieldLabel>
              <Textarea
                rows={4}
                value={block.teacher_does}
                onChange={(e) => onPatch({ teacher_does: e.target.value })}
                placeholder="Model the task, narrate your thinking, set the success criteria…"
                className="mt-1.5"
              />
            </div>
            <div>
              <FieldLabel>What students do</FieldLabel>
              <Textarea
                rows={4}
                value={block.students_do}
                onChange={(e) => onPatch({ students_do: e.target.value })}
                placeholder="What the class is doing — reading, answering, working in pairs…"
                className="mt-1.5"
              />
            </div>
          </div>

          {worksheetSlot ? (
            <div>
              <div className="mb-[8px] flex items-center gap-[8px]">
                <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-neutral-700">
                  Student worksheet
                </span>
                <span className="text-[11px] text-text-faint">
                  build the sheet students work from
                </span>
              </div>
              {worksheetSlot}
            </div>
          ) : null}

          <AttachedList resources={attachedResources} onRemove={onRemove} />
        </div>

        <ResourcePanel
          subjectId={subjectId}
          vocabulary={vocabulary}
          folders={folders}
          suggestContext={suggestContext}
          attachedIds={block.resourceIds ?? []}
          onAttach={onAttach}
        />
      </div>
    </div>
  );
}
