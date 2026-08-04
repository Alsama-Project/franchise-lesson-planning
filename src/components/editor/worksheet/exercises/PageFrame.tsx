'use client';

// The A4 page the exercise cards sit on: the SAME white page-on-warm-canvas the
// continuous editor draws, reusing its cream masthead (wordmark · Student worksheet
// · subject·year · Name/Date/Class · objective strip) and running footer (code ·
// wordmark), single-sourced from DocMasthead/DocFooter so the two surfaces stay
// pixel-identical.
//
// PAGINATION OFF-RAMP (taken): this renders ONE continuous A4-width page rather
// than paginated sheets. Per the brief, a stable single page beats a twitching
// two, and multi-page (Page N of M, the page-2 header without Name/Date/Class) is
// flagged as a follow-up. The footer is therefore page-agnostic (no live "Page N
// of M" on screen); the browser print path still breaks pages via the existing
// @page rules in globals.css.
//
// Zoom: when the pane wires `onZoomChange`, the page is scaled through the shared
// ZoomPage (same transform-on-`.ws-doc-page` + scroll-sizer as the document
// surface). Without it the page renders unzoomed.

import type { CSSProperties, ReactNode } from 'react';
import type { WorksheetContext } from '../context';
import { DocMasthead, DocFooter } from '../doc/DocMasthead';
import { BRAND, PAGE_WIDTH } from '../doc/theme';
import { ZoomPage } from '../doc/ZoomPage';

const CANVAS_STYLE: CSSProperties = { flex: 1, minHeight: 0, overflow: 'auto', background: BRAND.canvas, padding: '28px 20px 60px' };
const PAGE_SURFACE: CSSProperties = { background: '#fff', boxShadow: BRAND.pageShadow, borderRadius: 2 };

export function PageFrame({
  ctx,
  children,
  zoom = 1,
  onZoomChange,
}: {
  ctx: WorksheetContext;
  children: ReactNode;
  zoom?: number;
  onZoomChange?: (next: number | ((z: number) => number)) => void;
}) {
  const pageInner = (
    <>
      <DocMasthead ctx={ctx} />
      <div style={{ padding: '30px 52px 44px' }}>{children}</div>
      <DocFooter ctx={ctx} className="ws-doc-footer-screen ws-no-print" />
      <DocFooter ctx={ctx} className="ws-print-footer" />
    </>
  );

  if (onZoomChange) {
    return (
      <ZoomPage
        zoom={zoom}
        onZoomChange={onZoomChange}
        canvasClassName="ws-doc-canvas"
        canvasStyle={CANVAS_STYLE}
        pageClassName="ws-doc-page ws-print-area"
        pageStyle={PAGE_SURFACE}
      >
        {pageInner}
      </ZoomPage>
    );
  }

  return (
    <div className="ws-doc-canvas" style={CANVAS_STYLE}>
      <div className="ws-doc-page ws-print-area" style={{ width: PAGE_WIDTH, maxWidth: '100%', margin: '0 auto', ...PAGE_SURFACE }}>
        {pageInner}
      </div>
    </div>
  );
}
