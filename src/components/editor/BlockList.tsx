'use client';

import { useState } from 'react';
import type { Block, LessonBlockType } from '@/types/lesson';
import { IN_SESSION_TARGET_MINUTES, inSessionMinutes } from '@/lib/blocks';
import { phaseTag } from '@/lib/editor/phase';
import { cn } from '@/lib/cn';

interface BlockListProps {
  blocks: Block[];
  selected: number;
  onSelect: (index: number) => void;
}

const ROUTINE_TYPES: LessonBlockType[] = ['anthem', 'warm_up', 'cool_down'];

/** Short preview of the teacher's content for a block. */
function preview(block: Block): string {
  const text = block.activity_title || block.teacher_does || block.students_do || '';
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** Phase-tag colour, matching the design's I/We/You do badges. */
function tagClasses(block: Block): string {
  switch (block.phase) {
    case 'i_do':
      return 'text-teal bg-status-submitted-bg';
    case 'we_do':
      return 'text-status-progress bg-status-progress-bg';
    case 'you_do':
      return 'text-pink bg-status-review-bg';
    default:
      return '';
  }
}

function BlockRow({
  block,
  index,
  active,
  compact,
  onSelect,
}: {
  block: Block;
  index: number;
  active: boolean;
  compact?: boolean;
  onSelect: (i: number) => void;
}) {
  const tag = phaseTag(block.phase);
  const text = preview(block);
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      className={cn(
        'w-full rounded-md border bg-surface px-3 text-left',
        compact ? 'py-2' : 'py-[11px]',
        active
          ? 'border-teal shadow-[0_0_0_4px_rgba(31,122,108,0.10)]'
          : 'cursor-pointer border-border transition-colors hover:border-teal',
      )}
    >
      <div className="flex justify-between gap-2">
        <span className={cn('font-semibold', compact ? 'text-[13px]' : 'text-[14px]', active && 'text-[#186155]')}>
          {block.title}
        </span>
        <span className={cn('whitespace-nowrap text-[12px]', active ? 'font-semibold text-teal' : 'text-neutral-600')}>
          {block.duration_minutes} min
        </span>
      </div>
      {text ? (
        <div className={cn('mt-[3px] text-[12px]', block.activity_title ? 'font-semibold text-teal' : 'text-neutral-700')}>
          {text}
        </div>
      ) : (
        !compact && <div className="mt-[3px] text-[12px] italic text-neutral-400">No content yet</div>
      )}
      {tag ? (
        <span className={cn('mt-[7px] inline-block rounded-badge px-[7px] py-0.5 text-[10.5px] font-semibold tracking-[0.04em]', tagClasses(block))}>
          {tag}
        </span>
      ) : null}
    </button>
  );
}

export function BlockList({ blocks, selected, onSelect }: BlockListProps) {
  // The three fixed routines are bundled into one group, collapsed by default.
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const total = inSessionMinutes(blocks);
  const over = total > IN_SESSION_TARGET_MINUTES;
  const onTarget = total === IN_SESSION_TARGET_MINUTES;
  const pct = Math.min(100, Math.round((total / IN_SESSION_TARGET_MINUTES) * 100));

  const indexed = blocks.map((block, index) => ({ block, index }));
  const routines = indexed.filter((b) => ROUTINE_TYPES.includes(b.block.type));
  const homework = indexed.filter((b) => b.block.type === 'homework');
  const main = indexed.filter(
    (b) => !ROUTINE_TYPES.includes(b.block.type) && b.block.type !== 'homework',
  );
  const routineMinutes = routines.reduce((s, r) => s + r.block.duration_minutes, 0);

  return (
    <div className="flex flex-col border-r border-border bg-surface-subtle p-[22px]">
      <div className="mx-0.5 mb-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
        Lesson blocks · {IN_SESSION_TARGET_MINUTES} min
      </div>

      {/* Standard routines — the three fixed routines bundled into one
          collapsible group; collapsed by default, expands to view/edit them. */}
      <div className="mb-3 rounded-md border border-dashed border-border-strong bg-cream/60">
        <button
          type="button"
          onClick={() => setRoutinesOpen((open) => !open)}
          aria-expanded={routinesOpen}
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-[9px] text-left"
        >
          <span className="flex items-center gap-1.5">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn('text-neutral-500 transition-transform', routinesOpen && 'rotate-90')}
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            <span className="text-[13px] font-medium text-neutral-700">Standard routines</span>
          </span>
          <span className="text-[12px] text-neutral-400">{routineMinutes} min · auto</span>
        </button>
        {routinesOpen ? (
          <div className="flex flex-col gap-2 px-2 pb-2">
            {routines.map(({ block, index }) => (
              <BlockRow
                key={block.type}
                block={block}
                index={index}
                active={selected === index}
                compact
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Main blocks */}
      <div className="flex flex-col gap-3">
        {main.map(({ block, index }) => (
          <BlockRow
            key={block.type}
            block={block}
            index={index}
            active={selected === index}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* Homework — done at home, excluded from the 50-minute total */}
      {homework.map(({ block, index }) => (
        <div key={block.type} className="mt-3 border-t border-dashed border-border-strong pt-3">
          <BlockRow block={block} index={index} active={selected === index} onSelect={onSelect} />
          <div className="mt-1 px-1 text-[11px] text-neutral-400">
            30–60 min · not counted in {IN_SESSION_TARGET_MINUTES} min
          </div>
        </div>
      ))}

      {/* Timing meter */}
      <div className="mt-[18px]">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-[5px] text-[12px] text-neutral-700">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            Lesson time
          </span>
          <span
            className={cn(
              'text-[13px] font-semibold',
              over ? 'text-pink' : onTarget ? 'text-status-approved' : 'text-neutral-700',
            )}
          >
            {total} / {IN_SESSION_TARGET_MINUTES} min
            {over ? ' · over target' : onTarget ? ' · on target' : ''}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={cn('h-full rounded-full', over ? 'bg-pink' : 'bg-status-approved')}
            style={{ width: `${pct}%` }}
          />
        </div>
        {over ? (
          <div className="mt-1.5 text-[11.5px] text-pink">
            {total - IN_SESSION_TARGET_MINUTES} min over — trim a block to reach {IN_SESSION_TARGET_MINUTES} min.
          </div>
        ) : null}
      </div>
    </div>
  );
}
