'use client';

import { useState } from 'react';
import type { Block, TeachingPhase } from '@/types/lesson';
import type { ActivityBankItem, ClassLiteracy } from '@/lib/editor/load-plan';
import { blockMinutes } from '@/lib/blocks';
import { PhaseSelect } from '@/components/editor/PhaseSelect';
import { TimeStepper } from '@/components/editor/TimeStepper';
import { Textarea } from '@/components/editor/fields';

const VISIBLE_BEFORE_EXPAND = 4;

type Accent = 'teal' | 'pink';

const ACCENT: Record<
  Accent,
  { label: string; selectedCard: string; selectText: string; noteLabel: string }
> = {
  teal: {
    label: 'text-[#186155]',
    selectedCard: 'border-[1.5px] border-teal bg-[#E4F0ED]',
    selectText: 'text-teal',
    noteLabel: 'text-[#186155]',
  },
  pink: {
    label: 'text-pink',
    selectedCard: 'border-[1.5px] border-pink bg-[#FBF2F5]',
    selectText: 'text-pink',
    noteLabel: 'text-pink',
  },
};

/** The literacy-specific instruction chips shown under a selected technique. */
function LiteracyChips({
  activity,
  literacy,
}: {
  activity: ActivityBankItem;
  literacy: ClassLiteracy;
}) {
  const chips: { label: string; className: string }[] = [];
  if ((literacy === 'literate' || literacy === 'mixed') && activity.literate_instructions) {
    chips.push({
      label: `Literate · ${activity.literate_instructions}`,
      className: 'border-[#CFE6E0] text-[#186155]',
    });
  }
  if ((literacy === 'illiterate' || literacy === 'mixed') && activity.illiterate_instructions) {
    chips.push({
      label: `Illiterate · ${activity.illiterate_instructions}`,
      className: 'border-[#F1D8E1] text-pink',
    });
  }
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-[7px]">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`rounded-badge border bg-surface px-2 py-[3px] text-[11px] ${c.className}`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function TechniqueColumn({
  heading,
  pickHint,
  accent,
  activities,
  selectedRef,
  note,
  noteLabel,
  notePlaceholder,
  literacy,
  onSelect,
  onNote,
}: {
  heading: string;
  pickHint: string;
  accent: Accent;
  activities: ActivityBankItem[];
  selectedRef: string | null;
  note: string;
  noteLabel: string;
  notePlaceholder: string;
  literacy: ClassLiteracy;
  onSelect: (activity: ActivityBankItem | null) => void;
  onNote: (note: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const a = ACCENT[accent];

  const visible = activities.filter(
    (item, i) => showAll || i < VISIBLE_BEFORE_EXPAND || item.id === selectedRef,
  );
  const hidden = activities.length - visible.length;

  return (
    <div className="p-[22px]">
      <div className="mb-[11px] flex items-baseline justify-between">
        <span className={`text-[12px] font-bold uppercase tracking-[0.05em] ${a.label}`}>
          {heading}
        </span>
        <span className="text-[12px] text-neutral-400">{pickHint}</span>
      </div>
      <div className="flex flex-col gap-[9px]">
        {visible.map((item) => {
          const selected = item.id === selectedRef;
          if (selected) {
            return (
              <div key={item.id} className={`rounded-[11px] px-[13px] py-3 ${a.selectedCard}`}>
                <button
                  type="button"
                  onClick={() => onSelect(null)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-[14px] font-semibold">{item.name}</span>
                  <span
                    className={
                      'rounded-badge px-[9px] py-[3px] text-[11px] font-semibold text-white ' +
                      (accent === 'teal' ? 'bg-teal' : 'bg-pink')
                    }
                  >
                    ✓ Selected
                  </span>
                </button>
                <LiteracyChips activity={item} literacy={literacy} />
                <div className="mt-[10px]">
                  <label className={`text-[11.5px] font-semibold ${a.noteLabel}`}>{noteLabel}</label>
                  <Textarea
                    rows={2}
                    value={note}
                    onChange={(e) => onNote(e.target.value)}
                    placeholder={notePlaceholder}
                    className="mt-1.5 bg-surface"
                  />
                </div>
              </div>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="flex items-center justify-between gap-2 rounded-[11px] border border-border bg-surface px-[13px] py-[11px] text-left hover:border-border-strong"
            >
              <span className="text-[14px] font-semibold">{item.name}</span>
              <span className={`text-[12px] font-semibold ${a.selectText}`}>Select</span>
            </button>
          );
        })}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-[9px] border border-dashed border-[#DACFBE] bg-surface-subtle px-3 py-[9px] text-[12.5px] font-medium text-neutral-600 hover:bg-surface"
          >
            Show all {activities.length} techniques
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Step 4 — Link it: two bordered halves. Left = Check for Understanding, right =
 * Exit ticket. Each is a single-select list of pre-approved techniques; the
 * selected one expands a 1–2 line note. The header carries the phase dropdown
 * and the CFU/Exit time steppers.
 */
export function LinkItStep({
  cfuBlock,
  exitBlock,
  cfuActivities,
  exitActivities,
  literacy,
  onCfuChange,
  onExitChange,
}: {
  cfuBlock: Block;
  exitBlock: Block;
  cfuActivities: ActivityBankItem[];
  exitActivities: ActivityBankItem[];
  literacy: ClassLiteracy;
  onCfuChange: (patch: Partial<Block>) => void;
  onExitChange: (patch: Partial<Block>) => void;
}) {
  function selectActivity(
    block: Block,
    onChange: (patch: Partial<Block>) => void,
    activity: ActivityBankItem | null,
  ) {
    if (!activity) {
      onChange({ activity_ref: null, activity_title: '' });
      return;
    }
    onChange({ activity_ref: activity.id, activity_title: activity.name });
  }

  return (
    <div className="mt-[22px] overflow-hidden rounded-[16px] border border-border">
      <div className="flex flex-wrap items-start justify-between gap-[14px] border-b border-[#EFE8DD] px-6 py-[18px]">
        <div>
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="text-[20px] font-semibold">Link it together</span>
            <PhaseSelect
              value={cfuBlock.phase}
              onChange={(phase) => onCfuChange({ phase: phase as TeachingPhase | null })}
            />
          </div>
          <div className="mt-1 text-[13.5px] text-neutral-600">
            Pick one check for understanding, then the exit ticket — from your pre-approved
            activities.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-[10px]">
          <TimeStepper
            label="CFU min"
            value={blockMinutes(cfuBlock)}
            onChange={(next) => onCfuChange({ minutes: next })}
          />
          <TimeStepper
            label="Exit min"
            value={blockMinutes(exitBlock)}
            onChange={(next) => onExitChange({ minutes: next })}
          />
        </div>
      </div>
      {/* TODO(reskin): the mockup shows a right-hand resource bank pane on this
          step ("two-pane bank"). It is intentionally NOT wired here: Step 4 has
          two blocks (cfu + exit_ticket) and the attach target is undefined, so
          adding it would be new behaviour rather than a restyle. Confirm the
          intended target before exposing ResourcePanel on Step 4. */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="border-b border-[#EFE8DD] lg:border-b-0 lg:border-r">
          <TechniqueColumn
            heading="Check for Understanding"
            pickHint="pick one"
            accent="teal"
            activities={cfuActivities}
            selectedRef={cfuBlock.activity_ref}
            note={cfuBlock.note ?? ''}
            noteLabel="What you'll do (1–2 lines)"
            notePlaceholder="e.g. After reading, ask students to show 0–5 fingers…"
            literacy={literacy}
            onSelect={(activity) => selectActivity(cfuBlock, onCfuChange, activity)}
            onNote={(note) => onCfuChange({ note })}
          />
        </div>
        <div>
          <TechniqueColumn
            heading="Exit ticket"
            pickHint="pick 1"
            accent="pink"
            activities={exitActivities}
            selectedRef={exitBlock.activity_ref}
            note={exitBlock.note ?? ''}
            noteLabel="What students do (1–2 lines)"
            notePlaceholder="e.g. Draw one family member and label them."
            literacy={literacy}
            onSelect={(activity) => selectActivity(exitBlock, onExitChange, activity)}
            onNote={(note) => onExitChange({ note })}
          />
        </div>
      </div>
    </div>
  );
}
