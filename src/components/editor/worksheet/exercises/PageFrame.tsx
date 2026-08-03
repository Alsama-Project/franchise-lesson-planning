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

import type { ReactNode } from 'react';
import type { WorksheetContext } from '../context';
import { DocMasthead, DocFooter } from '../doc/DocMasthead';
import { BRAND, PAGE_WIDTH } from '../doc/theme';

export function PageFrame({ ctx, children }: { ctx: WorksheetContext; children: ReactNode }) {
  return (
    <div
      className="ws-doc-canvas"
      style={{ flex: 1, minHeight: 0, overflow: 'auto', background: BRAND.canvas, padding: '28px 20px 60px' }}
    >
      <div
        className="ws-doc-page ws-print-area"
        style={{ width: PAGE_WIDTH, maxWidth: '100%', margin: '0 auto', background: '#fff', boxShadow: BRAND.pageShadow, borderRadius: 2 }}
      >
        <DocMasthead ctx={ctx} />
        <div style={{ padding: '30px 52px 44px' }}>{children}</div>
        <DocFooter ctx={ctx} className="ws-doc-footer-screen ws-no-print" />
        <DocFooter ctx={ctx} className="ws-print-footer" />
      </div>
    </div>
  );
}
