'use client';

// A resize-capable, alignable image for the worksheet Free-block editor.
//
// It extends the stock tiptap Image node with two persisted attributes:
//   • width  — an explicit pixel width (null = natural), clamped on drag to the
//     page's text-column width so an image can never overflow the A4 page;
//   • align  — left | center | right. left/right float so text wraps beside the
//     image; center is a block image with auto side margins.
//
// The React NodeView draws corner handles (resize, aspect-ratio preserved) and a
// small alignment control when the node is selected. `renderHTML` folds width +
// align into inline styles so the same look round-trips to the print/preview HTML
// (which is produced from the stored doc via `generateHTML`, NOT the NodeView).

import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ImageCropModal } from './ImageCropModal';

export type ImageAlign = 'left' | 'center' | 'right';

/** Payload passed up when an inline image is converted to a free floating one. */
export interface FloatImageInfo {
  src: string;
  alt: string | null;
  w: number;
  h: number;
}

const MIN_WIDTH = 60;
const TEAL = '#1F7A6C';

/** Wrapper layout per alignment (floats give the text-wrap for left/right). */
function wrapperLayout(align: ImageAlign): CSSProperties {
  if (align === 'left') return { float: 'left', margin: '4px 18px 10px 0' };
  if (align === 'right') return { float: 'right', margin: '4px 0 10px 18px' };
  return { float: 'none', display: 'block', margin: '12px auto' };
}

/** The same layout as inline-style strings, for the printable HTML. */
function layoutCss(align: ImageAlign, width: number | null): string {
  const css: string[] = ['max-width:100%', 'height:auto', 'border-radius:8px'];
  if (width) css.push(`width:${width}px`);
  if (align === 'left') css.push('float:left', 'margin:4px 18px 10px 0');
  else if (align === 'right') css.push('float:right', 'margin:4px 0 10px 18px');
  else css.push('display:block', 'margin:12px auto');
  return css.join(';');
}

function ImageNodeView({ node, updateAttributes, deleteNode, selected, editor, extension }: NodeViewProps) {
  const t = useTranslations('worksheet');
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string | null) ?? '';
  const title = (node.attrs.title as string | null) ?? undefined;
  const width = (node.attrs.width as number | null) ?? null;
  const align = ((node.attrs.align as ImageAlign | null) ?? 'center') as ImageAlign;

  const onFloat = (extension.options as { onFloatImage?: (info: FloatImageInfo) => void }).onFloatImage;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const latestWidth = useRef<number | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const displayWidth = liveWidth ?? width ?? null;

  const startResize = (e: ReactPointerEvent, corner: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    // The page may be CSS-scaled (zoom): recover the layout→screen factor so the
    // drag tracks the pointer 1:1 in document space regardless of zoom.
    const scale = img.offsetWidth ? rect.width / img.offsetWidth : 1;
    const startWidth = img.offsetWidth;
    const startX = e.clientX;
    const sign = corner === 'right' ? 1 : -1;
    // Clamp to the editable text-column width so the image never overflows A4.
    const column = wrapperRef.current?.closest('.worksheet-doc') as HTMLElement | null;
    const maxWidth = column?.clientWidth ?? startWidth;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / (scale || 1);
      const next = Math.round(Math.min(Math.max(startWidth + sign * dx, MIN_WIDTH), maxWidth));
      latestWidth.current = next;
      setLiveWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (latestWidth.current != null) updateAttributes({ width: latestWidth.current });
      latestWidth.current = null;
      setLiveWidth(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const editable = editor.isEditable;

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="ws-img-nv"
      data-align={align}
      style={{
        position: 'relative',
        maxWidth: '100%',
        width: displayWidth ? `${displayWidth}px` : 'fit-content',
        ...wrapperLayout(align),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        title={title}
        draggable={false}
        style={{
          display: 'block',
          width: displayWidth ? '100%' : 'auto',
          maxWidth: '100%',
          height: 'auto',
          borderRadius: 8,
          border: selected ? `2px solid ${TEAL}` : '1px solid var(--color-neutral-150)',
        }}
      />

      {editable && selected ? (
        <>
          {/* Alignment control */}
          <div
            contentEditable={false}
            style={{
              position: 'absolute',
              top: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'inline-flex',
              gap: 2,
              padding: 3,
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid #CFE6E0',
              borderRadius: 8,
              boxShadow: '0 6px 16px -8px rgba(40,30,20,0.5)',
            }}
          >
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                type="button"
                title={t(`image.align${a[0].toUpperCase()}${a.slice(1)}`)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => updateAttributes({ align: a })}
                style={{
                  width: 26,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: align === a ? '#E4F0ED' : 'transparent',
                  color: align === a ? '#186155' : '#5C544E',
                }}
              >
                <AlignIcon align={a} />
              </button>
            ))}
            {/* Crop — re-uploads a real cropped image and swaps this node's src. */}
            <span style={{ width: 1, height: 18, background: '#E0EAE7', margin: '0 2px', alignSelf: 'center' }} />
            <button
              type="button"
              title={t('image.crop')}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => setCropOpen(true)}
              style={{ width: 26, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: '#5C544E' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" /></svg>
            </button>
            {onFloat ? (
              <>
                <span style={{ width: 1, height: 18, background: '#E0EAE7', margin: '0 2px', alignSelf: 'center' }} />
                <button
                  type="button"
                  title={t('image.float')}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    const img = imgRef.current;
                    const w = width ?? img?.offsetWidth ?? 320;
                    const natW = img?.naturalWidth || w;
                    const natH = img?.naturalHeight || Math.round(w * 0.66);
                    onFloat({ src, alt: alt || null, w, h: Math.round(w * (natH / natW)) });
                    deleteNode();
                  }}
                  style={{ width: 26, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: '#5C544E' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
                </button>
              </>
            ) : null}
          </div>

          {/* Resize handles (bottom corners) */}
          <ResizeHandle corner="left" onPointerDown={(ev) => startResize(ev, 'left')} />
          <ResizeHandle corner="right" onPointerDown={(ev) => startResize(ev, 'right')} />
        </>
      ) : null}

      {cropOpen ? (
        <ImageCropModal
          src={src}
          alt={alt}
          onCancel={() => setCropOpen(false)}
          onCropped={(url) => {
            // Swap to the freshly cropped upload. Keep `width`/`align`: the on-page
            // frame stays put and height re-derives from the new aspect, so the
            // crop renders identically in the editor and the print/PDF export. The
            // pre-crop file is intentionally left in storage (orphan cleanup is
            // out of scope for this slice).
            updateAttributes({ src: url });
            setCropOpen(false);
          }}
        />
      ) : null}
    </NodeViewWrapper>
  );
}

function ResizeHandle({
  corner,
  onPointerDown,
}: {
  corner: 'left' | 'right';
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <span
      onPointerDown={onPointerDown}
      onMouseDown={(e) => e.preventDefault()}
      contentEditable={false}
      style={{
        position: 'absolute',
        bottom: -6,
        [corner === 'right' ? 'right' : 'left']: -6,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#fff',
        border: `2px solid ${TEAL}`,
        cursor: corner === 'right' ? 'nwse-resize' : 'nesw-resize',
        touchAction: 'none',
      }}
    />
  );
}

function AlignIcon({ align }: { align: ImageAlign }) {
  // Three short lines whose offset hints the alignment.
  const lines =
    align === 'left'
      ? [
          [3, 15],
          [3, 11],
          [3, 15],
        ]
      : align === 'right'
        ? [
            [6, 15],
            [10, 15],
            [6, 15],
          ]
        : [
            [4, 14],
            [6, 12],
            [4, 14],
          ];
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      {lines.map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={4 + i * 5} y2={4 + i * 5} />
      ))}
    </svg>
  );
}

export const ResizableImage = Image.extend<{
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
  onFloatImage?: (info: FloatImageInfo) => void;
}>({
  addOptions() {
    return {
      ...this.parent?.(),
      onFloatImage: undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        // width is folded into `style` by the node's renderHTML, so this
        // attribute does not emit its own HTML.
        parseHTML: (el) => {
          const raw = el.getAttribute('width') || (el as HTMLElement).style.width;
          const n = raw ? parseInt(raw, 10) : NaN;
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: () => ({}),
      },
      align: {
        default: 'center',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-align') || 'center',
        renderHTML: () => ({}),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const align = ((node.attrs.align as ImageAlign | null) ?? 'center') as ImageAlign;
    const width = (node.attrs.width as number | null) ?? null;
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style: layoutCss(align, width),
        'data-align': align,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
