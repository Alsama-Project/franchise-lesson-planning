'use client';

// The filling-state skeleton for the document surface.
//
// While `generateAll` runs, the live document editor still shows its prior/empty
// content and only receives the real doc at the ONE atomic reveal (applyFullDoc).
// Before this, the pane gave no per-position feedback — a teacher waiting through a
// page of exercises plus images saw a static page and assumed it had failed.
//
// This overlay restores the designed behaviour on the single (document) surface:
// skeleton boxes appear at roughly the right heights (from the plan's specs), the
// page fills with structure, then the whole overlay is removed in one pass when
// filling ends and the real content has already been written beneath it. It is an
// overlay, NOT editor nodes, so nothing here can ever be autosaved into the
// worksheet — and it is `ws-no-print`, so it never reaches paper.
//
// It consumes `fillSpecs` + `heights.ts` — the estimated-height machinery that
// carried the card surface's skeletons and had no consumer after the single-surface
// change. Nothing streams and nothing reveals per-exercise: this is pure scaffolding
// that vanishes at the existing atomic reveal.

import type { ExerciseSpec } from '@/types/worksheet-exercise';
import { BRAND } from '../doc/theme';
import { PAGE_WIDTH, skeletonHeight, IMAGE_SLOT_HEIGHT } from './heights';

const BAR = '#E7E1D6';
const BLOCK = '#F2EEE7';
const IMG = '#EDE8DF';

export function WorksheetSkeleton({ specs }: { specs: ExerciseSpec[] }) {
  return (
    <div
      aria-hidden
      className="ws-no-print absolute inset-0 z-10 overflow-auto"
      style={{ background: BRAND.canvas, padding: '28px 20px 60px' }}
    >
      <div
        style={{
          width: PAGE_WIDTH,
          maxWidth: '100%',
          margin: '0 auto',
          background: '#fff',
          boxShadow: BRAND.pageShadow,
          borderRadius: 2,
          padding: '40px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
        }}
      >
        {/* Masthead placeholder — the page reads as a worksheet immediately. */}
        <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 26, width: '55%', borderRadius: 6, background: BAR }} />
          <div style={{ height: 12, width: '32%', borderRadius: 6, background: BLOCK }} />
        </div>

        {specs.map((spec, i) => (
          <div key={i} className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Exercise heading */}
            <div style={{ height: 16, width: '42%', borderRadius: 6, background: BAR }} />
            {/* Body block, reserving roughly the exercise's footprint */}
            <div style={{ height: skeletonHeight(spec.estimated_height), borderRadius: 8, background: BLOCK }} />
            {/* One reserved square per image the exercise plans (bounded by the cap) */}
            {spec.image_count > 0 ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Array.from({ length: Math.min(spec.image_count, 8) }).map((_, k) => (
                  <div
                    key={k}
                    style={{ width: IMAGE_SLOT_HEIGHT, height: IMAGE_SLOT_HEIGHT, borderRadius: 8, background: IMG }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
