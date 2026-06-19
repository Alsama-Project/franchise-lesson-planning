import { cn } from '@/lib/cn';
import {
  STATUS_COLUMN_ORDER,
  STATUS_META,
} from '@/components/weekly-overview/status';
import { CardShell } from '@/components/weekly-overview/CardShell';
import { allCards, timeLabel, type LessonCard } from '@/components/weekly-overview/cards';
import type { ClassWeek, SlotStatus } from '@/types/weekly-overview';

// How many "Not started" cards to show before collapsing to a "+N more" note —
// every unplanned class/day lands here, so it can grow large.
const NOT_STARTED_CAP = 8;

/**
 * Status view — a five-column kanban (Not started · In progress · Submitted ·
 * Needs Review · Approved). Each column header carries the status label, count
 * and a 2px bottom rule in the status tint. Cards mirror the calendar cards
 * (day + date · time, then class); planned cards open the editor.
 */
export function StatusView({ classes }: { classes: ClassWeek[] }) {
  const byStatus = groupByStatus(classes);

  return (
    <div>
      <div className="grid grid-cols-5 items-start gap-[14px]">
        {STATUS_COLUMN_ORDER.map((status) => (
          <StatusColumn key={status} status={status} cards={byStatus[status]} />
        ))}
      </div>
    </div>
  );
}

function groupByStatus(classes: ClassWeek[]): Record<SlotStatus, LessonCard[]> {
  const buckets: Record<SlotStatus, LessonCard[]> = {
    not_started: [],
    in_progress: [],
    submitted: [],
    needs_review: [],
    approved: [],
  };
  for (const card of allCards(classes)) {
    buckets[card.status].push(card);
  }
  return buckets;
}

function StatusColumn({ status, cards }: { status: SlotStatus; cards: LessonCard[] }) {
  const meta = STATUS_META[status];
  const capped = status === 'not_started';
  const visible = capped ? cards.slice(0, NOT_STARTED_CAP) : cards;
  const hidden = cards.length - visible.length;

  return (
    <div>
      <div
        className={cn(
          'mb-[10px] flex items-center justify-between border-b-2 pb-[8px]',
          meta.rule,
        )}
      >
        <span className={cn('inline-flex items-center gap-[6px] text-[12.5px] font-bold', meta.text)}>
          <span aria-hidden>{meta.glyph}</span> {meta.label}
        </span>
        <span className="text-[12px] text-text-faint">{cards.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((card) => (
          <StatusCard key={card.key} card={card} />
        ))}
        {hidden > 0 ? (
          <div className="py-[6px] text-center text-[11.5px] text-text-faint">
            + {hidden} more
          </div>
        ) : null}
        {cards.length === 0 ? (
          <div className="py-[8px] text-center text-[11.5px] text-text-faint">None</div>
        ) : null}
      </div>
    </div>
  );
}

function StatusCard({ card }: { card: LessonCard }) {
  const time = card.period == null ? '' : ` · ${timeLabel(card.period)}`;
  return (
    <CardShell planId={card.planId}>
      <div className="text-[11.5px] font-semibold text-text-faint">
        {card.dayLabel} {card.dateNum}
        {time}
      </div>
      <div className="mt-[3px] text-[14px] font-semibold">{card.classLabel}</div>
    </CardShell>
  );
}
