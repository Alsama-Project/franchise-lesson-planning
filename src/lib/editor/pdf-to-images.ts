'use client';

// In-browser PDF → page-image rendering, used when a teacher adds a PDF resource
// from the bank: each page is rasterised to a PNG so it can live in a worksheet
// free block as a normal editable image element. This is RENDERING an existing
// PDF (pdf.js) — distinct from @react-pdf/renderer, which the app uses to EXPORT
// a plan to PDF.
//
// pdf.js and its worker are loaded lazily (dynamic import) the first time a PDF is
// added, so nothing PDF-related is pulled into the SSR bundle or the common path.

// Target raster width for a page (CSS px). Pages are rendered at the scale that
// hits this width, capped so a high-DPI page doesn't blow past the upload size
// budget. ~1500px keeps an A4 page crisp on screen and in print.
const TARGET_PAGE_WIDTH = 1500;
const MAX_SCALE = 2.5;
// Guard against accidentally rasterising a huge document into the worksheet.
const MAX_PAGES = 30;

/**
 * Render up to {@link MAX_PAGES} pages of a PDF to PNG blobs (one per page).
 * Returns an empty array if the document can't be opened or has no pages.
 */
export async function renderPdfToPngBlobs(data: ArrayBuffer): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist');
  // The worker URL is resolved by the bundler from the installed package.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const pdf = await pdfjs.getDocument({ data }).promise;
  const count = Math.min(pdf.numPages, MAX_PAGES);
  const blobs: Blob[] = [];

  for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_SCALE, TARGET_PAGE_WIDTH / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) continue;
    // White backdrop so transparent PDFs don't render with a black background.
    canvasContext.fillStyle = '#ffffff';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (blob) blobs.push(blob);
  }

  await pdf.destroy();
  return blobs;
}
