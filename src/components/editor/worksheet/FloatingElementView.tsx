'use client';

// The shared chrome for a freely-positioned element (text box or floating image):
// absolute placement, selection outline, a top control strip (move grip, layer
// order, delete, plus element-specific controls), and resize handles. All drag /
// resize math is zoom-aware (it recovers the page's layout→screen scale from the
// coordinate box) and clamped to the printable body box, so an element can never
// leave the page or overlap the locked chrome.

import { useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import type { FloatingElement } from '@/types/lesson';
import { clampGeom } from '@/lib/editor/worksheet';

export interface Geom {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TEAL = '#1F7A6C';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se'];
const EDGES: Handle[] = ['n', 's', 'e', 'w'];

function handleCursor(h: Handle): string {
  if (h === 'n' || h === 's') return 'ns-resize';
  if (h === 'e' || h === 'w') return 'ew-resize';
  if (h === 'ne' || h === 'sw') return 'nesw-resize';
  return 'nwse-resize';
}

function handlePosition(h: Handle): CSSProperties {
  const at = (v: 'start' | 'mid' | 'end'): string =>
    v === 'start' ? '-5px' : v === 'end' ? 'calc(100% - 5px)' : 'calc(50% - 5px)';
  const vy = h.includes('n') ? 'start' : h.includes('s') ? 'end' : 'mid';
  const vx = h.includes('w') ? 'start' : h.includes('e') ? 'end' : 'mid';
  return { top: at(vy), left: at(vx) };
}

export function FloatingElementView({
  el,
  selected,
  boxRef,
  resize,
  aspect,
  onSelect,
  onCommit,
  onDelete,
  onRestack,
  controls,
  children,
}: {
  el: FloatingElement;
  selected: boolean;
  /** The coordinate-box element (the body content box) — for size + zoom scale. */
  boxRef: React.RefObject<HTMLDivElement | null>;
  resize: 'box' | 'image';
  aspect?: number; // width / height, for aspect-locked image corners
  onSelect: () => void;
  onCommit: (geom: Geom) => void;
  onDelete: () => void;
  onRestack: (dir: 'forward' | 'backward') => void;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const [live, setLive] = useState<Geom | null>(null);
  const geom: Geom = live ?? { x: el.x, y: el.y, w: el.w, h: el.h };
  const min = resize === 'image' ? { w: 48, h: 48 } : { w: 120, h: 56 };

  // Read the box's layout size and the layout→screen scale (page zoom).
  const measure = () => {
    const box = boxRef.current;
    const rect = box?.getBoundingClientRect();
    const scale = box && box.clientWidth ? (rect?.width ?? box.clientWidth) / box.clientWidth : 1;
    return {
      scale: scale || 1,
      box: { w: box?.clientWidth ?? el.w, h: box?.clientHeight ?? el.h },
    };
  };

  const startMove = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const { scale, box } = measure();
    const start = { x: el.x, y: el.y, w: el.w, h: el.h };
    const sx = e.clientX;
    const sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      setLive(clampGeom({ ...start, x: start.x + dx, y: start.y + dy }, box, min));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLive((g) => {
        if (g) onCommit(g);
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (e: ReactPointerEvent, h: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const { scale, box } = measure();
    const start = { x: el.x, y: el.y, w: el.w, h: el.h };
    const sx = e.clientX;
    const sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      let { x, y, w, hgt } = { x: start.x, y: start.y, w: start.w, hgt: start.h };
      if (h.includes('e')) w = start.w + dx;
      if (h.includes('w')) {
        w = start.w - dx;
        x = start.x + dx;
      }
      if (h.includes('s')) hgt = start.h + dy;
      if (h.includes('n')) {
        hgt = start.h - dy;
        y = start.y + dy;
      }
      if (aspect && resize === 'image') {
        hgt = w / aspect;
        if (h.includes('n')) y = start.y + (start.h - hgt);
      }
      setLive(clampAspect({ x, y, w, h: hgt }, box, min, resize === 'image' ? aspect : undefined));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLive((g) => {
        if (g) onCommit(g);
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handles: Handle[] = resize === 'image' ? CORNERS : [...CORNERS, ...EDGES];

  return (
    <div
      className="ws-float-el"
      onPointerDown={() => onSelect()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: geom.x,
        top: geom.y,
        width: geom.w,
        height: geom.h,
        zIndex: el.z,
        pointerEvents: 'auto',
        outline: selected ? `1.5px solid ${TEAL}` : '1px dashed transparent',
        outlineOffset: 2,
      }}
    >
      {children}

      {selected ? (
        <>
          {/* Control strip */}
          <div
            contentEditable={false}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: -34,
              left: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: 3,
              background: '#fff',
              border: '1px solid #CFE6E0',
              borderRadius: 8,
              boxShadow: '0 8px 20px -10px rgba(40,30,20,0.55)',
              whiteSpace: 'nowrap',
            }}
          >
            <span title="Move" onPointerDown={startMove} style={{ ...stripBtn, cursor: 'grab', color: '#8A8178' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
            </span>
            {controls}
            <button type="button" title="Bring forward" onClick={() => onRestack('forward')} style={stripBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="3" width="13" height="13" rx="2" /><path d="M5 11v8a2 2 0 0 0 2 2h8" /></svg>
            </button>
            <button type="button" title="Send backward" onClick={() => onRestack('backward')} style={stripBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="13" height="13" rx="2" /><path d="M19 13V5a2 2 0 0 0-2-2H9" /></svg>
            </button>
            <button type="button" title="Delete" onClick={onDelete} style={{ ...stripBtn, color: '#B62A5C' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
            </button>
          </div>

          {/* Resize handles */}
          {handles.map((h) => (
            <span
              key={h}
              onPointerDown={(e) => startResize(e, h)}
              style={{
                position: 'absolute',
                width: 10,
                height: 10,
                background: '#fff',
                border: `2px solid ${TEAL}`,
                borderRadius: 2,
                cursor: handleCursor(h),
                touchAction: 'none',
                ...handlePosition(h),
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

/** Clamp keeping the box inside [0..box]×[0..box]; for images, preserve aspect. */
function clampAspect(geom: Geom, box: { w: number; h: number }, min: { w: number; h: number }, aspect?: number): Geom {
  if (!aspect) return clampGeom(geom, box, min);
  let { x, y, w, h } = geom;
  w = Math.max(min.w, Math.min(w, box.w));
  h = w / aspect;
  if (h > box.h) {
    h = box.h;
    w = h * aspect;
  }
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > box.w) x = box.w - w;
  if (y + h > box.h) y = box.h - h;
  return { x, y, w, h };
}

const stripBtn: CSSProperties = {
  width: 26,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  background: 'transparent',
};
