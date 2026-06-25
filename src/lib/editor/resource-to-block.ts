'use client';

// Turn a bank resource into one or more EDITABLE worksheet free blocks — the same
// block a teacher builds by hand — populated with a COPY of the resource's
// content. Nothing here references the saved bank resource after the copy: the
// returned blocks own their own text and image URLs, so later edits stay local to
// the lesson's worksheet and never touch the resource.
//
// Content handling by format:
//   • IMG  → a free block with the image as a centred, resizable/movable inline
//            image element (the bytes are re-uploaded to the worksheet's storage).
//   • PDF  → a free block with one inline image per rendered page (pdf.js).
//   • DOC/text → a free block whose rich text is the converted document content.
//   • LINK/other → a free block seeded with the title (+ link/description text).

import { generateJSON, type JSONContent } from '@tiptap/core';
import type { ResourceWithTags } from '@/types/resource';
import type { WorksheetDoc, WorksheetFreeBlock } from '@/types/lesson';
import { newBlockId } from '@/lib/editor/worksheet';
import { worksheetEditorExtensions } from '@/components/editor/worksheet/editorExtensions';
import { resourceFormat } from '@/components/editor/worksheet/resourceFormat';
import {
  getDownloadUrlAction,
  getResourceTextHtmlAction,
} from '@/lib/actions/resources';
import { uploadWorksheetImageBlob } from './worksheet-image';
import { renderPdfToPngBlobs } from './pdf-to-images';

// The worksheet text-column width (the free block's content box). Inline images
// are capped to this so a wide image opens at a sensible size; `max-width:100%`
// in the image render keeps it inside the page regardless.
const CONTENT_WIDTH = 590;

/** Natural pixel size of an image URL (falls back to a sensible default). */
function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || CONTENT_WIDTH, h: img.naturalHeight || 480 });
    img.onerror = () => resolve({ w: CONTENT_WIDTH, h: 480 });
    img.src = src;
  });
}

/** Wrap a tiptap doc as a fresh, editable free block. */
function freeBlock(doc: WorksheetDoc | null): WorksheetFreeBlock {
  return { id: newBlockId(), kind: 'free', doc, fromAI: false, elements: [] };
}

/** A centred inline image node (resizable + floatable in the editor). */
function imageNode(src: string, alt: string | null, width: number): JSONContent {
  return { type: 'image', attrs: { src, alt, width: Math.round(width), align: 'center' } };
}

/** A heading node carrying the resource title. */
function headingNode(text: string): JSONContent {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] };
}

/** A plain paragraph node (empty content omits the node). */
function paragraphNode(text: string): JSONContent | null {
  const value = text.trim();
  if (!value) return null;
  return { type: 'paragraph', content: [{ type: 'text', text: value }] };
}

/** Assemble a doc from top-level nodes, dropping any nulls. */
function doc(nodes: Array<JSONContent | null>): WorksheetDoc {
  return { type: 'doc', content: nodes.filter((n): n is JSONContent => n !== null) } as WorksheetDoc;
}

/** A safe, ASCII-ish file name stem for an uploaded copy. */
function fileStem(resource: ResourceWithTags): string {
  const base = resource.title || 'resource';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'resource';
}

/** Parse an HTML fragment into the worksheet's tiptap schema (drops unsafe nodes). */
function docFromHtml(html: string): WorksheetDoc {
  return generateJSON(html, worksheetEditorExtensions()) as WorksheetDoc;
}

/** Fetch a file-backed resource's bytes via a short-lived signed URL. */
async function fetchResourceBytes(filePath: string): Promise<Blob | null> {
  const url = await getDownloadUrlAction(filePath);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Title + optional link/description fallback (for links and unreadable files). */
function fallbackDoc(resource: ResourceWithTags): WorksheetDoc {
  return doc([
    headingNode(resource.title),
    paragraphNode(resource.description ?? ''),
    paragraphNode(resource.external_url ?? ''),
  ]);
}

/**
 * Build the editable free block(s) for a bank resource. Always returns at least
 * one block; on any copy/conversion failure it falls back to a titled text block
 * so adding a resource never silently does nothing.
 */
export async function buildBlocksFromResource(
  resource: ResourceWithTags,
): Promise<WorksheetFreeBlock[]> {
  const format = resourceFormat(resource);

  // Image / screenshot → copy the bytes into the worksheet and embed inline.
  if (format === 'IMG' && resource.file_path) {
    const blob = await fetchResourceBytes(resource.file_path);
    if (blob) {
      const url = await uploadWorksheetImageBlob(blob, `${fileStem(resource)}.png`);
      if (url) {
        const size = await loadImageSize(url);
        const width = Math.min(size.w, CONTENT_WIDTH);
        return [freeBlock(doc([imageNode(url, resource.title, width)]))];
      }
    }
  }

  // PDF → render each page to an image and embed them stacked in one block.
  if (format === 'PDF' && resource.file_path) {
    const blob = await fetchResourceBytes(resource.file_path);
    if (blob) {
      const pages = await renderPdfToPngBlobs(await blob.arrayBuffer());
      const urls: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const url = await uploadWorksheetImageBlob(pages[i], `${fileStem(resource)}-p${i + 1}.png`);
        if (url) urls.push(url);
      }
      if (urls.length > 0) {
        return [
          freeBlock(
            doc(urls.map((url, i) => imageNode(url, `${resource.title} — page ${i + 1}`, CONTENT_WIDTH))),
          ),
        ];
      }
    }
  }

  // Text / rich content → convert the document to rich text.
  if (format === 'DOC' && resource.file_path) {
    const text = await getResourceTextHtmlAction(resource.id);
    if (text && text.html.trim()) {
      return [freeBlock(docFromHtml(text.html))];
    }
  }

  // Links and anything we couldn't copy → a titled, editable text block.
  return [freeBlock(fallbackDoc(resource))];
}
