'use client';

// The Independent/Group practice writing card: the block header (phase) and the
// two pink-editable teacher/student textareas. In the split editor the student
// worksheet builder lives in its own right-hand pane (always editable), so this
// card renders the writing only (`showWorksheet={false}`); the optional inline
// worksheet is kept for any caller that still wants the single-card composition.

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
  showWorksheet = true,
  locked = false,
}: {
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  worksheet?: unknown;
  onWorksheetChange?: (worksheet: Worksheet) => void;
  context?: WorksheetContext;
  vocabulary?: TagsByDimension;
  /** When false the inline worksheet builder is omitted (it lives in the split
   *  editor's right pane instead); the card is then the writing textareas only. */
  showWorksheet?: boolean;
  /** When true the plan is submitted/approved: every control inside (incl. the
   *  worksheet builder's toolbar) is disabled via a single `disabled` fieldset. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard');
  const withWorksheet = showWorksheet && !!onWorksheetChange && !!context && !!vocabulary;
  return (
    <fieldset disabled={locked} className="mt-[16px] min-w-0 overflow-hidden rounded-[16px] border border-border bg-surface disabled:opacity-75">
      {/* Block header */}
      <div className="flex flex-wrap items-center gap-[14px] border-b border-[#EFE8DD] px-6 py-[10px]">
        <span className="text-[18px] font-bold">{t('practise.title')}</span>
        <PhaseSelect
          value={block.phase}
          onChange={(phase) => onPatch({ phase: phase as TeachingPhase | null })}
        />
      </div>

      {/* Teacher / student writing (pink-editable) */}
      <div
        className={
          'grid grid-cols-1 gap-[14px] px-6 py-[14px] md:grid-cols-2' +
          (withWorksheet ? ' border-b border-[#EFE8DD]' : '')
        }
      >
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
