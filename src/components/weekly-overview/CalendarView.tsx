'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { CalendarLessonCard } from '@/components/weekly-overview/LessonCard';
import { AddLessonMenu, type AddYearChoice } from '@/components/weekly-overview/AddLessonMenu';
import type { PlanCard } from '@/components/weekly-overview/cards';
import { WEEKDAYS, addDays, todayISO } from '@/lib/week';
import { formatDate, formatNumber } from '@/lib/format';
import { reorderPlans, type PlanPlacement } from '@/lib/actions/lesson-plan';
import type { BoardPlan, BoardYear } from '@/types/weekly-overview';

// The five Mon–Fri columns as 1..5 weekday numbers, paired with their stable key.
const COLUMNS = WEEKDAYS.map((key, i) => ({ key, weekday: i + 1 }));

/**
 * Calendar view — the day-column weekly board. Five weekday columns (Mon–Fri) run
 * across the top; under each, the day's lesson cards stack vertically. There are
 * NO year-group separations: every taught year's lessons sit in the single shared
 * day grid (each card shows its own "Year N · Period N", so the year is never
 * lost). A card's "Period N" is its 1-based position within its year's stack on
 * that day (top = Period 1), re-derived live so it stays correct as cards move.
 *
 * Teachers add a lesson from a column's "+ Add lesson" picker (choose a year group,
 * then one of that year's curriculum lessons for the week). Cards can be dragged to
 * reorder within a day or move to another day — only your own cards are draggable
 * (RLS blocks writing others'); shared cards sort into the column by their stored
 * placement. The owner filter and drag are mutually exclusive: while a specific
 * person is filtered in, the stack is a read view and dragging is disabled.
 */
export function CalendarView({
  years,
  ownerId,
  mondayDate,
  readOnly = false,
  spansMultipleSubjects = false,
  spansMultipleCentres = false,
}: {
  years: BoardYear[];
  ownerId: string | null;
  /** The shown week's real Monday (`YYYY-MM-DD`) from `term_week`, or null when no row. */
  mondayDate: string | null;
  /** Coordinator review mode: no drag, no "+ Add lesson", cards open the review view. */
  readOnly?: boolean;
  /** Board spans >1 subject — "+ Add lesson" labels each choice with its subject. */
  spansMultipleSubjects?: boolean;
  /** Board spans >1 centre — "+ Add lesson" choices carry their centre label. */
  spansMultipleCentres?: boolean;
}) {
  const t = useTranslations('board');
  const [byDay, setByDay] = useState<ByDay>(() => buildByDay(years));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync to server truth whenever the loaded plans change (navigation / a
  // revalidate after create or reorder hands back a fresh array). Reset during
  // render — not in an effect — so optimistic state never lingers a frame.
  const [loadedYears, setLoadedYears] = useState(years);
  if (loadedYears !== years) {
    setLoadedYears(years);
    setByDay(buildByDay(years));
  }

  // Coordinators review, they don't arrange the board — drag is off entirely.
  const dragEnabled = ownerId === null && !readOnly;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /**
   * The lightweight year-group dropdown's choices for a column. The column IS a
   * curriculum period (Mon = Period 1 … Fri = Period 5), so each year resolves to
   * the single curriculum lesson for (year, this period) in the current month/week.
   * A year with no such lesson is offered disabled (graceful empty state). The
   * day-ordinal is the next slot in that year's stack on this column.
   */
  const addChoicesFor = (weekday: number): AddYearChoice[] =>
    years.map((band) => ({
      bandKey: band.key,
      year: band.year,
      subjectName: band.subjectName,
      centreId: band.centreId,
      centreName: spansMultipleCentres ? band.centreName : null,
      lessonKey: band.lessons.find((l) => l.period === weekday)?.lessonKey ?? null,
      period: byDay[weekday].filter((p) => p.groupKey === band.key).length + 1,
    }));

  const activePlan = activeId
    ? [byDay[1], byDay[2], byDay[3], byDay[4], byDay[5]].flat().find((p) => p.id === activeId) ?? null
    : null;

  const onDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeKey = active.id as string;
    const overKey = over.id as string;

    const sourceDay = findWeekday(byDay, activeKey);
    if (sourceDay == null) return;

    let targetDay: number;
    let overIndex: number;
    if (overKey.startsWith('day-')) {
      targetDay = Number(overKey.slice(4));
      overIndex = byDay[targetDay].length;
    } else {
      const d = findWeekday(byDay, overKey);
      if (d == null) return;
      targetDay = d;
      overIndex = byDay[targetDay].findIndex((p) => p.id === overKey);
    }

    const prev = byDay;
    const next = cloneByDay(prev);

    if (sourceDay === targetDay) {
      const arr = next[sourceDay];
      const oldIndex = arr.findIndex((p) => p.id === activeKey);
      const newIndex = overKey.startsWith('day-') ? arr.length - 1 : overIndex;
      if (oldIndex === newIndex || newIndex < 0) return; // dropped in place
      next[sourceDay] = arrayMove(arr, oldIndex, newIndex);
    } else {
      const fromArr = next[sourceDay];
      const fromIdx = fromArr.findIndex((p) => p.id === activeKey);
      const [moved] = fromArr.splice(fromIdx, 1);
      moved.weekday = targetDay;
      const insertAt = overKey.startsWith('day-') ? next[targetDay].length : Math.max(0, overIndex);
      next[targetDay].splice(insertAt, 0, moved);
    }

    // Normalise the affected columns (group by year, renumber each year's stack
    // 1..N) and collect the writes — only OWN cards (RLS blocks the rest; shared
    // cards keep their stored placement).
    const affected = sourceDay === targetDay ? [sourceDay] : [sourceDay, targetDay];
    const updates: PlanPlacement[] = [];
    for (const day of affected) {
      next[day] = normalizeDay(next[day]);
      for (const p of next[day]) {
        if (p.canEdit) updates.push({ id: p.id, weekday: day, period: p.period });
      }
    }

    setError(null);
    setByDay(next);
    reorderPlans(updates)
      .then((res) => {
        if (!res.ok) {
          setByDay(prev);
          setError(res.error ?? t('statusView.moveError'));
        }
      })
      .catch(() => {
        setByDay(prev);
        setError(t('statusView.moveError'));
      });
  };

  return (
    <section>
      {error ? (
        <div className="mb-[12px] rounded-[10px] border border-status-review-bg bg-status-review-bg px-[12px] py-[8px] text-[12.5px] text-status-review">
          {error}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        {/* One DndContext for the whole board; under the owner filter every card is
            `disabled` (see SortableCard), so no drag can start until "Everyone" is
            back. */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="grid min-w-[900px] grid-cols-5 items-start gap-[14px]">
            {COLUMNS.map(({ key, weekday }) => (
              <DayColumn
                key={key}
                weekday={weekday}
                mondayDate={mondayDate}
                cards={byDay[weekday]}
                ownerId={ownerId}
                dragEnabled={dragEnabled}
                readOnly={readOnly}
                addChoices={addChoicesFor(weekday)}
                spansMultipleSubjects={spansMultipleSubjects}
              />
            ))}
          </div>
          <DragOverlay>
            {activePlan ? <CalendarLessonCard card={toPlanCard(activePlan)} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  );
}

type ByDay = Record<number, BoardPlan[]>;

/** Clamp a (possibly legacy/derived) weekday to a Mon–Fri 1..5 column. */
function clampWeekday(weekday: number): number {
  return Math.min(5, Math.max(1, Math.trunc(weekday)));
}

/**
 * Group every year's plans into one set of Mon–Fri columns (no year split), then
 * normalise each day. Plans are cloned so optimistic edits never mutate the loaded
 * prop objects.
 */
function buildByDay(years: BoardYear[]): ByDay {
  const byDay: ByDay = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const band of years) {
    for (const p of band.plans) byDay[clampWeekday(p.weekday)].push({ ...p });
  }
  for (const w of [1, 2, 3, 4, 5]) byDay[w] = normalizeDay(byDay[w]);
  return byDay;
}

/**
 * Order a day's stack by band — subject, then centre, then year (a stable sort
 * preserves the within-band order the caller arranged) — and renumber each band's
 * `period` 1..N (the displayed ordinal). Grouping by band (not bare year) keeps a
 * user-wide board's numbering correct when a day holds several subjects' cards.
 */
function normalizeDay(plans: BoardPlan[]): BoardPlan[] {
  const sorted = [...plans].sort(
    (a, b) =>
      a.subjectName.localeCompare(b.subjectName) ||
      (a.centreName ?? '').localeCompare(b.centreName ?? '') ||
      a.year - b.year,
  );
  const perBand = new Map<string, number>();
  for (const p of sorted) {
    const n = (perBand.get(p.groupKey) ?? 0) + 1;
    perBand.set(p.groupKey, n);
    p.period = n;
  }
  return sorted;
}

/** A shallow clone so optimistic edits never mutate the previous (revert) state. */
function cloneByDay(byDay: ByDay): ByDay {
  return {
    1: byDay[1].map((p) => ({ ...p })),
    2: byDay[2].map((p) => ({ ...p })),
    3: byDay[3].map((p) => ({ ...p })),
    4: byDay[4].map((p) => ({ ...p })),
    5: byDay[5].map((p) => ({ ...p })),
  };
}

function findWeekday(byDay: ByDay, id: string): number | null {
  for (const w of [1, 2, 3, 4, 5]) {
    if (byDay[w].some((p) => p.id === id)) return w;
  }
  return null;
}

function toPlanCard(plan: BoardPlan): PlanCard {
  return {
    key: plan.id,
    planId: plan.id,
    year: plan.year,
    subjectName: plan.subjectName,
    centreName: plan.centreName,
    period: plan.period,
    status: plan.status,
    scope: plan.scope,
    owner: plan.owner,
    canEdit: plan.canEdit,
    reviewNote: plan.reviewNote,
  };
}

/** A weekday column: header, the day's card stack (all years), and "+ Add lesson". */
function DayColumn({
  weekday,
  mondayDate,
  cards,
  ownerId,
  dragEnabled,
  readOnly,
  addChoices,
  spansMultipleSubjects,
}: {
  weekday: number;
  mondayDate: string | null;
  cards: BoardPlan[];
  ownerId: string | null;
  dragEnabled: boolean;
  readOnly: boolean;
  /** Resolved band choices for this column's "+ Add lesson" dropdown. */
  addChoices: AddYearChoice[];
  /** Board spans >1 subject — the add menu labels each choice with its subject. */
  spansMultipleSubjects: boolean;
}) {
  const t = useTranslations('board');
  const locale = useLocale();
  const { setNodeRef, isOver } = useDroppable({ id: `day-${weekday}` });

  // §4 — the column's real date is the week's Monday + its weekday offset (Mon+0
  // … Fri+4), but ONLY when `term_week` gave us a Monday. With no row the header is
  // just "Period {p}" (no fabricated date), and "Today" can't be proven either.
  const colDate = mondayDate ? addDays(mondayDate, weekday - 1) : null;
  const isToday = colDate !== null && colDate === todayISO();
  const period = formatNumber(weekday, locale);
  // No year in the column header — `year: undefined` overrides formatDate's default
  // so it reads "Mon, Dec 15" rather than "Mon, Dec 15, 2025". The date rides on its
  // OWN line above "Period N" in the picker's thin secondary weight (not inline/bold).
  const dateLabel = colDate
    ? formatDate(colDate, locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: undefined,
      })
    : null;
  const periodLabel = t('column.period', { n: period });

  // The owner filter only hides cards (it never renumbers); `period` is already the
  // per-year ordinal from the normalised stack, so numbers stay stable.
  const visible = ownerId ? cards.filter((p) => p.owner?.id === ownerId) : cards;
  const items = visible.map((p) => p.id);

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-[12px] flex items-center gap-[8px] border-b border-border pb-[10px]">
        <span className="flex min-w-0 flex-col leading-tight">
          {dateLabel ? (
            <span className="text-[11px] font-normal text-neutral-500">{dateLabel}</span>
          ) : null}
          <span className="text-[13px] font-bold text-ink">{periodLabel}</span>
        </span>
        {isToday ? (
          <span className="inline-flex items-center rounded-badge bg-teal px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em] text-white">
            {t('column.today')}
          </span>
        ) : null}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[60px] flex-col gap-[11px] rounded-[10px] transition-colors',
          isOver && 'bg-surface-subtle ring-2 ring-inset ring-border',
        )}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {visible.map((plan) => (
            <SortableCard
              key={plan.id}
              plan={plan}
              dragEnabled={dragEnabled}
              readOnly={readOnly}
            />
          ))}
        </SortableContext>

        {/* Coordinators review existing plans; they don't author, so no add affordance. */}
        {readOnly ? null : (
          <AddLessonMenu
            weekday={weekday}
            choices={addChoices}
            spansMultipleSubjects={spansMultipleSubjects}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One draggable card. Dragging is enabled only for cards the viewer may edit (and
 * only under "Everyone"); a shared centre/org card stays put but still sorts into
 * the column by its stored placement.
 */
function SortableCard({
  plan,
  dragEnabled,
  readOnly,
}: {
  plan: BoardPlan;
  dragEnabled: boolean;
  readOnly: boolean;
}) {
  const disabled = !dragEnabled || !plan.canEdit;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: plan.id,
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} className={disabled ? undefined : 'cursor-grab'}>
        <CalendarLessonCard card={toPlanCard(plan)} readOnly={readOnly} />
      </div>
    </div>
  );
}
