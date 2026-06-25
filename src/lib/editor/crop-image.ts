'use client';

// Produce a REAL cropped image (not a CSS crop) for the worksheet editor.
//
// The crop modal (react-image-crop) hands us the chosen region converted to the
// source image's own natural pixels (`PixelCrop`). We load the source through a
// crossorigin-enabled <img> (Supabase Storage serves the `resources` bucket with
// permissive CORS, so the canvas is not tainted), draw just that region onto a
// canvas sized to the crop, and export a PNG/JPEG blob. The caller uploads the
// blob via the existing Storage util and swaps the image node's `src` — so the
// crop is baked into a new file that renders identically in the editor and in the
// print/PDF export. A CSS crop would not survive that export, which is why this
// draws real pixels.

/** A crop region in the source image's natural pixel coordinates. */
export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image for cropping.'));
    // Cache-bust so a previously cached non-CORS response can't taint the canvas.
    img.src = src.includes('?') ? `${src}&_crop=1` : `${src}?_crop=1`;
  });
}

/**
 * Draw `crop` (source-pixel region) onto a canvas and export it as a Blob.
 * `mimeType` defaults to PNG to keep transparency and avoid recompression
 * artifacts; pass the original type when a JPEG round-trip is preferable.
 */
export async function cropImageToBlob(
  src: string,
  crop: PixelCrop,
  mimeType = 'image/png',
): Promise<Blob> {
  const img = await loadCrossOriginImage(src);

  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available for cropping.');

  ctx.drawImage(
    img,
    Math.round(crop.x),
    Math.round(crop.y),
    width,
    height,
    0,
    0,
    width,
    height,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined),
  );
  if (!blob) throw new Error('Could not export the cropped image.');
  return blob;
}
