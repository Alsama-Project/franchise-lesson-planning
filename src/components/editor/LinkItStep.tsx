'use client';

import { useState } from 'react';
import type { LinkItTechnique } from '@/types/lesson';
import type { ActivityBankItem } from '@/lib/editor/load-plan';
import type { LinkIt } from '@/lib/editor/link-it';

/** Pink editable note field (colour semantic: pink = teacher-editable). */
const NOTE_FIELD =
  'w-full rounded-[9px] border border-mine-field bg-surface px-[11px] py-[8px] font-sans ' +
  'text-[13px] leading-[1.5] text-ink placeholder:text-neutral-400 outline-none ' +
  'focus:border-pink focus:ring-2 focus:ring-pink/25';

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Shared strip frame: a full-width bordered card with a title and its content. */
function Strip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface px-[18px] py-[16px]">
      <div className="text-[14px] font-bold uppercase tracking-[0.05em] text-neutral-700">
        {title}
      </div>
      <div className="mt-[12px]">{children}</div>
    </div>
  );
}

/** The teal "+ Add" button + its inline technique popover. */
function AddTechnique({
  activities,
  selected,
  onAdd,
}: {
  activities: ActivityBankItem[];
  selected: LinkItTechnique[];
  onAdd: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // An already-added technique drops out of the list.
  const available = activities.filter((a) => !selected.some((s) => s.technique === a.id));

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-[6px] rounded-[9px] border border-dashed border-teal-tint-border bg-teal-tint px-[12px] py-[8px] text-[13px] font-semibold text-teal hover:bg-[#d8ebe6]"
      >
        <PlusIcon />
        Add
      </button>
      {open ? (
        <>
          {/* Click-away backdrop. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-[280px] w-[280px] overflow-auto rounded-[12px] border border-border bg-surface p-[6px] shadow-[0_8px_28px_rgba(42,36,34,0.16)]">
            {available.length === 0 ? (
              <div className="px-[10px] py-[12px] text-center text-[12.5px] text-neutral-400">
                All techniques added.
              </div>
            ) : (
              available.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onAdd(a.id);
                    setOpen(false);
                  }}
                  className="block w-full rounded-[8px] px-[11px] py-[9px] text-left text-[13.5px] font-medium text-ink hover:bg-teal-tint"
                >
                  {a.name}
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** One selected technique: a teal chip (name + remove) above its pink note field. */
function TechniqueRow({
  name,
  note,
  onNote,
  onRemove,
}: {
  name: string;
  note: string;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[11px] border border-teal-tint-border bg-[#F3F8F7] p-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-badge bg-teal-tint px-[10px] py-[4px] text-[13px] font-semibold text-[#186155]">
          {name}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="shrink-0 rounded-full p-1 text-neutral-400 hover:text-pink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Add a note…"
        className={`mt-[9px] ${NOTE_FIELD}`}
      />
    </div>
  );
}

/** A technique strip: the title + Add, then a card per selected technique. */
function TechniqueStrip({
  title,
  activities,
  selected,
  onChange,
}: {
  title: string;
  activities: ActivityBankItem[];
  selected: LinkItTechnique[];
  onChange: (next: LinkItTechnique[]) => void;
}) {
  const nameById = new Map(activities.map((a) => [a.id, a.name]));

  const add = (id: string) => onChange([...selected, { technique: id, note: '' }]);
  const remove = (id: string) => onChange(selected.filter((s) => s.technique !== id));
  const setNote = (id: string, note: string) =>
    onChange(selected.map((s) => (s.technique === id ? { ...s, note } : s)));

  return (
    <Strip title={title}>
      <div className="flex flex-col gap-[10px]">
        {selected.map((s) => (
          <TechniqueRow
            key={s.technique}
            name={nameById.get(s.technique) ?? 'Technique'}
            note={s.note}
            onNote={(note) => setNote(s.technique, note)}
            onRemove={() => remove(s.technique)}
          />
        ))}
        <div>
          <AddTechnique activities={activities} selected={selected} onAdd={add} />
        </div>
      </div>
    </Strip>
  );
}

/**
 * Step 4 — "Link it together": three stacked strips. Recap is a single free-text
 * field; Check-for-understanding and Exit ticket each let the teacher add any
 * number of pre-approved techniques (from the real activity bank), each as a teal
 * chip with a pink note. Colour semantics: pink = teacher-editable, teal = the
 * technique selections/actions.
 */
export function LinkItStep({
  linkIt,
  cfuActivities,
  exitActivities,
  onChange,
}: {
  linkIt: LinkIt;
  cfuActivities: ActivityBankItem[];
  exitActivities: ActivityBankItem[];
  onChange: (next: LinkIt) => void;
}) {
  return (
    <div className="mt-[22px] flex flex-col gap-[14px]">
      <Strip title="Recap">
        <textarea
          rows={3}
          value={linkIt.recap}
          onChange={(e) => onChange({ ...linkIt, recap: e.target.value })}
          placeholder="Write the recap…"
          className={`resize-y ${NOTE_FIELD}`}
        />
      </Strip>

      <TechniqueStrip
        title="Check for understanding"
        activities={cfuActivities}
        selected={linkIt.checkForUnderstanding}
        onChange={(next) => onChange({ ...linkIt, checkForUnderstanding: next })}
      />

      <TechniqueStrip
        title="Exit ticket"
        activities={exitActivities}
        selected={linkIt.exitTicket}
        onChange={(next) => onChange({ ...linkIt, exitTicket: next })}
      />
    </div>
  );
}
