'use client';

// The restored lesson card — verbatim from the pre-reinvention board (commit
// 5b60faf, "Restore the previous lesson card as the per-slot board unit"):
//   • CardShell chrome (white, 1px border, 12px radius, inline pending spinner)
//   • the Calendar variant: time line · class line · status badge + scope chip + owner
//   • the Status variant:   time line · class line · scope chip, owner on the right
//   • the "Not started" variant: faint line · class line + teal "Plan" chip
//
// The two text lines, top to bottom: the subtitle line carries the board SUBJECT
// (e.g. "English") in the muted/subtitle treatment, and the title line carries
// "Year N" (never an A/B group label) in bold. The period is conveyed by the
// day column + stack position, not repeated on the card. The small scope chip
// stays on planned cards. Nothing else is restyled.

import { CardShell } from '@/components/weekly-overview/CardShell';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import { OwnerAvatar } from '@/components/weekly-overview/OwnerAvatar';
import type { EmptySlotCard, PlanCard } from '@/components/weekly-overview/cards';
import { useScopeChooser } from '@/components/weekly-overview/ScopeChooser';

/** Calendar-view planned card — restored CalendarCard (status badge + scope chip). */
export function CalendarLessonCard({ card, subjectName }: { card: PlanCard; subjectName: string }) {
  return (
    <CardShell planId={card.planId} canEdit={card.canEdit}>
      <div className="text-[11.5px] font-semibold text-text-faint">{subjectName}</div>
      <div className="mb-[9px] mt-[3px] text-[14px] font-semibold">Year {card.year}</div>
      <div className="flex items-center justify-between gap-2">
        <StatusChip status={card.status} />
        {card.owner ? <OwnerAvatar owner={card.owner} /> : null}
      </div>
    </CardShell>
  );
}

/** Status-view planned card — restored StatusCard. */
export function StatusLessonCard({ card, subjectName }: { card: PlanCard; subjectName: string }) {
  return (
    <CardShell planId={card.planId} canEdit={card.canEdit}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold text-text-faint">{subjectName}</div>
          <div className="mt-[3px] text-[14px] font-semibold">Year {card.year}</div>
        </div>
        {card.owner ? <OwnerAvatar owner={card.owner} size={21} /> : null}
      </div>
    </CardShell>
  );
}

/**
 * The "Not started" card — restored NotStartedCard. No plan yet, so it's a button:
 * the whole card (and its teal "Plan" chip) opens the scope chooser for this
 * curriculum lesson, defaulting it onto its natural day (the curriculum period).
 */
export function NotStartedLessonCard({ card, subjectName }: { card: EmptySlotCard; subjectName: string }) {
  const { openChooser } = useScopeChooser();
  const open = () =>
    openChooser({
      lessonKey: card.lessonKey,
      year: card.year,
      dailyOutcome: card.dailyOutcome,
      weekday: card.weekday,
      period: card.period,
    });
  return (
    <button
      type="button"
      onClick={open}
      className="flex items-center justify-between gap-2 rounded-[12px] border border-border bg-surface-subtle px-[13px] py-[11px] text-left transition-colors hover:bg-surface-cream"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-text-faint">{subjectName}</div>
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
