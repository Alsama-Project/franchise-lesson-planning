'use client';

// The Independent/Group practice writing card: the block header (phase), the two
// pink-editable teacher/student textareas, and the step's resource block (attached
// resources + direct-upload drop-zone + "Add from bank", the shared
// StepResourceBlock that New content also uses). In the split editor the student
// worksheet builder lives in its own right-hand pane (always editable), so this
// card renders the writing + resources only (`showWorksheet={false}`); the optional
// inline worksheet is kept for any caller that still wants the single-card composition.

import { useTranslations } from 'next-intl';
import type { Block, TeachingPhase, Worksheet } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
import { FieldLabel, Textarea } from '@/components/editor/fields';
import { StepResourceBlock } from '@/components/editor/StepResourceBlock';
import { WorksheetBuilder } from '@/components/editor/worksheet/WorksheetBuilder';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

export function PractiseStep({
  title,
  block,
  onPatch,
  worksheet,
  onWorksheetChange,
  context,
  vocabulary,
  attachedResources,
  onAttach,
  onRemove,
  showWorksheet = true,
  locked = false,
}: {
  /** Numbered step heading (registry-driven), e.g. "5 · Independent practice". */
  title: string;
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  worksheet?: unknown;
  onWorksheetChange?: (worksheet: Worksheet) => void;
  context?: WorksheetContext;
  vocabulary?: TagsByDimension;
  /** Resources currently attached to this block (resolved via the editor cache). */
  attachedResources?: ResourceWithTags[];
  /** Attach a resource to this block (upload or bank). Enables the resource block. */
  onAttach?: (resource: ResourceWithTags) => void;
  onRemove?: (resourceId: string) => void;
  /** When false the inline worksheet builder is omitted (it lives in the split
   *  editor's right pane instead); the card is then the writing + resources only. */
  showWorksheet?: boolean;
  /** When true the plan is submitted/approved: every control inside (incl. the
   *  worksheet builder's toolbar) is disabled via a single `disabled` fieldset. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard');
  const withWorksheet = showWorksheet && !!onWorksheetChange && !!context && !!vocabulary;
  // The resource block needs the attach callback + scoping context/vocabulary.
  const withResources = !!onAttach && !!onRemove && !!context && !!vocabulary;
  return (
    <fieldset disabled={locked} className="mt-[16px] min-w-0 overflow-hidden rounded-[16px] border border-border bg-surface disabled:opacity-75">
      {/* Block header */}
      <div className="flex flex-wrap items-center gap-[14px] border-b border-[#EFE8DD] px-6 py-[10px]">
        <span className="text-[18px] font-bold">{title}</span>
        <PhaseSelect
          value={block.phase}
          onChange={(phase) => onPatch({ phase: phase as TeachingPhase | null })}
        />
      </div>

      {/* Teacher / student writing (pink-editable) + the resource block. */}
      <div
        className={
          'flex flex-col gap-[14px] px-6 py-[14px]' +
          (withWorksheet ? ' border-b border-[#EFE8DD]' : '')
        }
      >
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
          <div>
            <FieldLabel>{t('teach.teacherDoes')}</FieldLabel>
            <Textarea
              dir="auto"
              rows={2}
              value={block.teacher_does}
              onChange={(e) => onPatch({ teacher_does: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <FieldLabel>{t('teach.studentsDo')}</FieldLabel>
            <Textarea
              dir="auto"
              rows={2}
              value={block.students_do}
              onChange={(e) => onPatch({ students_do: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>

        {withResources ? (
          <StepResourceBlock
            attachedResources={attachedResources ?? []}
            onAttach={onAttach!}
            onRemove={onRemove!}
            worksheetContext={context!}
            vocabulary={vocabulary!}
            locked={locked}
          />
        ) : null}
      </div>

      {/* Worksheet builder (toolbar + inline A4 canvas) — only in the single-card
          composition; the split editor renders the builder in its own pane. */}
      {withWorksheet ? (
        <WorksheetBuilder
          value={worksheet}
          onChange={onWorksheetChange!}
          context={context!}
          vocabulary={vocabulary!}
        />
      ) : null}
    </fieldset>
  );
}
