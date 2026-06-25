'use client';

// Read-only inline render of a lesson's student worksheet, for the plan overview
// (creator's Review step) and the non-creator read-only view. The worksheet is a
// full A4 document (794px wide), so it sits behind a "View worksheet" toggle and,
// once open, is rendered faithfully via the existing static WorksheetPrintView
// (NOT the editable builder) scaled down to fit the surrounding column.
//
// Its own "from the bank" resource blocks carry ids that are not resolved by the
// page loader, so they are fetched lazily — the first time the sheet is opened —
// through the same RLS-scoped action the builder uses. Nothing here is editable.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ResourceWithTags } from '@/types/resource';
import { parseWorksheet, isWorksheetEmpty } from '@/lib/editor/worksheet';
import { getResourcesByIdsAction } from '@/lib/actions/resources';
import { WorksheetPrintView } from '@/components/editor/worksheet/WorksheetPrintView';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

const A4_WIDTH = 794;

/** Scales an intrinsically `nativeWidth`-wide child down to fit its column,
 *  collapsing the layout box to the scaled height so nothing else is pushed. */
function ScaledA4({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const s = Math.min(1, outer.clientWidth / A4_WIDTH);
      setScale(s);
      setHeight(inner.offsetHeight * s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} style={{ width: '100%', overflow: 'hidden', height }}>
      <div
        ref={innerRef}
        style={{ width: A4_WIDTH, transformOrigin: 'top left', transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export function ReadOnlyWorksheet({
  worksheet,
  ctx,
}: {
  worksheet: unknown;
  ctx: WorksheetContext;
}) {
  const ws = parseWorksheet(worksheet);
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<Record<string, ResourceWithTags>>({});

  const resourceIds = ws.blocks
    .filter((b) => b.kind === 'resource')
    .map((b) => (b as { resourceId: string }).resourceId);
  const resourceIdsKey = resourceIds.join(',');

  // Resolve the worksheet's "from the bank" blocks the first time it is opened.
  useEffect(() => {
    if (!open || resourceIds.length === 0) return;
    let cancelled = false;
    void getResourcesByIdsAction(resourceIds).then((rows) => {
      if (cancelled) return;
      setResolved((prev) => {
        const next = { ...prev };
        for (const r of rows) next[r.id] = r;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resourceIdsKey]);

  if (isWorksheetEmpty(ws)) {
    return (
      <div className="rounded-[10px] border border-dashed border-border-strong px-3 py-[12px] text-center text-[12px] text-text-faint">
        No worksheet planned yet.
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-[7px] rounded-[8px] border border-border bg-surface px-[11px] py-[6px] text-[12.5px] font-semibold text-neutral-800 hover:bg-surface-subtle"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#B6ABA0"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={open ? 'rotate-90 transition-transform' : 'transition-transform'}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {open ? 'Hide worksheet' : 'View worksheet'}
      </button>
      {open ? (
        <div className="mt-[12px]">
          <ScaledA4>
            <WorksheetPrintView ws={ws} ctx={ctx} resolved={resolved} />
          </ScaledA4>
        </div>
      ) : null}
    </div>
  );
}
