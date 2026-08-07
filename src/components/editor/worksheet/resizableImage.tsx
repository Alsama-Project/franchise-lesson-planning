'use client';

// A resize-capable, alignable image for the worksheet editor.
//
// It extends the stock tiptap Image node with persisted attributes:
//   • width  — an explicit pixel width (null = natural), clamped on drag to the
//     page's text-column width so an image can never overflow the A4 page;
//   • align  — left | center | right. BLOCK positioning of a non-floating image
//     (margin-based); the following text sits BELOW it (no wrap);
//   • float  — none | left | right. When left/right the image floats against that
//     margin and adjacent text WRAPS beside it (Google-Docs "wrap text"). Distinct
//     from `align`, and overrides it while set. NOT free/absolute positioning —
//     margin-anchored float only.
//
// The React NodeView draws corner handles (resize, aspect-ratio preserved) and a
// layout control (block align · wrap left/right · full width) when the node is
// selected. `renderHTML` folds width + align + float into inline styles so the same
// look round-trips to the print/preview HTML (produced from the stored doc via
// `generateHTML`, NOT the NodeView).

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
import { worksheetImageAttributes, type ImageAlign, type ImageFloat } from './resizableImageAttrs';

export type { ImageAlign, ImageFloat } from './resizableImageAttrs';

/** Payload passed up when an inline image is converted to a free floating one. */
export interface FloatImageInfo {
  src: string;
  alt: string | null;
  w: number;
  h: number;
}

/** What the control-bar "Regenerate image" action asks the host to do: generate a
 *  FRESH image for this slot (optionally steered by a teacher comment) and hand back
 *  the new storage path, or null on failure/refusal. The exercise text is never
 *  touched — only this node's `storagePath` is swapped. `lesson_plan_id` / `subject_id`
 *  come from the host's context, never the node. */
export interface RegenerateImageArgs {
  slotId: string;
  brief: string | null;
  instruction: string;
}
export type RegenerateImageFn = (args: RegenerateImageArgs) => Promise<string | null>;

const MIN_WIDTH = 60;
const TEAL = '#1F7A6C';

/**
 * Wrapper layout for the (now inline) image. `float` (wrap) wins over everything. With
 * no float: an image ALONE in its paragraph is treated as a block band, so the block-
 * align controls (left / centre / right) behave exactly as before the inline switch; an
 * image sitting inline AMONG text flows with the line (`inline-block`), which is the
 * whole point of `inline: true` — an image beside a word.
 */
function wrapperLayout(align: ImageAlign, float: ImageFloat, aloneInBlock: boolean): CSSProperties {
  if (float === 'left') return { float: 'left', margin: '4px 18px 10px 0' };
  if (float === 'right') return { float: 'right', margin: '4px 0 10px 18px' };
  if (aloneInBlock) {
    if (align === 'left') return { float: 'none', display: 'block', margin: '12px auto 12px 0' };
    if (align === 'right') return { float: 'none', display: 'block', margin: '12px 0 12px auto' };
    return { float: 'none', display: 'block', margin: '12px auto' };
  }
  return { float: 'none', display: 'inline-block', verticalAlign: 'middle', margin: '0 4px' };
}

/** The same layout as inline-style strings, for the printable HTML. */
function layoutCss(align: ImageAlign, float: ImageFloat, width: number | null): string {
  const css: string[] = ['max-width:100%', 'height:auto', 'border-radius:8px'];
  if (width) css.push(`width:${width}px`);
  if (float === 'left') css.push('float:left', 'margin:4px 18px 10px 0');
  else if (float === 'right') css.push('float:right', 'margin:4px 0 10px 18px');
  else if (align === 'left') css.push('display:block', 'margin:12px auto 12px 0');
  else if (align === 'right') css.push('display:block', 'margin:12px 0 12px auto');
  else css.push('display:block', 'margin:12px auto');
  return css.join(';');
}

/**
 * The URL an image node renders from. A generated image carries a `storagePath`
 * (an object path in the private bucket) and is served through the auth'd,
 * re-signing GET /api/worksheet-image route — NEVER a persisted signed URL,
 * which would expire. A teacher-uploaded image has no `storagePath`, so its
 * existing `src` (a long-lived signed URL) passes through unchanged.
 *
 * Single-sourced here so the NodeView and the static renderHTML (the print /
 * generateHTML path) resolve identically and cannot drift.
 */
export function resolveImageSrc(src: string, storagePath: string | null): string {
  return storagePath
    ? `/api/worksheet-image?storage_path=${encodeURIComponent(storagePath)}`
    : src;
}

function ImageNodeView({ node, updateAttributes, deleteNode, selected, editor, extension, getPos }: NodeViewProps) {
  const t = useTranslations('worksheet');
  const src = node.attrs.src as string;
  const storagePath = (node.attrs.storagePath as string | null) ?? null;
  const alt = (node.attrs.alt as string | null) ?? '';
  const title = (node.attrs.title as string | null) ?? undefined;
  const width = (node.attrs.width as number | null) ?? null;
  const align = ((node.attrs.align as ImageAlign | null) ?? 'center') as ImageAlign;
  const float = ((node.attrs.float as ImageFloat | null) ?? 'none') as ImageFloat;
  const slotId = (node.attrs.slotId as string | null) ?? null;
  const brief = (node.attrs.brief as string | null) ?? null;

  // Is this image the ONLY child of its paragraph/heading? The node is inline now, so
  // block-only affordances (block align, full width) apply solely when the image is a
  // band of its own — never while it sits inline beside text. Resolving the parent from
  // the node's position is cheap and re-runs on every selection change (when the control
  // bar shows). Defaults to true if the position is momentarily unavailable, so a lone
  // image never briefly loses its align controls.
  let aloneInBlock = true;
  try {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos != null) {
      const parent = editor.state.doc.resolve(pos).parent;
      aloneInBlock =
        (parent.type.name === 'paragraph' || parent.type.name === 'heading') && parent.childCount === 1;
    }
  } catch {
    aloneInBlock = true;
  }

  const onFloat = (extension.options as { onFloatImage?: (info: FloatImageInfo) => void }).onFloatImage;
  const onRegenerateImage = (extension.options as { onRegenerateImage?: RegenerateImageFn }).onRegenerateImage;
  // A generated image (has a slot + a brief to regenerate from) can be regenerated in
  // place when the host wires it. A pre-`brief` node (older compile) hides the control
  // rather than 400 on a missing brief — that image regenerates via its exercise.
  const canRegen = !!onRegenerateImage && !!slotId && !!brief;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const latestWidth = useRef<number | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  // Per-image regenerate (control-bar): an optional comment steers a FRESH generation
  // for this one slot; on success only this node's storagePath swaps — the exercise
  // text and every other node are untouched.
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenErr, setRegenErr] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const runRegen = async () => {
    if (!onRegenerateImage || !slotId || regenBusy) return;
    setRegenBusy(true);
    setRegenErr(null);
    try {
      const path = await onRegenerateImage({ slotId, brief, instruction: comment.trim() });
      if (path) {
        // Swap only this node's source (src cleared so resolveImageSrc re-signs from the
        // new path). One editor edit → the existing debounce persists it.
        updateAttributes({ storagePath: path, src: null });
        setRegenOpen(false);
        setComment('');
      } else {
        setRegenErr(t('image.regenFailed'));
      }
    } catch (e) {
      setRegenErr(e instanceof Error ? e.message : t('image.regenFailed'));
    } finally {
      setRegenBusy(false);
    }
  };

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
    // Match BOTH the v3 (.ws-doc) and legacy (.worksheet-doc) editor classes — the
    // v3 class was missing here, which pinned maxWidth to the start width and stopped
    // images from being resized LARGER.
    const column = wrapperRef.current?.closest('.ws-doc, .worksheet-doc') as HTMLElement | null;
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
      as="span"
      ref={wrapperRef}
      className="ws-img-nv"
      data-align={align}
      data-float={float}
      style={{
        position: 'relative',
        maxWidth: '100%',
        width: displayWidth ? `${displayWidth}px` : 'fit-content',
        ...wrapperLayout(align, float, aloneInBlock),
      }}
    >
      {/* The image is the drag handle for snap-into-flow reorder. A tiptap React
          NodeView is NOT draggable from `draggable: true` alone — its `onDragStart`
          bails unless the drag starts inside a `[data-drag-handle]` element. Putting
          the handle on the <img> (not the wrapper) makes the image the natural grab
          point while leaving the resize corners — siblings of the <img>, outside the
          handle — and adjacent text selection untouched. `draggable` is left at the
          img default (true) so the browser starts the native drag on the img itself,
          so `dragstart.target` is the img and the handle is found; ProseMirror then
          moves the node and Dropcursor shows where it lands. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={resolveImageSrc(src, storagePath)}
        alt={alt}
        title={title}
        data-drag-handle=""
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
            {/* Wrap text (float) — image sits at the margin, text flows beside it */}
            {(['left', 'right'] as const).map((dir) => (
              <button
                key={`wrap-${dir}`}
                type="button"
                title={dir === 'left' ? t('image.wrapLeft') : t('image.wrapRight')}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => updateAttributes({ float: dir })}
                style={ctrlBtn(float === dir)}
              >
                <WrapIcon dir={dir} />
              </button>
            ))}
            {/* Block align + full width are BLOCK affordances — they only make sense
                when the image is a band of its own. Hidden while it sits inline beside
                text (where only wrap/float, resize, crop and regenerate apply). */}
            {aloneInBlock ? (
              <>
                <span style={{ width: 1, height: 18, background: '#E0EAE7', margin: '0 2px', alignSelf: 'center' }} />
                {/* Block align (no wrap): position the image; text sits below it */}
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    title={t(`image.align${a[0].toUpperCase()}${a.slice(1)}`)}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => updateAttributes({ align: a, float: 'none' })}
                    style={ctrlBtn(float === 'none' && align === a)}
                  >
                    <AlignIcon align={a} />
                  </button>
                ))}
                <span style={{ width: 1, height: 18, background: '#E0EAE7', margin: '0 2px', alignSelf: 'center' }} />
                {/* Full width — span the whole text column */}
                <button
                  type="button"
                  title={t('image.fullWidth')}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    const col = wrapperRef.current?.closest('.ws-doc, .worksheet-doc') as HTMLElement | null;
                    updateAttributes({ width: col?.clientWidth ?? null, float: 'none', align: 'center' });
                  }}
                  style={ctrlBtn(false)}
                >
                  <FullWidthIcon />
                </button>
              </>
            ) : null}
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
            {/* Regenerate this image — a FRESH generation for this slot, optionally
                steered by a comment. Replaces only this image; the exercise is untouched. */}
            {canRegen ? (
              <>
                <span style={{ width: 1, height: 18, background: '#E0EAE7', margin: '0 2px', alignSelf: 'center' }} />
                <button
                  type="button"
                  title={t('image.regenerate')}
                  aria-label={t('image.regenerate')}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    setRegenErr(null);
                    setRegenOpen((o) => !o);
                  }}
                  style={ctrlBtn(regenOpen)}
                >
                  {regenBusy ? (
                    <svg className="ws-ex-regen-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
                  )}
                </button>
              </>
            ) : null}
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

          {/* Regenerate comment field — optional. Empty comment regenerates plainly. */}
          {regenOpen && canRegen ? (
            <div
              contentEditable={false}
              onMouseDown={(ev) => ev.stopPropagation()}
              style={{
                position: 'absolute',
                top: 40,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 5,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                width: 280,
                maxWidth: '90%',
                padding: 10,
                background: '#fff',
                border: '1px solid #CFE6E0',
                borderRadius: 10,
                boxShadow: '0 10px 28px -12px rgba(40,30,20,0.45)',
              }}
            >
              <input
                type="text"
                value={comment}
                autoFocus
                disabled={regenBusy}
                placeholder={t('image.regenComment')}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runRegen();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setRegenOpen(false);
                  }
                }}
                style={{
                  fontSize: 13,
                  padding: '7px 9px',
                  borderRadius: 8,
                  border: '1px solid var(--color-neutral-200)',
                  outline: 'none',
                  color: 'var(--color-ink)',
                }}
              />
              {regenErr ? <span style={{ fontSize: 12, color: '#B23A2E' }}>{regenErr}</span> : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button
                  type="button"
                  disabled={regenBusy}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => void runRegen()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#1F7A6C',
                    color: '#fff',
                    cursor: regenBusy ? 'default' : 'pointer',
                    opacity: regenBusy ? 0.7 : 1,
                  }}
                >
                  {regenBusy ? (
                    <svg className="ws-ex-regen-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
                  ) : null}
                  {t('image.regenSubmit')}
                </button>
              </div>
            </div>
          ) : null}

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

/** Shared style for the image control-bar buttons. */
function ctrlBtn(active: boolean): CSSProperties {
  return {
    width: 26,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    background: active ? '#E4F0ED' : 'transparent',
    color: active ? '#186155' : '#5C544E',
  };
}

/** Text-wrap (float) icon: a small image box against one edge with text lines beside. */
function WrapIcon({ dir }: { dir: 'left' | 'right' }) {
  const boxX = dir === 'left' ? 2 : 9;
  const linesX = dir === 'left' ? 9 : 2;
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x={boxX} y="3" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
      <line x1={linesX} x2={linesX + 5} y1="4" y2="4" />
      <line x1={linesX} x2={linesX + 5} y1="7" y2="7" />
      <line x1="2" x2="14" y1="11" y2="11" />
      <line x1="2" x2="14" y1="13.5" y2="13.5" />
    </svg>
  );
}

/** Full-width icon: a wide filled bar spanning the column. */
function FullWidthIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="5" width="12" height="6" rx="1" fill="currentColor" stroke="none" />
      <line x1="1.5" x2="1.5" y1="3" y2="13" />
      <line x1="14.5" x2="14.5" y1="3" y2="13" />
    </svg>
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
  onRegenerateImage?: RegenerateImageFn;
}>({
  addOptions() {
    return {
      ...this.parent?.(),
      onFloatImage: undefined,
      onRegenerateImage: undefined,
    };
  },

  addAttributes() {
    // The extra worksheet attributes (width/align/float/storagePath/slotId/brief) live
    // in the DOM-free `resizableImageAttrs` module so the round-trip test can build the
    // SAME schema and prove storagePath/slotId/brief survive getJSON.
    return {
      ...this.parent?.(),
      ...worksheetImageAttributes(),
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const align = ((node.attrs.align as ImageAlign | null) ?? 'center') as ImageAlign;
    const float = ((node.attrs.float as ImageFloat | null) ?? 'none') as ImageFloat;
    const width = (node.attrs.width as number | null) ?? null;
    const storagePath = (node.attrs.storagePath as string | null) ?? null;
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        // storagePath wins when set (served via the re-signing route); otherwise the
        // node's own src passes through unchanged. Overrides the src that the parent
        // Image attribute placed into HTMLAttributes.
        src: resolveImageSrc((node.attrs.src as string) ?? '', storagePath),
        style: layoutCss(align, float, width),
        'data-align': align,
        'data-float': float,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
