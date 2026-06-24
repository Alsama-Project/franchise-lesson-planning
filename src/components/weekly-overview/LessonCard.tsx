'use client';

// The restored lesson card — verbatim from origin/main (commit aa46b49):
//   • CardShell chrome (white, 1px border, 12px radius, inline pending spinner)
//   • the Calendar variant: time line · class line · status badge + owner
//   • the Status variant:   time line · class line, owner on the right (no badge —
//     the kanban column conveys status)
//   • the "Not started" variant: faint line · class line + teal "Plan" chip
//
// The ONLY changes from the old card are the data bindings the new model forces —
// class line → "Year N" (never an A/B group label); time line → the period # — and
// the small scope chip added to planned cards. Nothing is restyled.

import { CardShell } from '@/components/weekly-overview/CardShell';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import { ScopeChip } from '@/components/weekly-overview/ScopeChip';
import { OwnerAvatar } from '@/components/weekly-overview/OwnerAvatar';
import { periodLabel, type EmptySlotCard, type PlanCard } from '@/components/weekly-overview/cards';
import { useScopeChooser } from '@/components/weekly-overview/ScopeChooser';

/**
 * Calendar-view planned card. In the day-column layout the card carries the
 * `Period #` subtitle (the period no longer reads from a column header), the
 * `Year N` title, the status pill, and the author-initials avatar.
 *
 * The scope chip (Class / Centre / All centres) is intentionally NOT shown here —
 * the day-column target drops it. It still distinguishes co-located plans of
 * different scopes in the Status view, where `StatusLessonCard` keeps it.
 */
export function CalendarLessonCard({ card }: { card: PlanCard }) {
  return (
    <CardShell planId={card.planId} canEdit={card.canEdit}>
      <div className="text-[11.5px] font-semibold text-text-faint">{periodLabel(card.period)}</div>
      <div className="mb-[9px] mt-[3px] text-[14px] font-semibold">Year {card.year}</div>
      <div className="flex items-center justify-between gap-2">
        <StatusChip status={card.status} />
        {card.owner ? <OwnerAvatar owner={card.owner} /> : null}
      </div>
    </CardShell>
  );
}

/** Status-view planned card — restored origin/main StatusCard. */
export function StatusLessonCard({ card }: { card: PlanCard }) {
  return (
    <CardShell planId={card.planId} canEdit={card.canEdit}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold text-text-faint">{periodLabel(card.period)}</div>
          <div className="mt-[3px] text-[14px] font-semibold">Year {card.year}</div>
          <div className="mt-[6px]">
            <ScopeChip scope={card.scope} />
          </div>
        </div>
        {card.owner ? <OwnerAvatar owner={card.owner} size={21} /> : null}
      </div>
    </CardShell>
  );
}

/**
 * The "Not started" card — restored origin/main NotStartedCard. No plan yet, so
 * it's a button: the whole card (and its teal "Plan" chip) opens the scope chooser
 * for this curriculum slot.
 */
export function NotStartedLessonCard({ card }: { card: EmptySlotCard }) {
  const { openChooser } = useScopeChooser();
  const open = () =>
    openChooser({ lessonKey: card.lessonKey, year: card.year, dailyOutcome: card.dailyOutcome });
  return (
    <button
      type="button"
      onClick={open}
      className="flex items-center justify-between gap-2 rounded-[12px] border border-dashed border-border-strong bg-transparent px-[13px] py-[11px] text-left transition-colors hover:bg-surface-subtle"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-text-faint">{periodLabel(card.period)}</div>
        <div className="mt-[2px] text-[14px] font-semibold">Year {card.year}</div>
      </div>
      <span className="inline-flex flex-shrink-0 items-center gap-[4px] rounded-badge border border-teal-tint-border bg-teal-tint px-[8px] py-[4px] text-[10.5px] font-bold text-teal">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1F7A6C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Plan
      </span>
    </button>
  );
}
