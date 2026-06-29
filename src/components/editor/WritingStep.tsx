'use client';

// The shared two-pane layout for steps 2 (Teach it) and 3 (Practise). The LEFT
// pane is the teacher's writing — "What the teacher does" / "What students do" —
// plus this section's "Attached from the bank" list and, on Practise, the
// student worksheet builder. The RIGHT pane is the embedded Resource Bank panel
// (a fixed 396px column, a 1px divider, no shadow), identical on both steps.

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { Block, TeachingPhase } from '@/types/lesson';
import type { Folder, ResourceWithTags, TagsByDimension } from '@/types/resource';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
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
  attachedResources,
  onAttach,
  onRemove,
  worksheetSlot,
  locked = false,
}: {
  title: string;
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  subjectId: string | null;
  vocabulary: TagsByDimension;
  folders: Folder[];
  attachedResources: ResourceWithTags[];
  onAttach: (resource: ResourceWithTags) => void;
  onRemove: (resourceId: string) => void;
  /** The student worksheet builder, rendered on the Practise step only. */
  worksheetSlot?: ReactNode;
  /** When true the plan is submitted/approved: every control inside is disabled
   *  via a single `disabled` fieldset, so the step is read-only. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard.teach');
  return (
    <fieldset disabled={locked} className="mt-[22px] min-w-0 overflow-hidden rounded-[16px] border border-border disabled:opacity-75">
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
      </div>

      {/* Two panes: writing (left) · embedded resource bank (right, 396px) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_396px]">
        <div className="flex flex-col gap-[18px] p-6">
          <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
            <div>
              <FieldLabel>{t('teacherDoes')}</FieldLabel>
              <Textarea
                dir="auto"
                rows={4}
                value={block.teacher_does}
                onChange={(e) => onPatch({ teacher_does: e.target.value })}
                placeholder={t('teacherPlaceholder')}
                className="mt-1.5"
              />
            </div>
            <div>
              <FieldLabel>{t('studentsDo')}</FieldLabel>
              <Textarea
                dir="auto"
                rows={4}
                value={block.students_do}
                onChange={(e) => onPatch({ students_do: e.target.value })}
                placeholder={t('studentsPlaceholder')}
                className="mt-1.5"
              />
            </div>
          </div>

          {worksheetSlot ? (
            <div>
              <div className="mb-[8px] flex items-center gap-[8px]">
                <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-neutral-700">
                  {t('worksheetTitle')}
                </span>
                <span className="text-[11px] text-text-faint">
                  {t('worksheetHint')}
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
          attachedIds={block.resourceIds ?? []}
          onAttach={onAttach}
        />
      </div>
    </fieldset>
  );
}
