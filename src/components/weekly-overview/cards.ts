// Shared derivation: flatten the class × weekday grid into lesson "cards", the
// unit both the Calendar and Status views render. A card is one (class, weekday)
// slot — either a real plan or a derived "Not started" placeholder.

import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from '@/lib/week';
import type { ClassWeek, SlotStatus } from '@/types/weekly-overview';

export interface LessonCard {
  /** Stable key, `${classId}:${weekday}`. */
  key: string;
  /** Class label, e.g. "Year 1 · A". */
  classLabel: string;
  /** Weekday the card sits on. */
  weekday: Weekday;
  /** Short weekday label, e.g. "Mon". */
  dayLabel: string;
  /** Day-of-month number for the card's date, e.g. 15. */
  dateNum: number;
  /** Lesson period (1–5), or null when there's no plan. */
  period: number | null;
  /** Slot status (the four stored ones, or derived `not_started`). */
  status: SlotStatus;
  /** Plan id when one exists, else null (a non-interactive "Not started" card). */
  planId: string | null;
  /** Coordinator note for `needs_review`, else null. */
  reviewNote: string | null;
}

/** Day-of-month (1–31) from a `YYYY-MM-DD` string, without timezone drift. */
function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Order cards within a day: by period (earliest first), unplanned last, then class. */
export function byTimeThenClass(a: LessonCard, b: LessonCard): number {
  const pa = a.period ?? Number.POSITIVE_INFINITY;
  const pb = b.period ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  return a.classLabel.localeCompare(b.classLabel);
}

/** The "time" line shown on a card — the period for now (no clock time yet). */
export function timeLabel(period: number | null): string {
  return period == null ? '—' : `Period ${period}`;
}

/** One card per (class, weekday) for the given weekday, ordered for display. */
export function cardsForWeekday(classes: ClassWeek[], weekday: Weekday): LessonCard[] {
  return classes
    .map((c) => toCard(c, weekday))
    .filter((card): card is LessonCard => card != null)
    .sort(byTimeThenClass);
}

/** Every (class, weekday) card across the week, flat and unordered. */
export function allCards(classes: ClassWeek[]): LessonCard[] {
  const cards: LessonCard[] = [];
  for (const c of classes) {
    for (const weekday of WEEKDAYS) {
      const card = toCard(c, weekday);
      if (card) cards.push(card);
    }
  }
  return cards;
}

function toCard(c: ClassWeek, weekday: Weekday): LessonCard | null {
  const slot = c.slots.find((s) => s.weekday === weekday);
  if (!slot) return null;
  return {
    key: `${c.classId}:${weekday}`,
    classLabel: c.label,
    weekday,
    dayLabel: WEEKDAY_LABELS[weekday],
    dateNum: dayOfMonth(slot.date),
    period: slot.plan?.period ?? null,
    status: slot.status,
    planId: slot.plan?.id ?? null,
    reviewNote: slot.plan?.reviewNote ?? null,
  };
}
