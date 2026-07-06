'use client';

// The "Teach it" (new content) step body: the phase header, the two pink-editable
// teacher/student textareas, and the "Attached from the bank" list. Browsing the
// resource bank is done through the shared ResourceBankModal opened from here (the
// same picker the worksheet uses) — there is no embedded bank browser inline; the
// left pane shows only what has been attached.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Block, TeachingPhase } from '@/types/lesson';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
import { FieldLabel, Textarea } from '@/components/editor/fields';
import { AttachedList } from '@/components/editor/AttachedList';
import { ResourceBankModal } from '@/components/editor/worksheet/ResourceBankModal';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

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
  /** Subject/year/theme scoping for the resource-bank picker. */
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
  const [bankOpen, setBankOpen] = useState(false);

  return (
    <>
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
                placeholder={t('teacherPlaceholder')}
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
                placeholder={t('studentsPlaceholder')}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <AttachedList resources={attachedResources} onRemove={onRemove} />
            <button
              type="button"
              onClick={() => setBankOpen(true)}
              className="mt-[10px] inline-flex items-center gap-[6px] rounded-[9px] border border-dashed border-teal-tint-border bg-teal-tint px-[12px] py-[8px] text-[13px] font-semibold text-teal hover:bg-[#d8ebe6]"
            >
              <PlusIcon />
              {t('addFromBank')}
            </button>
          </div>
        </div>
      </fieldset>

      {/* The bank picker lives OUTSIDE the disabled fieldset so it stays fully
          interactive; it can only be opened while the plan is unlocked. */}
      {bankOpen ? (
        <ResourceBankModal
          ctx={worksheetContext}
          vocabulary={vocabulary}
          onClose={() => setBankOpen(false)}
          onAdd={(resource) => {
            onAttach(resource);
            setBankOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
