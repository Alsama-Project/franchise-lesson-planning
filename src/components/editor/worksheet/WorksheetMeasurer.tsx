'use client';

// The pagination MEASURER — the single measurement pass behind both the on-screen
// builder and the print render. It renders the worksheet's blocks ONCE, off
// screen (laid out but never painted), in their static/print form inside a real
// MasterFrame, then reports a `paginateBlocks` result (which block goes on which
// page, and which blocks overflow a page on their own).
//
// Driving both the editor and the print view from this one measurer is what keeps
// them paginated identically: same blocks, same heights, same logic. The per-page
// content height is derived by measuring the frame's chrome (page − body) so it
// tracks the locked header/objective/footer instead of a hard-coded guess.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Worksheet } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import { paginateBlocks, type PaginationResult } from '@/lib/editor/pagination';
import { MasterFrame, BODY_PAD_TOP, BODY_PAD_BOTTOM } from './MasterFrame';
import { PrintBlock } from './WorksheetPrintView';
import type { WorksheetContext } from './context';

// A4 at 96dpi — the locked page height every page is paginated against.
const PAGE_HEIGHT = 1123;
const PAGE_WIDTH = 794;

export function WorksheetMeasurer({
  ws,
  ctx,
  resolved,
  onResult,
}: {
  ws: Worksheet;
  ctx: WorksheetContext;
  resolved: Record<string, ResourceWithTags>;
  onResult: (result: PaginationResult) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const measure = useCallback(() => {
    const pageEl = pageRef.current;
    const bodyEl = bodyRef.current;
    if (!pageEl || !bodyEl) return;
    // body is flex:1, so it always fills (page − chrome); the difference is the
    // locked header + objective strip + footer, independent of content length.
    const chrome = pageEl.offsetHeight - bodyEl.offsetHeight;
    const pageContent = PAGE_HEIGHT - chrome - BODY_PAD_TOP - BODY_PAD_BOTTOM;
    const heights = ws.blocks.map((b) => blockRefs.current.get(b.id)?.offsetHeight ?? 0);
    onResultRef.current(paginateBlocks(heights, pageContent, 0));
  }, [ws.blocks]);

  // Re-measure on mount, on any block change, and whenever a block's rendered
  // height changes asynchronously (images decoding, fonts loading).
  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    if (bodyRef.current) ro.observe(bodyRef.current);
    blockRefs.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [measure]);

  const setBlockRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) blockRefs.current.set(id, el);
    else blockRefs.current.delete(id);
  };

  return (
    <div
      aria-hidden
      className="ws-no-print"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: PAGE_WIDTH,
        height: 0,
        overflow: 'hidden',
        visibility: 'hidden',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <div ref={pageRef}>
        <MasterFrame ctx={ctx} bodyRef={bodyRef}>
          {ws.blocks.map((b, i) => (
            <div key={b.id} ref={setBlockRef(b.id)} className="ws-print-block">
              <PrintBlock block={b} index={i} resolved={resolved} />
            </div>
          ))}
        </MasterFrame>
      </div>
    </div>
  );
}
