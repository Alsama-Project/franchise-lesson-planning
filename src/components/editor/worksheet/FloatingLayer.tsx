'use client';

// The page-relative floating layer rendered over the worksheet body. It fills the
// body content box (the coordinate space for every element), stays pointer-through
// where empty (so clicks fall to the blocks beneath) and hosts the text boxes and
// free images. The box element itself (this root) is what every child measures for
// size + zoom scale when clamping drags.

import { useTranslations } from 'next-intl';
import type { FloatingElement, FloatingImage, FloatingTextBox as FloatingTextBoxModel, WorksheetDoc } from '@/types/lesson';
import { FloatingElementView, type Geom, type ScreenRect } from './FloatingElementView';
import { FloatingTextBox } from './FloatingTextBox';
import type { ActiveBlock } from './FreeBlock';

export interface FloatingActions {
  onSelect: (id: string | null) => void;
  onCommit: (id: string, geom: Geom) => void;
  /** A move ended — re-home the element by its final on-screen rect. */
  onMoveEnd: (id: string, rect: ScreenRect) => void;
  onDelete: (id: string) => void;
  onRestack: (id: string, dir: 'forward' | 'backward') => void;
  onDocChange: (id: string, doc: WorksheetDoc) => void;
  onStyleChange: (id: string, patch: { border?: boolean; fill?: 'transparent' | 'white' }) => void;
  onMakeInline: (el: FloatingImage) => void;
  onActivate: (api: ActiveBlock) => void;
  onDeactivate: (id: string) => void;
}

export function FloatingLayer({
  elements,
  selectedId,
  actions,
  boxRef,
  blockId,
  insertTextBox,
  insertFloatingImage,
}: {
  elements: FloatingElement[];
  selectedId: string | null;
  actions: FloatingActions;
  /** The coordinate-box element (the block content box) for clamping drags. */
  boxRef: React.RefObject<HTMLDivElement | null>;
  /** The owning block + its inserters, so a focused text box targets this block. */
  blockId: string;
  insertTextBox: () => void;
  insertFloatingImage: () => void;
}) {
  const t = useTranslations('worksheet');
  return (
    <div ref={boxRef} className="ws-float-box" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {elements.map((el) =>
        el.kind === 'textbox' ? (
          <FloatingTextBox
            key={el.id}
            el={el as FloatingTextBoxModel}
            selected={selectedId === el.id}
            boxRef={boxRef}
            blockId={blockId}
            insertTextBox={insertTextBox}
            insertFloatingImage={insertFloatingImage}
            onSelect={() => actions.onSelect(el.id)}
            onCommit={(geom) => actions.onCommit(el.id, geom)}
            onMoveEnd={(rect) => actions.onMoveEnd(el.id, rect)}
            onDelete={() => actions.onDelete(el.id)}
            onRestack={(dir) => actions.onRestack(el.id, dir)}
            onDocChange={(doc) => actions.onDocChange(el.id, doc)}
            onStyleChange={(patch) => actions.onStyleChange(el.id, patch)}
            onActivate={actions.onActivate}
            onDeactivate={actions.onDeactivate}
          />
        ) : (
          <FloatingElementView
            key={el.id}
            el={el}
            selected={selectedId === el.id}
            boxRef={boxRef}
            resize="image"
            aspect={el.h ? el.w / el.h : 1}
            onSelect={() => actions.onSelect(el.id)}
            onCommit={(geom) => actions.onCommit(el.id, geom)}
            onMoveEnd={(rect) => actions.onMoveEnd(el.id, rect)}
            onDelete={() => actions.onDelete(el.id)}
            onRestack={(dir) => actions.onRestack(el.id, dir)}
            ghost={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(el as FloatingImage).src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            }
            controls={
              <button
                type="button"
                title={t('image.makeInline')}
                onClick={() => actions.onMakeInline(el as FloatingImage)}
                style={{ width: 26, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: '#5C544E' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /><rect x="13" y="9" width="7" height="6" rx="1" fill="currentColor" stroke="none" /></svg>
              </button>
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={(el as FloatingImage).src}
              alt={(el as FloatingImage).alt ?? ''}
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 6, pointerEvents: 'none' }}
            />
          </FloatingElementView>
        ),
      )}
    </div>
  );
}
