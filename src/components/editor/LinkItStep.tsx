'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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

/**
 * One labelled section inside the single Link-it card. The first section sits
 * flush at the top; the rest are separated from the previous section by a hairline
 * divider + spacing, so the three read as distinct parts of one coherent card.
 */
function Section({
  title,
  divider,
  children,
}: {
  title: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={divider ? 'mt-[16px] border-t border-border pt-[16px]' : ''}>
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
        {title}
      </div>
      <div className="mt-[11px]">{children}</div>
    </div>
  );
}

/**
 * Read-only panel showing the previous lesson's daily outcome, above the recap
 * field — so the teacher can see what was taught last lesson while writing the
 * recap. Reuses the cream curriculum-panel tokens (cream = curriculum/locked,
 * matching the DAILY OUTCOME panel on the Objective step).
 */
function PreviousOutcomePanel({ outcome }: { outcome: string }) {
  const t = useTranslations('wizard.curriculum');
  return (
    <div className="mb-[12px] rounded-[11px] border border-given-border bg-given px-[15px] py-[13px]">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-given-label">
        {t('yesterdayOutcome')}
      </div>
      <div dir="auto" className="mt-[6px] text-[15px] leading-[1.4] text-neutral-900">
        {outcome}
      </div>
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
  const t = useTranslations('wizard.linkIt');
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
        {t('add')}
      </button>
      {open ? (
        <>
          {/* Click-away backdrop. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute start-0 top-[calc(100%+6px)] z-20 max-h-[280px] w-[280px] overflow-auto rounded-[12px] border border-border bg-surface p-[6px] shadow-[0_8px_28px_rgba(42,36,34,0.16)]">
            {available.length === 0 ? (
              <div className="px-[10px] py-[12px] text-center text-[12.5px] text-neutral-400">
                {t('allAdded')}
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
                  dir="auto"
                  className="block w-full rounded-[8px] px-[11px] py-[9px] text-start text-[13.5px] font-medium text-ink hover:bg-teal-tint"
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
  const t = useTranslations('wizard.linkIt');
  return (
    <div className="rounded-[11px] border border-teal-tint-border bg-[#F3F8F7] p-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span dir="auto" className="inline-flex items-center rounded-badge bg-teal-tint px-[10px] py-[4px] text-[13px] font-semibold text-[#186155]">
          {name}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('remove', { name })}
          className="shrink-0 rounded-full p-1 text-neutral-400 hover:text-pink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <input
        dir="auto"
        value={note}
        onChange={(e) => onNote(e.target.value)}
        placeholder={t('notePlaceholder')}
        className={`mt-[9px] ${NOTE_FIELD}`}
      />
    </div>
  );
}

/** A technique group: a card per selected technique, then the "+ Add" control. */
function TechniqueGroup({
  activities,
  selected,
  onChange,
}: {
  activities: ActivityBankItem[];
  selected: LinkItTechnique[];
  onChange: (next: LinkItTechnique[]) => void;
}) {
  const t = useTranslations('wizard.linkIt');
  const nameById = new Map(activities.map((a) => [a.id, a.name]));

  const add = (id: string) => onChange([...selected, { technique: id, note: '' }]);
  const remove = (id: string) => onChange(selected.filter((s) => s.technique !== id));
  const setNote = (id: string, note: string) =>
    onChange(selected.map((s) => (s.technique === id ? { ...s, note } : s)));

  return (
    <div className="flex flex-col gap-[10px]">
      {selected.map((s) => (
        <TechniqueRow
          key={s.technique}
          name={nameById.get(s.technique) ?? t('techniqueFallback')}
          note={s.note}
          onNote={(note) => setNote(s.technique, note)}
          onRemove={() => remove(s.technique)}
        />
      ))}
      <div>
        <AddTechnique activities={activities} selected={selected} onAdd={add} />
      </div>
    </div>
  );
}

/**
 * Step 4 — "Link it together": ONE card holding three labelled sections. Recap is
 * a single free-text field (with the previous lesson's outcome shown read-only
 * above it); Check-for-understanding and Exit ticket each let the teacher add any
 * number of pre-approved techniques (from the real activity bank), each as a teal
 * chip with a pink note. Colour semantics: cream = curriculum/locked (the previous
 * outcome), pink = teacher-editable, teal = the technique selections/actions.
 */
export function LinkItStep({
  linkIt,
  cfuActivities,
  exitActivities,
  previousDailyLO,
  onChange,
  locked = false,
}: {
  linkIt: LinkIt;
  cfuActivities: ActivityBankItem[];
  exitActivities: ActivityBankItem[];
  /** Previous lesson's daily outcome; empty when there is no preceding lesson. */
  previousDailyLO?: string;
  onChange: (next: LinkIt) => void;
  /** When true the plan is submitted/approved: the recap field and all technique
   *  controls are disabled via a single `disabled` fieldset. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard.linkIt');
  return (
    <>
      <div className="mt-[22px] text-[21px] font-bold">{t('heading')}</div>
      <fieldset disabled={locked} className="mt-[14px] min-w-0 rounded-[14px] border border-border bg-surface px-[18px] py-[16px] disabled:opacity-75">
        <Section title={t('recap')}>
        {previousDailyLO ? <PreviousOutcomePanel outcome={previousDailyLO} /> : null}
        <textarea
          dir="auto"
          rows={3}
          value={linkIt.recap}
          onChange={(e) => onChange({ ...linkIt, recap: e.target.value })}
          placeholder={t('recapPlaceholder')}
          className={`resize-y ${NOTE_FIELD}`}
        />
      </Section>

      <Section title={t('checkForUnderstanding')} divider>
        <TechniqueGroup
          activities={cfuActivities}
          selected={linkIt.checkForUnderstanding}
          onChange={(next) => onChange({ ...linkIt, checkForUnderstanding: next })}
        />
      </Section>

      <Section title={t('exitTicket')} divider>
        <TechniqueGroup
          activities={exitActivities}
          selected={linkIt.exitTicket}
          onChange={(next) => onChange({ ...linkIt, exitTicket: next })}
        />
      </Section>
      </fieldset>
    </>
  );
}
