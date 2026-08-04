'use client';

// The zoomable page surface shared by both v3 worksheet surfaces (the continuous
// DocumentWorksheet and the exercise-card PageFrame). It wraps ONE `.ws-doc-page`
// with a CSS `transform: scale(zoom)` and a scroll SIZER so the page can be panned
// when zoomed past the viewport (transforms don't reflow, so the scroll area has to
// be reserved explicitly — this is the one piece of the v2 zoom that earns its port).
//
// STRUCTURE
//   canvas   — the scroll viewport (overflow:auto); owns the pinch listeners.
//     sizer  — reserves the SCALED footprint (baseW·zoom × pageH·zoom), centred.
//       page — `.ws-doc-page`, absolutely placed at the sizer's top-left, scaled
//              from `transform-origin: top left` so it exactly fills the sizer.
//
// The transform goes on `.ws-doc-page` ITSELF, never an ancestor: an ancestor
// transform would establish a containing block, and the print rule's
// `position:absolute; left:0; top:0` on `.ws-print-area` would then resolve against
// the transformed box instead of the page origin — breaking the print reposition on
// top of scaling the output. `@media print` resets `.ws-doc-page`'s transform and
// neutralises the sizer, so zoom never reaches paper.
//
// RESPONSIVE BASE WIDTH: the page is laid out at `min(PAGE_WIDTH, available)` — the
// JS equivalent of the old `width:794; maxWidth:100%`, computed here only so the
// sizer can reserve the right footprint. This observer sets the base WIDTH; it never
// touches `zoom` (so there is no auto-fit fighting a deliberate zoom — that machinery
// is deliberately not ported).

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PAGE_WIDTH, PAGE_HEIGHT } from './theme';
import { clampZoom, round2 } from './zoom';

export function ZoomPage({
  zoom,
  onZoomChange,
  canvasClassName,
  canvasStyle,
  pageClassName,
  pageStyle,
  children,
}: {
  zoom: number;
  /** Pinch/trackpad zoom lifts the new value; accepts an updater like `setState`. */
  onZoomChange: (next: number | ((z: number) => number)) => void;
  canvasClassName?: string;
  canvasStyle?: CSSProperties;
  pageClassName?: string;
  /** Page surface styles (background/shadow/radius). Width, position and transform
   *  are owned here and must not be passed in. */
  pageStyle?: CSSProperties;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // Base (pre-transform, layout) page dimensions. Seeded with the A4 defaults, then
  // measured — baseW from the canvas's content width, pageH from the page's own
  // reflowed height at that width.
  const [baseW, setBaseW] = useState(PAGE_WIDTH);
  const [pageH, setPageH] = useState(PAGE_HEIGHT);

  // Base width = min(PAGE_WIDTH, canvas content width). Mirrors the old
  // `maxWidth:100%` shrink-to-pane, in JS so the sizer footprint is exact.
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
      const avail = el.clientWidth - padX;
      setBaseW(Math.max(1, Math.min(PAGE_WIDTH, avail)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Natural (pre-transform) page height, so the sizer reserves baseW·zoom × pageH·zoom.
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPageH(el.offsetHeight));
    ro.observe(el);
    setPageH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Pinch-to-zoom on the canvas: non-passive wheel (Chromium/Firefox set ctrlKey for
  // trackpad pinch) + Safari gesture events. Ported verbatim from v2.
  const onZoomRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomRef.current = onZoomChange;
  }, [onZoomChange]);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      onZoomRef.current((z) => clampZoom(round2(z * (1 - e.deltaY * 0.01))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    let gestureBase = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureBase = zoomRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as unknown as { scale: number }).scale ?? 1;
      onZoomRef.current(clampZoom(round2(gestureBase * scale)));
    };
    const onGestureEnd = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureEnd);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
  }, []);

  const sizerW = Math.round(baseW * zoom);
  const sizerH = Math.round(pageH * zoom);

  return (
    <div ref={canvasRef} className={canvasClassName} style={canvasStyle}>
      {/* Scroll sizer: reserves the scaled footprint so a zoomed page can be panned. */}
      <div className="ws-zoom-sizer" style={{ width: sizerW, height: sizerH, margin: '0 auto', position: 'relative' }}>
        <div
          ref={pageRef}
          className={pageClassName}
          style={{
            ...pageStyle,
            position: 'absolute',
            top: 0,
            left: 0,
            width: baseW,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
