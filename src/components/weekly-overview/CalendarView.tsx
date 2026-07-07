'use client';

import type { CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { GridLessonCard } from '@/components/weekly-overview/GridLessonCard';
import { GhostLessonCard } from '@/components/weekly-overview/GhostLessonCard';
import { buildPeriodGrid, PERIODS, type GridCell } from '@/components/weekly-overview/cards';
import { addDays, todayInBeirut } from '@/lib/week';
import { formatDate, formatNumber } from '@/lib/format';
import type { BoardYear } from '@/types/weekly-overview';

/**
 * Calendar view — an aligned **Year × Period** matrix. Columns are the five
 * curriculum periods (P1 = Mon … P5 = Fri), each carrying the real date / "Period N"
 * / TODAY header; rows are the visible year-bands (ascending). Every (year, period)
 * cell holds that year's curriculum lesson for the period: a started lesson renders
 * as a solid status-coloured plan card, an un-started one as a dotted ghost, and a
 * period with no curriculum cell is left blank.
 *
 * A card's position comes ONLY from (year, period) — the period is the plan's own
 * curriculum period, not its drag-mutable `weekday` — so every column shows the same
 * year order and a planned card always sits in its own year-row (no state-based
 * flip). Placement is fixed by the curriculum, so there is no drag-reorder here.
 *
 * The body is one true CSS grid: each card is pinned to its cell by `grid-column`
 * (period) and `grid-row` (year-band index), so the five period tracks stay aligned
 * under the headers even when a row is sparse. Only year-bands that hold a card are
 * emitted (see `buildPeriodGrid`); empty cells inside a shown row are simply left
 * unrendered — the column track still holds their place, blank and border-less. For
 * teachers every band has ghosts so nothing drops; for a ghost-less coordinator board
 * the empty year-rows fall away instead of stacking into an uneven, floating grid.
 */
export function CalendarView({
  years,
  ownerId,
  mondayDate,
  readOnly = false,
  spansMultipleCentres = false,
}: {
  years: BoardYear[];
  ownerId: string | null;
  /** The shown week's real Monday (`YYYY-MM-DD`) from `term_week`, or null when no row. */
  mondayDate: string | null;
  /** Coordinator review mode: no ghost cards; cards open the read-only review view. */
  readOnly?: boolean;
  /** Board spans >1 centre — cards carry their centre label. */
  spansMultipleCentres?: boolean;
}) {
  const rows = buildPeriodGrid(years, spansMultipleCentres, { readOnly, ownerId });

  return (
    <section className="overflow-x-auto">
      {/* One grid: row 1 is the five period headers (pinned there), then one row per
          emitted year-band. Cards are placed explicitly by (period, band) so the five
          column tracks stay aligned and empty cells hold their place without a spacer. */}
      <div className="grid min-w-[900px] grid-cols-5 items-stretch gap-x-[20px] gap-y-[10px]">
        {PERIODS.map((period) => (
          <PeriodHeader
            key={`h-${period}`}
            weekday={period}
            mondayDate={mondayDate}
            style={{ gridColumn: period, gridRow: 1 }}
          />
        ))}
        {rows.map((row, rowIndex) =>
          row.cells.map((cell, i) => (
            <GridCellView
              key={`${row.key}:${PERIODS[i]}`}
              cell={cell}
              readOnly={readOnly}
              period={PERIODS[i]}
              rowIndex={rowIndex}
            />
          )),
        )}
      </div>
    </section>
  );
}

/**
 * One (year, period) cell, pinned by `grid-column` (period) and `grid-row`
 * (year-band index + 2, since row 1 is the header). A plan or ghost renders its
 * card; an empty cell renders nothing — the grid template still reserves the
 * column track, so it stays blank and border-less without collapsing the row.
 */
function GridCellView({
  cell,
  readOnly,
  period,
  rowIndex,
}: {
  cell: GridCell;
  readOnly: boolean;
  period: number;
  rowIndex: number;
}) {
  if (cell.kind === 'empty') return null;
  // Nest a stretch-grid so the card fills the cell in both axes (as it did when it
  // was itself the grid item), while the wrapper carries the explicit placement.
  const style: CSSProperties = { gridColumn: period, gridRow: rowIndex + 2 };
  return (
    <div style={style} className="grid min-w-0">
      {cell.kind === 'plan' ? (
        <GridLessonCard card={cell.card} readOnly={readOnly} />
      ) : (
        <GhostLessonCard card={cell.card} />
      )}
    </div>
  );
}

/** A period column header: the real date, "Period N", and the TODAY marker. */
function PeriodHeader({
  weekday,
  mondayDate,
  style,
}: {
  weekday: number;
  mondayDate: string | null;
  style?: CSSProperties;
}) {
  const t = useTranslations('board');
  const locale = useLocale();

  // The column's real date is the week's Monday + its period offset (P1+0 … P5+4),
  // but ONLY when `term_week` gave us a Monday. With no row the header is just
  // "Period {p}" (no fabricated date), and "Today" can't be proven either.
  const colDate = mondayDate ? addDays(mondayDate, weekday - 1) : null;
  const isToday = colDate !== null && colDate === todayInBeirut();
  const dateLabel = colDate
    ? formatDate(colDate, locale, { weekday: 'short', month: 'short', day: 'numeric', year: undefined })
    : null;
  const periodLabel = t('column.period', { n: formatNumber(weekday, locale) });

  return (
    <div
      style={style}
      className={cn(
        // Negative bottom margin pulls the first card row up under the divider so
        // the header→card gap is tighter than the row-to-row gap (single grid).
        'mb-[-5px] pb-[9px]',
        isToday ? 'border-b-2 border-teal' : 'border-b border-border',
      )}
    >
      {dateLabel || isToday ? (
        <div className="flex items-center gap-[9px]">
          {dateLabel ? (
            <span
              className={cn(
                'text-[13px]',
                isToday ? 'font-semibold text-teal' : 'font-medium text-text-faint',
              )}
            >
              {dateLabel}
            </span>
          ) : null}
          {isToday ? (
            <span className="inline-flex items-center rounded-[6px] bg-teal px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] text-white">
              {t('column.today')}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={cn('mt-[2px] text-[18px] font-bold', isToday ? 'text-teal' : 'text-ink')}>
        {periodLabel}
      </div>
    </div>
  );
}
