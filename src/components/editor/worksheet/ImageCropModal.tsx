'use client';

// Crop UI for an inserted worksheet image. Opened from the selected image's
// control strip (alongside align / resize / float). The teacher drags a freeform
// selection rectangle over the image; on confirm we convert the selection (which
// react-image-crop reports relative to the rendered <img>) into the image's
// natural-pixel coordinates, draw those pixels to a canvas, upload the result via
// the existing Storage util, and hand the new URL back so the caller can swap the
// node's `src`. The image loads crossorigin so the canvas export isn't tainted.

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { type Crop, type PixelCrop as RICPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { cropImageToBlob } from '@/lib/editor/crop-image';
import { uploadWorksheetImageBlob } from '@/lib/editor/worksheet-image';

const TEAL = '#1F7A6C';

/**
 * Convert a selection expressed in the rendered image's CSS pixels into the
 * source image's natural pixels, so the canvas crop matches the full-resolution
 * source rather than the on-screen (possibly downscaled) preview.
 */
function toNaturalPixels(crop: RICPixelCrop, img: HTMLImageElement) {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  return {
    x: crop.x * scaleX,
    y: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

export function ImageCropModal({
  src,
  alt,
  onCancel,
  onCropped,
}: {
  src: string;
  alt: string;
  /** Close without changing the image. */
  onCancel: () => void;
  /** A new cropped image was uploaded; swap the node to this URL. */
  onCropped: (url: string) => void;
}) {
  // crop = the live selection (display px); completed = the settled selection
  // used for the actual export.
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<RICPixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Default the selection to the whole image so a teacher can immediately drag
  // the edges inward rather than having to draw a rectangle from scratch.
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const initial: Crop = { unit: '%', x: 0, y: 0, width: 100, height: 100 };
    setCrop(initial);
    setCompleted({
      unit: 'px',
      x: 0,
      y: 0,
      width: img.width,
      height: img.height,
    });
  }, []);

  const confirm = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !completed || completed.width < 1 || completed.height < 1) {
      setError('Drag to select a crop area first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const natural = toNaturalPixels(completed, img);
      const blob = await cropImageToBlob(src, natural);
      const url = await uploadWorksheetImageBlob(blob, 'cropped.png');
      if (!url) {
        setError('Could not upload the cropped image. Try again.');
        return;
      }
      onCropped(url);
    } catch {
      setError('Could not crop this image. Try again.');
    } finally {
      setBusy(false);
    }
  }, [completed, src, onCropped]);

  if (typeof document === 'undefined') return null;

  // Portal to <body>: the worksheet canvas is CSS-transformed (zoom) and
  // overflow-hidden, which would otherwise reposition/clip a fixed overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(20,16,12,0.72)' }} />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 24px 60px -20px rgba(20,16,12,0.6)',
          padding: 18,
          maxWidth: 'min(92vw, 760px)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#2A2422' }}>Crop image</span>
          <span style={{ fontSize: 12, color: '#8A8178' }}>Drag the edges to trim, then apply.</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', overflow: 'auto', background: '#F6F2EC', borderRadius: 10, padding: 12 }}>
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompleted(c)}
            keepSelection
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              crossOrigin="anonymous"
              onLoad={onImageLoad}
              style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }}
            />
          </ReactCrop>
        </div>

        {error ? <div style={{ fontSize: 12.5, color: '#B62A5C' }}>{error}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#5C544E', background: '#fff', border: '1px solid #DDD4C8', padding: '8px 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#fff', background: TEAL, border: 'none', padding: '8px 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', boxShadow: '0 6px 16px -8px rgba(31,122,108,0.6)' }}
          >
            {busy ? 'Applying…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
