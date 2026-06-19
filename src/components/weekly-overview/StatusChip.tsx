import { cn } from '@/lib/cn';
import { STATUS_META } from '@/components/weekly-overview/status';
import type { SlotStatus } from '@/types/weekly-overview';

/**
 * The small pill that carries a slot's status at a glance — glyph + label in the
 * status colour tokens. Flat (tint fill, no border, 6px radius) per the design.
 */
export function StatusChip({ status }: { status: SlotStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded-badge px-[8px] py-[3px] text-[10.5px] font-semibold',
        meta.badge,
      )}
    >
      <span aria-hidden>{meta.glyph}</span>
      {meta.label}
    </span>
  );
}
