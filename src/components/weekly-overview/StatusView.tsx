import Link from 'next/link';
import { cn } from '@/lib/cn';
import { WEEKDAY_LABELS } from '@/lib/week';
import {
  STATUS_COLUMN_ORDER,
  STATUS_META,
} from '@/components/weekly-overview/status';
import type { ClassWeek, SlotStatus } from '@/types/weekly-overview';

// One card's worth of data, flattened out of the class × weekday grid.
interface StatusItem {
  key: string;
  classLabel: string;
  weekdayLabel: string;
  headline: string;
  status: SlotStatus;
  planId: string | null;
  reviewNote: string | null;
}

// How many "Not started" cards to show before collapsing to a "+N more" note.
const NOT_STARTED_CAP = 5;

/**
 * Variant C — the status board: the same week grouped by what needs the teacher,
 * one column per status. Answers "what should I do next?" before "what day is
 * it?". Plan cards link to the editor; "Not started" cards are inert.
 */
export function StatusView({ classes }: { classes: ClassWeek[] }) {
  const byStatus = groupByStatus(classes);

  return (
    <div className="grid grid-cols-[repeat(5,1fr)] gap-3 overflow-x-auto p-5">
      {STATUS_COLUMN_ORDER.map((status) => (
        <StatusColumn key={status} status={status} items={byStatus[status]} />
      ))}
    </div>
  );
}

function groupByStatus(classes: ClassWeek[]): Record<SlotStatus, StatusItem[]> {
  const buckets: Record<SlotStatus, StatusItem[]> = {
    not_started: [],
    in_progress: [],
    submitted: [],
    needs_review: [],
    approved: [],
  };

  for (const c of classes) {
    for (const slot of c.slots) {
      buckets[slot.status].push({
        key: `${c.classId}:${slot.weekday}`,
        classLabel: c.label,
        weekdayLabel: WEEKDAY_LABELS[slot.weekday],
        headline: slot.target?.dailyLO || (slot.plan ? 'Lesson plan' : 'Not started'),
        status: slot.status,
        planId: slot.plan?.id ?? null,
        reviewNote: slot.plan?.reviewNote ?? null,
      });
    }
  }

  return buckets;
}

function StatusColumn({ status, items }: { status: SlotStatus; items: StatusItem[] }) {
  const meta = STATUS_META[status];
  const isNotStarted = status === 'not_started';
  const visible = isNotStarted ? items.slice(0, NOT_STARTED_CAP) : items;
  const hidden = items.length - visible.length;

  return (
    <div className="min-w-[180px]">
      <div className="mb-[10px] flex items-center justify-between">
        <span className={cn('text-[12.5px] font-semibold', meta.text)}>
          <span aria-hidden>{meta.glyph}</span> {meta.label}
        </span>
        <span className="text-[12px] text-text-faint">{items.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((item) => (
          <StatusCard key={item.key} item={item} />
        ))}
        {hidden > 0 ? (
          <div className="p-[6px] text-center text-[11.5px] text-text-faint">
            + {hidden} more
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[11.5px] text-text-faint">
            None
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusCard({ item }: { item: StatusItem }) {
  const meta = STATUS_META[item.status];
  const notStarted = item.status === 'not_started';

  const body = (
    <>
      <div className={cn('mb-1 text-[11px] font-semibold', notStarted ? 'text-text-faint' : meta.text)}>
        {item.classLabel} · {item.weekdayLabel}
      </div>
      <div
        className={cn(
          'line-clamp-2 text-[12.5px] leading-[1.35]',
          notStarted ? 'text-neutral-800' : 'text-[13px] text-ink',
        )}
      >
        {item.headline}
      </div>
      {item.status === 'submitted' ? (
        <div className="mt-[6px] text-[11px] text-text-faint">Awaiting approval</div>
      ) : null}
      {item.status === 'needs_review' && item.reviewNote ? (
        <div className="mt-[7px] text-[11px] text-status-progress">“{item.reviewNote}”</div>
      ) : null}
    </>
  );

  const base = cn(
    'rounded-md border px-3 py-[11px]',
    notStarted ? 'bg-surface-subtle border-border' : `bg-surface ${meta.cardBorder}`,
  );

  if (item.planId) {
    return (
      <Link href={`/plan/${item.planId}`} className={cn(base, 'block transition-colors hover:bg-surface-subtle')}>
        {body}
      </Link>
    );
  }

  return <div className={base}>{body}</div>;
}
