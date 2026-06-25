'use client';

import { useMemo, useState } from 'react';
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
import { cn } from '@/lib/cn';
import { CalendarLessonCard } from '@/components/weekly-overview/LessonCard';
import { useScopeChooser, type AddYearOption } from '@/components/weekly-overview/ScopeChooser';
import type { PlanCard } from '@/components/weekly-overview/cards';
import { WEEKDAYS, WEEKDAY_LABELS, todayISO, weekdayOf } from '@/lib/week';
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
}: {
  years: BoardYear[];
  ownerId: string | null;
}) {
  const { openAdd } = useScopeChooser();
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

  const today = weekdayOf(todayISO());
  const dragEnabled = ownerId === null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // The curriculum lessons already placed somewhere this week, per year — the pool
  // the "+ Add lesson" picker excludes.
  const placedByYear = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const band of years) m.set(band.year, new Set(band.plans.map((p) => p.lessonKey)));
    return m;
  }, [years]);

  /** Build the "+ Add lesson" year options for a column (unplaced lessons + next ordinal). */
  const addOptionsFor = (weekday: number): AddYearOption[] =>
    years.map((band) => {
      const placed = placedByYear.get(band.year) ?? new Set<string>();
      return {
        year: band.year,
        period: byDay[weekday].filter((p) => p.year === band.year).length + 1,
        lessons: band.lessons.filter((l) => !placed.has(l.lessonKey)),
      };
    });

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
          setError(res.error ?? 'Could not move the lesson.');
        }
      })
      .catch(() => {
        setByDay(prev);
        setError('Could not move the lesson.');
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
                isToday={key === today}
                cards={byDay[weekday]}
                ownerId={ownerId}
                dragEnabled={dragEnabled}
                onAddLesson={() => openAdd({ weekday, years: addOptionsFor(weekday) })}
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
 * Order a day's stack by year (a stable sort preserves the within-year order the
 * caller arranged) and renumber each year's `period` 1..N — the displayed ordinal.
 */
function normalizeDay(plans: BoardPlan[]): BoardPlan[] {
  const sorted = [...plans].sort((a, b) => a.year - b.year);
  const perYear = new Map<number, number>();
  for (const p of sorted) {
    const n = (perYear.get(p.year) ?? 0) + 1;
    perYear.set(p.year, n);
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
  isToday,
  cards,
  ownerId,
  dragEnabled,
  onAddLesson,
}: {
  weekday: number;
  isToday: boolean;
  cards: BoardPlan[];
  ownerId: string | null;
  dragEnabled: boolean;
  onAddLesson: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${weekday}` });
  const label = WEEKDAY_LABELS[WEEKDAYS[weekday - 1]];

  // The owner filter only hides cards (it never renumbers); `period` is already the
  // per-year ordinal from the normalised stack, so numbers stay stable.
  const visible = ownerId ? cards.filter((p) => p.owner?.id === ownerId) : cards;
  const items = visible.map((p) => p.id);

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-[12px] flex items-center gap-[8px] border-b border-border pb-[10px]">
        <span className="text-[13px] font-bold text-ink">{label}</span>
        {isToday ? (
          <span className="inline-flex items-center rounded-badge bg-teal px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em] text-white">
            Today
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
            <SortableCard key={plan.id} plan={plan} dragEnabled={dragEnabled} />
          ))}
        </SortableContext>

        <button
          type="button"
          onClick={onAddLesson}
          className="inline-flex items-center justify-center gap-[5px] rounded-[10px] border border-dashed border-border-strong px-[12px] py-[10px] text-[11.5px] font-semibold text-text-muted transition-colors hover:border-teal hover:text-teal"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add lesson
        </button>
      </div>
    </div>
  );
}

/**
 * One draggable card. Dragging is enabled only for cards the viewer may edit (and
 * only under "Everyone"); a shared centre/org card stays put but still sorts into
 * the column by its stored placement.
 */
function SortableCard({ plan, dragEnabled }: { plan: BoardPlan; dragEnabled: boolean }) {
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
        <CalendarLessonCard card={toPlanCard(plan)} />
      </div>
    </div>
  );
}
