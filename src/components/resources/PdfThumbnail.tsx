'use client';

// Renders the first page of a PDF to a <canvas> as a card thumbnail, using
// pdfjs-dist. Client-only by nature (canvas + a Web Worker), so it must be
// dynamically imported with { ssr: false } by its consumer.
//
// Cost control: a grid of these is expensive, so each one renders only once it
// scrolls into view (IntersectionObserver) and only once (cached on the element
// via React state). Any failure calls onError so the card can fall back to the
// flat placeholder rather than showing a broken thumbnail.

import { useEffect, useRef, useState } from 'react';

interface PdfThumbnailProps {
  /** URL to fetch the PDF from (signed-URL route or external link). */
  src: string;
  /** Called once the first page is painted, so the placeholder can be hidden. */
  onReady?: () => void;
  /** Called on any load/render failure, so the card can fall back. */
  onError?: () => void;
}

export function PdfThumbnail({ src, onReady, onError }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);

  // Reveal when scrolled near the viewport; render only then.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      try {
        // Import inside the effect so pdfjs never loads on the server or before
        // the card is in view.
        const pdfjs = await import('pdfjs-dist');
        // Bundle the worker as an asset URL — works under both Turbopack and
        // Webpack and needs no network / public-dir copy.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const doc = await pdfjs.getDocument({ url: src }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) {
          doc.destroy();
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          doc.destroy();
          onError?.();
          return;
        }

        // Fit the first page to the canvas width at a crisp device-pixel ratio.
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = canvas.clientWidth || 240;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (targetWidth / baseViewport.width) * dpr;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        doc.destroy();
        if (!cancelled) onReady?.();
      } catch {
        if (!cancelled) onError?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, src, onReady, onError]);

  return <canvas ref={canvasRef} className="h-full w-full object-cover object-top" aria-hidden />;
}

export default PdfThumbnail;
