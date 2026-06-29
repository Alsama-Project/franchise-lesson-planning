'use client';

// Step 3 (Practise) body. Unlike the two-pane "Teach it" step, Practise is a
// single full-width card: the block header (phase), the two pink-
// editable teacher/student textareas, and below them the full student-worksheet
// builder (toolbar + inline A4 canvas). The resource bank is reached through the
// builder's modal (not an embedded side panel), matching the mockup.

import { useTranslations } from 'next-intl';
import type { Block, TeachingPhase, Worksheet } from '@/types/lesson';
import type { TagsByDimension } from '@/types/resource';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
import { FieldLabel, Textarea } from '@/components/editor/fields';
import { WorksheetBuilder } from '@/components/editor/worksheet/WorksheetBuilder';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

export function PractiseStep({
  block,
  onPatch,
  worksheet,
  onWorksheetChange,
  context,
  vocabulary,
  locked = false,
}: {
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  worksheet: unknown;
  onWorksheetChange: (worksheet: Worksheet) => void;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
  /** When true the plan is submitted/approved: every control inside (incl. the
   *  worksheet builder's toolbar) is disabled via a single `disabled` fieldset. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard');
  return (
    <fieldset disabled={locked} className="mt-[22px] min-w-0 overflow-hidden rounded-[16px] border border-border bg-surface disabled:opacity-75">
      {/* Block header */}
      <div className="flex flex-wrap items-center gap-[14px] border-b border-[#EFE8DD] px-6 py-[18px]">
        <span className="text-[20px] font-semibold">{t('practise.title')}</span>
        <PhaseSelect
          value={block.phase}
          onChange={(phase) => onPatch({ phase: phase as TeachingPhase | null })}
        />
      </div>

      {/* Teacher / student writing (pink-editable) */}
      <div className="grid grid-cols-1 gap-[14px] border-b border-[#EFE8DD] px-6 py-[18px] md:grid-cols-2">
        <div>
          <FieldLabel>{t('teach.teacherDoes')}</FieldLabel>
          <Textarea
            dir="auto"
            rows={2}
            value={block.teacher_does}
            onChange={(e) => onPatch({ teacher_does: e.target.value })}
            placeholder={t('teach.teacherPlaceholder')}
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
            placeholder={t('teach.studentsPlaceholder')}
            className="mt-1.5"
          />
        </div>
      </div>

      {/* Worksheet builder (toolbar + inline A4 canvas) */}
      <WorksheetBuilder
        value={worksheet}
        onChange={onWorksheetChange}
        context={context}
        vocabulary={vocabulary}
      />
    </fieldset>
  );
}
