'use client';

// A read-only "Attached from the bank" list. Mirrors AttachedList's row styling
// (format badge + title) but carries no remove control — it is used on the plan
// overview / read-only view where nothing is editable.

import type { ResourceWithTags } from '@/types/resource';
import { resourceView } from '@/components/resources/presentation';

export function ReadOnlyResourceList({ resources }: { resources: ResourceWithTags[] }) {
  if (resources.length === 0) return null;
  return (
    <div>
      <div className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.05em] text-text-faint">
        Attached from the bank
      </div>
      <div className="flex flex-col gap-[7px]">
        {resources.map((r) => {
          const v = resourceView(r);
          return (
            <div
              key={r.id}
              className="flex items-center gap-[10px] rounded-[10px] border border-border bg-surface px-[11px] py-[8px]"
            >
              <span
                className="inline-flex h-[18px] flex-shrink-0 items-center rounded-[5px] px-[6px] text-[9.5px] font-bold tracking-[0.04em]"
                style={{ color: v.fmtColor, background: v.fmtBg }}
              >
                {v.formatShort}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                {r.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
