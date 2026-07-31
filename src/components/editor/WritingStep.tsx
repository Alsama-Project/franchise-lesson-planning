'use client';

// The "Teach it" (new content) step body: the phase header, the two pink-editable
// teacher/student textareas, and the step's resource block — attached resources
// plus the direct-upload drop-zone and "Add from bank" picker (shared
// StepResourceBlock, the same block Independent practice uses).

import { useTranslations } from 'next-intl';
import type { Block, TeachingPhase } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
import { FieldLabel, Textarea } from '@/components/editor/fields';
import { StepResourceBlock } from '@/components/editor/StepResourceBlock';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

export function WritingStep({
  title,
  block,
  onPatch,
  worksheetContext,
  vocabulary,
  attachedResources,
  onAttach,
  onRemove,
  locked = false,
}: {
  title: string;
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  /** Subject/year/theme scoping for the resource-bank picker + upload. */
  worksheetContext: WorksheetContext;
  vocabulary: TagsByDimension;
  attachedResources: ResourceWithTags[];
  onAttach: (resource: ResourceWithTags) => void;
  onRemove: (resourceId: string) => void;
  /** When true the plan is submitted/approved: every control inside is disabled
   *  via a single `disabled` fieldset, so the step is read-only. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard.teach');

  return (
    <fieldset disabled={locked} className="mt-[16px] min-w-0 overflow-hidden rounded-[16px] border border-border bg-surface disabled:opacity-75">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-[10px] border-b border-[#EFE8DD] px-6 py-[10px]">
        <span className="text-[18px] font-bold">{title}</span>
        <PhaseSelect
          value={block.phase}
          onChange={(phase) => onPatch({ phase: phase as TeachingPhase | null })}
        />
      </div>

      <div className="flex flex-col gap-[14px] px-6 py-[14px]">
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
          <div>
            <FieldLabel>{t('teacherDoes')}</FieldLabel>
            <Textarea
              dir="auto"
              rows={2}
              value={block.teacher_does}
              onChange={(e) => onPatch({ teacher_does: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <FieldLabel>{t('studentsDo')}</FieldLabel>
            <Textarea
              dir="auto"
              rows={2}
              value={block.students_do}
              onChange={(e) => onPatch({ students_do: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>

        <StepResourceBlock
          attachedResources={attachedResources}
          onAttach={onAttach}
          onRemove={onRemove}
          worksheetContext={worksheetContext}
          vocabulary={vocabulary}
          locked={locked}
        />
      </div>
    </fieldset>
  );
}
