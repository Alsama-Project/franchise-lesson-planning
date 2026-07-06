// Shared derivation for the board's two views. A board is years × Mon–Fri columns;
// each year band carries the plans placed this week and the curriculum lessons it
// can still add. The Status (kanban) view wants a flat list of plan cards and a
// flat list of un-planned ("Not started") lessons; the Calendar (day-column) view
// reads the year/plan structure directly and derives a card's "Period N" from its
// live position in the day's stack.

import type { PlanScope, PlanStatus } from '@/types/lesson';
import type { BoardYear, PlanOwner } from '@/types/weekly-overview';

/** One plan as a board card (Calendar cell + Status column). */
export interface PlanCard {
  /** Stable key — the plan id. */
  key: string;
  planId: string;
  year: number;
  /** The card's subject display name — the attribution label (board can span subjects). */
  subjectName: string;
  /** The centre name to show under the subject, or null to omit (single-centre / org). */
  centreName: string | null;
  /** The Mon–Fri column (1..5) the plan sits in — the card's "day" in "Mon · P2". */
  weekday: number;
  /** The displayed day-ordinal — the card's 1-based position in its day's stack. */
  period: number;
  /**
   * The lesson-topic line (the card's hero text) — the daily learning outcome,
   * already stem-cleaned. May be empty; the card degrades to a "Lesson N" fallback.
   */
  topic: string;
  status: PlanStatus;
  scope: PlanScope;
  owner: PlanOwner | null;
  /** Whether the viewer may edit (drives editable-wizard vs read-only routing). */
  canEdit: boolean;
  /** Whether the viewer may delete this plan — drives the card's trash affordance. */
  canDelete: boolean;
  reviewNote: string | null;
}

/** A curriculum lesson with no plan of any scope — a "Not started" card. */
export interface EmptySlotCard {
  /** Stable key — the lesson key. */
  key: string;
  lessonKey: string;
  year: number;
  /** The subject this lesson belongs to — its display name and `code` for creation. */
  subjectName: string;
  subjectCode: string;
  /** The centre a new plan is created against, and the label to show (null to omit). */
  centreId: string;
  centreName: string | null;
  /** Curriculum period — the card label and the default day to place it on. */
  period: number;
  /** The Mon–Fri column a fresh plan for this lesson defaults to (1..5). */
  weekday: number;
  dailyOutcome: string;
  focusArea: string;
}

/** Clamp a curriculum period to a Mon–Fri (1..5) column, defaulting to Monday. */
function defaultWeekday(period: number): number {
  if (!Number.isFinite(period)) return 1;
  return Math.min(5, Math.max(1, Math.trunc(period)));
}

/**
 * Every plan card across the board, optionally filtered to one owner. Each card's
 * `period` is its 1-based position within its (year, weekday) stack — derived from
 * the load order so the Status view numbers match the Calendar. The ordinal counts
 * every plan in the day (filtered or not) so numbers stay stable under the owner
 * filter, which only hides cards — it never renumbers a stack.
 */
export function planCardsForYears(years: BoardYear[], ownerId: string | null): PlanCard[] {
  const out: PlanCard[] = [];
  for (const band of years) {
    // band.plans is pre-sorted by (weekday, period); count per weekday as we go.
    const ordinal = new Map<number, number>();
    for (const p of band.plans) {
      const n = (ordinal.get(p.weekday) ?? 0) + 1;
      ordinal.set(p.weekday, n);
      if (ownerId && p.owner?.id !== ownerId) continue;
      out.push({
        key: p.id,
        planId: p.id,
        year: p.year,
        subjectName: p.subjectName,
        centreName: p.centreName,
        weekday: p.weekday,
        period: n,
        topic: p.dailyOutcome,
        status: p.status,
        scope: p.scope,
        owner: p.owner,
        canEdit: p.canEdit,
        canDelete: p.canDelete,
        reviewNote: p.reviewNote,
      });
    }
  }
  return out;
}

/**
 * Curriculum lessons with no plan of any scope (always unfiltered) → "Not started"
 * cards. `showCentre` (the board's `spansMultipleCentres`) decides whether a card
 * carries its centre label — matching how the data layer attributes planned cards.
 */
export function emptySlotCards(years: BoardYear[], showCentre: boolean): EmptySlotCard[] {
  const out: EmptySlotCard[] = [];
  for (const band of years) {
    // "Not started" cards are a create affordance, so only offer them for bands the
    // viewer may author in (a class they teach). A coordinator reviewing a subject
    // they don't teach gets no "Not started" cards — review only.
    if (!band.canAuthor) continue;
    // De-dupe curriculum lessons already planned in THIS band by any scope.
    const planned = new Set(band.plans.map((p) => p.lessonKey));
    for (const lesson of band.lessons) {
      if (planned.has(lesson.lessonKey)) continue;
      out.push({
        key: `${band.key}:${lesson.lessonKey}`,
        lessonKey: lesson.lessonKey,
        year: band.year,
        subjectName: band.subjectName,
        subjectCode: band.subjectCode,
        centreId: band.centreId,
        centreName: showCentre ? band.centreName : null,
        period: lesson.period,
        weekday: defaultWeekday(lesson.period),
        dailyOutcome: lesson.dailyOutcome,
        focusArea: lesson.focusArea,
      });
    }
  }
  return out;
}
