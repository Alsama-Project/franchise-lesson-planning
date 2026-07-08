'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { GridLessonCard } from '@/components/weekly-overview/GridLessonCard';
import { GhostLessonCard } from '@/components/weekly-overview/GhostLessonCard';
import { buildPeriodColumns, type PeriodColumn } from '@/components/weekly-overview/cards';
import { addDays, todayInBeirut } from '@/lib/week';
import { formatDate, formatNumber } from '@/lib/format';
import type { BoardYear } from '@/types/weekly-overview';

/**
 * Calendar view — five period columns (P1 = Mon … P5 = Fri), each carrying the real
 * date / "Period N" / TODAY header. A column is a top-aligned vertical stack of the
 * cards whose curriculum period is that column: a started lesson renders as a solid
 * status-coloured plan card, an un-started one as a ghost.
 *
 * A card's column comes ONLY from its curriculum period — not its drag-mutable
 * `weekday` — and its slot within the column is its year (ascending, and only that),
 * so there is no state-based flip and no drag-reorder here. Columns TOP-PACK: a
 * period with cards for only some years leaves no gaps below the header, so a sparse
 * coordinator board sits flush under the headers instead of staggering its plans
 * down empty year-rows. With uniform card height the teacher's full columns still
 * read as clean aligned rows (Year 2 → 3 → 4 …), identical across every column.
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
  const columns = buildPeriodColumns(years, spansMultipleCentres, { readOnly, ownerId });

  return (
    <section className="overflow-x-auto">
      {/* Five equal columns, each a period header over a top-packed stack of its
          cards (year ascending). No shared row tracks: columns pack independently,
          so sparse years never push a later column's cards down. */}
      <div className="grid min-w-[900px] grid-cols-5 items-start gap-x-[20px]">
        {columns.map((column) => (
          <PeriodColumnView
            key={`p-${column.period}`}
            column={column}
            mondayDate={mondayDate}
            readOnly={readOnly}
          />
        ))}
      </div>
    </section>
  );
}

/** One period column: its header, then a top-aligned stack of the period's cards. */
function PeriodColumnView({
  column,
  mondayDate,
  readOnly,
}: {
  column: PeriodColumn;
  mondayDate: string | null;
  readOnly: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <PeriodHeader weekday={column.period} mondayDate={mondayDate} />
      <div className="mt-[5px] flex flex-col justify-start gap-y-[10px]">
        {column.cards.map((cell) =>
          cell.kind === 'plan' ? (
            <GridLessonCard key={cell.card.key} card={cell.card} readOnly={readOnly} />
          ) : (
            <GhostLessonCard key={cell.card.key} card={cell.card} />
          ),
        )}
      </div>
    </div>
  );
}

/** A period column header: the real date, "Period N", and the TODAY marker. */
function PeriodHeader({ weekday, mondayDate }: { weekday: number; mondayDate: string | null }) {
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
      className={cn(
        // The stack below adds its own small top gap; the header just needs its
        // padding above the divider rule.
        'pb-[9px]',
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
