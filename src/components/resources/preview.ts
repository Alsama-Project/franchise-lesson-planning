// Inline-preview helpers for the Resource Bank. A resource is previewable when
// it's an image or a PDF — detected from the file extension (the original
// filename is preserved as the suffix of `file_path`, see buildStoragePath in
// src/lib/resources) or, for link-backed resources, the URL extension, with the
// `format` tag as a secondary hint. Anything else (e.g. .docx, a bare link)
// falls back to the flat format-coloured placeholder.

import type { ResourceWithTags } from '@/types/resource';
import { resourceView } from '@/components/resources/presentation';

export type PreviewKind = 'image' | 'pdf';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

/** Lower-cased file extension (no dot) from a path or URL, or '' if none. */
function extensionOf(pathOrUrl: string): string {
  // Strip any query/hash first so `photo.png?token=…` still reads as `png`.
  const clean = pathOrUrl.split(/[?#]/)[0];
  const lastSegment = clean.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot < 0 || dot === lastSegment.length - 1) return '';
  return lastSegment.slice(dot + 1).toLowerCase();
}

/**
 * Classify a resource for inline preview. Returns 'image' / 'pdf' when it can be
 * rendered inline, or null to use the placeholder. Extension is the primary
 * signal; the format tag breaks ties when an extension is absent (e.g. a signed
 * link with no path extension).
 */
export function previewKind(resource: ResourceWithTags): PreviewKind | null {
  const source = resource.external_url ?? resource.file_path ?? '';
  const ext = extensionOf(source);
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';

  // No usable extension: fall back to the curated format tag, but only for
  // file-backed resources (a bare external link to e.g. a Google Doc isn't a
  // raw image/PDF we can embed even if its format tag says "Image").
  if (ext === '' && resource.file_path) {
    const format = resourceView(resource).formatLabel;
    if (format === 'PDF') return 'pdf';
    if (format === 'Image') return 'image';
  }
  return null;
}

/**
 * The URL to source the preview from. For bucket files this is the server route
 * that mints a short-lived signed URL and redirects to it inline (keeps signed
 * URLs server-side and RLS-scoped); for link resources it's the external URL.
 */
export function previewSrc(resource: ResourceWithTags): string {
  if (resource.external_url) return resource.external_url;
  return `/api/resources/${resource.id}/file`;
}
