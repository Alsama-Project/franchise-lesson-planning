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
  /** The displayed day-ordinal — the card's 1-based position in its day's stack. */
  period: number;
  status: PlanStatus;
  scope: PlanScope;
  owner: PlanOwner | null;
  /** Whether the viewer may edit (drives editable-wizard vs read-only routing). */
  canEdit: boolean;
  reviewNote: string | null;
}

/** A curriculum lesson with no plan of any scope — a "Not started" card. */
export interface EmptySlotCard {
  /** Stable key — the lesson key. */
  key: string;
  lessonKey: string;
  year: number;
  /** Curriculum period — the card label and the default day to place it on. */
  period: number;
  /** The Mon–Fri column a fresh plan for this lesson defaults to (1..5). */
  weekday: number;
  dailyOutcome: string;
  focusArea: string;
}

/** The "time" line shown on a card — the day-ordinal position. */
export function periodLabel(period: number): string {
  return `Period ${period}`;
}

/** The card's title line — "{Subject}, Year N" (e.g. "English, Year 2"), or "Year N" when no subject. */
export function cardTitle(subjectName: string, year: number): string {
  return subjectName ? `${subjectName}, Year ${year}` : `Year ${year}`;
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
        period: n,
        status: p.status,
        scope: p.scope,
        owner: p.owner,
        canEdit: p.canEdit,
        reviewNote: p.reviewNote,
      });
    }
  }
  return out;
}

/** Curriculum lessons with no plan of any scope (always unfiltered) → "Not started" cards. */
export function emptySlotCards(years: BoardYear[]): EmptySlotCard[] {
  const out: EmptySlotCard[] = [];
  for (const band of years) {
    const planned = new Set(band.plans.map((p) => p.lessonKey));
    for (const lesson of band.lessons) {
      if (planned.has(lesson.lessonKey)) continue;
      out.push({
        key: lesson.lessonKey,
        lessonKey: lesson.lessonKey,
        year: band.year,
        period: lesson.period,
        weekday: defaultWeekday(lesson.period),
        dailyOutcome: lesson.dailyOutcome,
        focusArea: lesson.focusArea,
      });
    }
  }
  return out;
}
