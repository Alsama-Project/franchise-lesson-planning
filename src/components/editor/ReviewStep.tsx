'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Block, LessonBlockType, PlanStatus, TeachingPhase } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import { blockMinutes, IN_SESSION_TARGET_MINUTES } from '@/lib/blocks';
import { formatNumber } from '@/lib/format';
import { getBlock, routinesMinutes } from '@/lib/editor/plan-blocks';
import { normalizeLinkIt, resolveTechniques } from '@/lib/editor/link-it';
import { phaseLabel } from '@/lib/editor/phase';
import { TimeStepper } from '@/components/editor/TimeStepper';
import { PartContent } from '@/components/editor/PartContent';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

const PHASE_TAG: Record<TeachingPhase, string> = {
  i_do: 'text-[#1F7A6C] bg-[#E4F0ED]',
  we_do: 'text-[#B0651E] bg-[#F6ECDA]',
  you_do: 'text-[#B62A5C] bg-[#F7E4EB]',
};

interface PartRow {
  key: string;
  name: string;
  /** Fixed-part description, shown when the part has no editable block (routines). */
  detail: string;
  phase: TeachingPhase | null;
  minutes: number;
  /** Editable blocks carry a stepper; fixed parts show plain text. */
  type?: LessonBlockType;
  /** The plan block this part maps to, resolved once for header + body. */
  block?: Block;
}

/**
 * Step 5 — Review: the collapsed objective banner is rendered by the wizard
 * frame above this. Here: editable Required materials chips, then a lesson-parts
 * table (Lesson part · Phase · Time) with click-to-expand rows, phase read-only,
 * and time steppers for the editable blocks. Standard routines keep standard
 * content (anthem · warm-up · cool down) but their time is editable, and
 * Homework (excluded from the 50) is shown separately.
 */
export function ReviewStep({
  planId,
  status,
  blocks,
  total,
  materials,
  worksheet,
  worksheetContext,
  techniqueLabels,
  attachedFor,
  onMaterialsChange,
  onBlockMinutes,
  onRoutinesMinutes,
  locked = false,
}: {
  planId: string;
  status: PlanStatus;
  blocks: Block[];
  total: number;
  materials: string[];
  /** The plan's student worksheet (rendered read-only under Independent practice). */
  worksheet: unknown;
  /** Master-frame context for the read-only worksheet render. */
  worksheetContext: WorksheetContext;
  /** Technique id → display-name map for resolving the Link-it selections. */
  techniqueLabels: Map<string, string>;
  /** Resolve a block's attached bank resources via the editor's client cache. */
  attachedFor: (block: Block | undefined) => ResourceWithTags[];
  onMaterialsChange: (next: string[]) => void;
  onBlockMinutes: (type: LessonBlockType, next: number) => void;
  /** Set the Standard-routines total minutes (spread across anthem/warm-up/cool-down). */
  onRoutinesMinutes: (next: number) => void;
  /** When true the plan is submitted/approved: the materials editor and the time
   *  steppers become read-only (the row expanders stay live so the plan can still
   *  be reviewed). The Submit/Unlock control lives in the wizard header, not here. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard');
  const locale = useLocale();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ new_content: true });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const onTarget = total === IN_SESSION_TARGET_MINUTES;

  // "Link it together" selections, resolved to display rows for the cfu / exit parts.
  const linkIt = normalizeLinkIt(blocks);
  const techniquesFor = (key: string) =>
    key === 'cfu'
      ? resolveTechniques(linkIt.checkForUnderstanding, techniqueLabels)
      : key === 'exit_ticket'
        ? resolveTechniques(linkIt.exitTicket, techniqueLabels)
        : undefined;

  const homework = getBlock(blocks, 'homework');
  const homeworkMin = homework && blockMinutes(homework) > 0 ? blockMinutes(homework) : 30;

  const part = (key: string, name: string, type: LessonBlockType): PartRow => {
    const block = getBlock(blocks, type);
    return {
      key,
      name,
      detail: '',
      phase: block?.phase ?? null,
      minutes: blockMinutes(block ?? ({} as Block)),
      type,
      block,
    };
  };

  const parts: PartRow[] = [
    {
      key: 'routines',
      name: t('review.parts.routines'),
      detail: t('review.parts.routinesDetail'),
      phase: null,
      minutes: routinesMinutes(blocks),
    },
    part('check_homework', t('review.parts.homeworkCheck'), 'check_homework'),
    part('recap', t('review.parts.recap'), 'recap'),
    part('new_content', t('review.parts.newContent'), 'new_content'),
    part('cfu', t('review.parts.cfu'), 'cfu'),
    part('independent_practice', t('review.parts.independentPractice'), 'independent_practice'),
    part('exit_ticket', t('review.parts.exitTicket'), 'exit_ticket'),
  ];

  function commitDraft() {
    const value = draft.trim();
    if (value && !materials.some((m) => m.toLowerCase() === value.toLowerCase())) {
      onMaterialsChange([...materials, value]);
    }
    setDraft('');
    setAdding(false);
  }

  function removeMaterial(index: number) {
    onMaterialsChange(materials.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-[22px] font-semibold">{t('review.heading')}</div>
        <div className="flex flex-wrap items-center gap-4">
          {status === 'approved' ? (
            <a
              href={`/api/pdf/plan/${planId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[7px] rounded-[9px] border border-status-approved-border bg-status-approved-bg px-[13px] py-2 text-[13px] font-semibold text-status-approved hover:bg-[#d6ebe0]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              {t('review.downloadPdf')}
            </a>
          ) : null}
          <div className="inline-flex items-center gap-2 text-[13px]">
            <span className="text-neutral-600">{t('review.inSessionTotal')}</span>
            <span className={`font-bold ${onTarget ? 'text-[#2E7D5B]' : 'text-[#B0651E]'}`}>
              {t('total.inSession', {
                total: formatNumber(total, locale),
                target: formatNumber(IN_SESSION_TARGET_MINUTES, locale),
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Required materials */}
      <div className="mt-4 rounded-[13px] border border-border px-4 py-[15px]">
        <div className="mb-2.5 flex items-center justify-between gap-2.5">
          <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-neutral-700">
            {t('review.requiredMaterials')}
          </span>
          <span className="text-[11px] text-neutral-400">{t('review.materialsHint')}</span>
        </div>
        <div className="flex flex-wrap gap-[7px]">
          {materials.map((m, i) => (
            <span
              key={`${m}-${i}`}
              dir="auto"
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface-subtle px-[11px] py-[6px] text-[12.5px] text-neutral-900"
            >
              {m}
              {locked ? null : (
                <button
                  type="button"
                  onClick={() => removeMaterial(i)}
                  aria-label={t('review.removeMaterial', { name: m })}
                  className="text-neutral-300 hover:text-pink"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {locked && materials.length === 0 ? (
            <span className="text-[12.5px] text-neutral-400">{t('review.noMaterials')}</span>
          ) : null}
          {locked ? null : adding ? (
            <input
              autoFocus
              dir="auto"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDraft();
                if (e.key === 'Escape') {
                  setDraft('');
                  setAdding(false);
                }
              }}
              placeholder={t('review.materialPlaceholder')}
              className="rounded-[8px] border border-teal bg-surface px-[11px] py-[6px] text-[12.5px] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-[8px] border border-dashed border-[#CFE6E0] bg-[#E4F0ED] px-[11px] py-[6px] text-[12.5px] font-semibold text-teal"
            >
              {t('review.addMaterial')}
            </button>
          )}
        </div>
      </div>

      {/* Lesson-parts table */}
      <div className="mt-3.5 overflow-hidden rounded-[13px] border border-border">
        <div className="grid grid-cols-[1fr_92px_96px] border-b border-[#EFE8DD] bg-surface-subtle text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-400">
          <div className="px-4 py-2.5">{t('review.colPart')}</div>
          <div className="px-2 py-2.5 text-center">{t('review.colPhase')}</div>
          <div className="px-3.5 py-2.5 text-end">{t('review.colTime')}</div>
        </div>
        {parts.map((p) => {
          const open = !!expanded[p.key];
          const editable = !!p.type;
          // The Standard-routines part maps to no single block — it's the
          // opening strip (anthem · warm-up · cool down), so it doesn't expand or
          // carry a planning area; its stock description sits inline. Its content
          // stays standard, but its total time is editable (spread across the
          // three routine blocks).
          const isRoutine = !p.type;
          return (
            <div key={p.key} className="border-b border-[#F0EAE1]">
              <div className="grid grid-cols-[1fr_92px_96px] items-center">
                {isRoutine ? (
                  <div className="flex flex-col gap-[2px] px-4 py-[11px]">
                    <span className="text-[13.5px] font-semibold">{p.name}</span>
                    {p.detail ? (
                      <span dir="auto" className="text-[12px] text-neutral-500">{p.detail}</span>
                    ) : null}
                  </div>
                ) : (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [p.key]: !e[p.key] }))}
                  className="flex items-center gap-2 px-4 py-[11px] text-start"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B6ABA0"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={
                      (open ? 'rotate-90' : 'rtl:-scale-x-100') + ' transition-transform'
                    }
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">{p.name}</span>
                </button>
                )}
                <div className="px-2 py-[11px] text-center">
                  {p.phase ? (
                    <span
                      className={`rounded-[5px] px-[7px] py-0.5 text-[10px] font-bold ${PHASE_TAG[p.phase]}`}
                    >
                      {phaseLabel(p.phase)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-end px-3 py-[9px]">
                  {isRoutine && !locked ? (
                    <TimeStepper
                      small
                      value={p.minutes}
                      onChange={(next) => onRoutinesMinutes(next)}
                    />
                  ) : editable && !locked ? (
                    <TimeStepper
                      small
                      value={p.minutes}
                      onChange={(next) => onBlockMinutes(p.type!, next)}
                    />
                  ) : (
                    <span className="text-[12.5px] text-neutral-600">
                      {t('total.minutes', { value: formatNumber(p.minutes, locale) })}
                    </span>
                  )}
                </div>
              </div>
              {open && !isRoutine ? (
                <div className="px-4 pb-[13px] ps-[37px]">
                  <PartContent
                    block={p.block}
                    attachedResources={attachedFor(p.block)}
                    worksheet={p.key === 'independent_practice' ? worksheet : undefined}
                    worksheetContext={
                      p.key === 'independent_practice' ? worksheetContext : undefined
                    }
                    techniques={techniquesFor(p.key)}
                    fallback={p.detail}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="grid grid-cols-[1fr_96px] bg-[#FBF6EF]">
          <div className="px-4 py-[11px] text-[13px] font-semibold">
            {t('review.homework')}{' '}
            <span className="font-medium text-neutral-600">{t('review.homeworkNote')}</span>
          </div>
          <div className="px-3.5 py-[11px] text-end text-[12.5px] text-neutral-600">
            {t('total.minutes', { value: formatNumber(homeworkMin, locale) })}
          </div>
        </div>
      </div>
    </div>
  );
}
