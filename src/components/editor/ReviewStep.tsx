'use client';

import { useState } from 'react';
import type { Block, LessonBlockType, TeachingPhase } from '@/types/lesson';
import { blockMinutes, IN_SESSION_TARGET_MINUTES } from '@/lib/blocks';
import { getBlock, routinesMinutes } from '@/lib/editor/plan-blocks';
import { phaseLabel } from '@/lib/editor/phase';
import { TimeStepper } from '@/components/editor/TimeStepper';

const PHASE_TAG: Record<TeachingPhase, string> = {
  i_do: 'text-[#1F7A6C] bg-[#E4F0ED]',
  we_do: 'text-[#B0651E] bg-[#F6ECDA]',
  you_do: 'text-[#B62A5C] bg-[#F7E4EB]',
};

interface PartRow {
  key: string;
  name: string;
  detail: string;
  phase: TeachingPhase | null;
  minutes: number;
  /** Editable blocks carry a stepper; fixed parts show plain text. */
  type?: LessonBlockType;
}

function blockDetail(block: Block | undefined, fallback: string): string {
  if (!block) return fallback;
  if (block.type === 'cfu' || block.type === 'exit_ticket') {
    const parts = [block.activity_title || '—', block.note].filter(Boolean);
    return parts.join(' · ') || fallback;
  }
  return block.teacher_does || block.students_do || fallback;
}

/**
 * Step 5 — Review: the collapsed objective banner is rendered by the wizard
 * frame above this. Here: editable Required materials chips, then a lesson-parts
 * table (Lesson part · Phase · Time) with click-to-expand rows, phase read-only,
 * and time steppers for the editable blocks. Standard routines are fixed (3 min)
 * and Homework (excluded from the 50) is shown separately.
 */
export function ReviewStep({
  blocks,
  total,
  materials,
  onMaterialsChange,
  onBlockMinutes,
}: {
  blocks: Block[];
  total: number;
  materials: string[];
  onMaterialsChange: (next: string[]) => void;
  onBlockMinutes: (type: LessonBlockType, next: number) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ new_content: true });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const onTarget = total === IN_SESSION_TARGET_MINUTES;

  const homework = getBlock(blocks, 'homework');
  const homeworkMin = homework && blockMinutes(homework) > 0 ? blockMinutes(homework) : 30;

  const parts: PartRow[] = [
    {
      key: 'routines',
      name: 'Standard routines',
      detail: 'Anthem · Warm-up · Cool down — pre-filled and fixed.',
      phase: null,
      minutes: routinesMinutes(blocks),
    },
    {
      key: 'check_homework',
      name: 'Homework check',
      detail: blockDetail(getBlock(blocks, 'check_homework'), 'Review the previous homework.'),
      phase: getBlock(blocks, 'check_homework')?.phase ?? null,
      minutes: blockMinutes(getBlock(blocks, 'check_homework') ?? ({} as Block)),
      type: 'check_homework',
    },
    {
      key: 'recap',
      name: 'Recap',
      detail: blockDetail(getBlock(blocks, 'recap'), 'Activate prior learning.'),
      phase: getBlock(blocks, 'recap')?.phase ?? null,
      minutes: blockMinutes(getBlock(blocks, 'recap') ?? ({} as Block)),
      type: 'recap',
    },
    {
      key: 'new_content',
      name: 'New content',
      detail: blockDetail(getBlock(blocks, 'new_content'), 'Planned in the Teach it step.'),
      phase: getBlock(blocks, 'new_content')?.phase ?? null,
      minutes: blockMinutes(getBlock(blocks, 'new_content') ?? ({} as Block)),
      type: 'new_content',
    },
    {
      key: 'cfu',
      name: 'Check for Understanding',
      detail: blockDetail(getBlock(blocks, 'cfu'), 'Pick a technique in the Link it step.'),
      phase: getBlock(blocks, 'cfu')?.phase ?? null,
      minutes: blockMinutes(getBlock(blocks, 'cfu') ?? ({} as Block)),
      type: 'cfu',
    },
    {
      key: 'independent_practice',
      name: 'Independent practice',
      detail: blockDetail(getBlock(blocks, 'independent_practice'), 'Planned in the Practise step.'),
      phase: getBlock(blocks, 'independent_practice')?.phase ?? null,
      minutes: blockMinutes(getBlock(blocks, 'independent_practice') ?? ({} as Block)),
      type: 'independent_practice',
    },
    {
      key: 'exit_ticket',
      name: 'Exit ticket',
      detail: blockDetail(getBlock(blocks, 'exit_ticket'), 'Pick an exit ticket in the Link it step.'),
      phase: getBlock(blocks, 'exit_ticket')?.phase ?? null,
      minutes: blockMinutes(getBlock(blocks, 'exit_ticket') ?? ({} as Block)),
      type: 'exit_ticket',
    },
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
        <div className="text-[22px] font-semibold">Review the whole lesson</div>
        <div className="inline-flex items-center gap-2 text-[13px]">
          <span className="text-neutral-600">In-session total</span>
          <span className={`font-bold ${onTarget ? 'text-[#2E7D5B]' : 'text-[#B0651E]'}`}>
            {total} / {IN_SESSION_TARGET_MINUTES} min
          </span>
        </div>
      </div>

      {/* Required materials */}
      <div className="mt-4 rounded-[13px] border border-border px-4 py-[15px]">
        <div className="mb-2.5 flex items-center justify-between gap-2.5">
          <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-neutral-700">
            Required materials
          </span>
          <span className="text-[11px] text-neutral-400">pre-filled from your blocks · editable</span>
        </div>
        <div className="flex flex-wrap gap-[7px]">
          {materials.map((m, i) => (
            <span
              key={`${m}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface-subtle px-[11px] py-[6px] text-[12.5px] text-neutral-900"
            >
              {m}
              <button
                type="button"
                onClick={() => removeMaterial(i)}
                aria-label={`Remove ${m}`}
                className="text-neutral-300 hover:text-pink"
              >
                ✕
              </button>
            </span>
          ))}
          {adding ? (
            <input
              autoFocus
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
              placeholder="Material name…"
              className="rounded-[8px] border border-teal bg-surface px-[11px] py-[6px] text-[12.5px] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-[8px] border border-dashed border-[#CFE6E0] bg-[#E4F0ED] px-[11px] py-[6px] text-[12.5px] font-semibold text-teal"
            >
              ＋ Add material
            </button>
          )}
        </div>
      </div>

      {/* Lesson-parts table */}
      <div className="mt-3.5 overflow-hidden rounded-[13px] border border-border">
        <div className="grid grid-cols-[1fr_92px_96px] border-b border-[#EFE8DD] bg-surface-subtle text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-400">
          <div className="px-4 py-2.5">Lesson part</div>
          <div className="px-2 py-2.5 text-center">Phase</div>
          <div className="px-3.5 py-2.5 text-right">Time</div>
        </div>
        {parts.map((p) => {
          const open = !!expanded[p.key];
          const editable = !!p.type;
          return (
            <div key={p.key} className="border-b border-[#F0EAE1]">
              <div className="grid grid-cols-[1fr_92px_96px] items-center">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [p.key]: !e[p.key] }))}
                  className="flex items-center gap-2 px-4 py-[11px] text-left"
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
                    className={open ? 'rotate-90 transition-transform' : 'transition-transform'}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">{p.name}</span>
                </button>
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
                  {editable ? (
                    <TimeStepper
                      small
                      value={p.minutes}
                      onChange={(next) => onBlockMinutes(p.type!, next)}
                    />
                  ) : (
                    <span className="text-[12.5px] text-neutral-600">{p.minutes} min</span>
                  )}
                </div>
              </div>
              {open ? (
                <div className="px-4 pb-[13px] pl-[37px] text-[12.5px] leading-[1.5] text-neutral-800">
                  {p.detail}
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="grid grid-cols-[1fr_96px] bg-[#FBF6EF]">
          <div className="px-4 py-[11px] text-[13px] font-semibold">
            Homework <span className="font-medium text-neutral-600">— at home, excluded from 50</span>
          </div>
          <div className="px-3.5 py-[11px] text-right text-[12.5px] text-neutral-600">
            {homeworkMin} min
          </div>
        </div>
      </div>
    </div>
  );
}
