// Server-side extraction of a file-backed resource's TEXT content as HTML, used
// to seed an editable worksheet free block when a teacher adds a "rich text"
// resource from the bank. Mammoth (.docx → semantic HTML) is server-only, so the
// conversion must run here; the client receives plain HTML and parses it into the
// worksheet's tiptap schema (which keeps only schema nodes, dropping anything
// unsafe). Images embedded in a .docx are dropped — the worksheet's image
// elements come from IMG/PDF resources, not from inline Word pictures.

import 'server-only';
import mammoth from 'mammoth';
import { createClient } from '@/lib/supabase/server';
import { getResource } from './resources';
import { markdownToHtml } from '@/lib/editor/markdown';

const STORAGE_BUCKET = 'resources';

/** Lower-cased file extension of a storage path (no leading dot). */
function extensionOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

/** Strip every <img> tag so no broken/empty image survives into the doc. */
function stripImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, '');
}

export interface ResourceTextContent {
  html: string;
}

/**
 * Extract a file-backed resource's text as an HTML fragment suitable for seeding
 * a worksheet free block. Supports Word (.docx) via mammoth and plain
 * text/markdown/HTML files; returns null for binary or unsupported formats (the
 * caller then falls back to a titled link/file block).
 */
export async function getResourceTextHtml(
  resourceId: string,
): Promise<ResourceTextContent | null> {
  const resource = await getResource(resourceId);
  if (!resource || !resource.file_path) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(resource.file_path);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = extensionOf(resource.file_path);

  if (ext === 'docx') {
    // Drop images at the converter, then belt-and-braces strip any that survive.
    const { value } = await mammoth.convertToHtml(
      { buffer },
      { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
    );
    const html = stripImages((value ?? '').trim());
    if (html) return { html };
    // Fallback to raw text extraction for oddly-authored docs.
    const { value: raw } = await mammoth.extractRawText({ buffer });
    return raw.trim() ? { html: markdownToHtml(raw.trim()) } : null;
  }

  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'csv') {
    const text = buffer.toString('utf8').trim();
    return text ? { html: markdownToHtml(text) } : null;
  }

  if (ext === 'html' || ext === 'htm') {
    const html = stripImages(buffer.toString('utf8').trim());
    return html ? { html } : null;
  }

  // Binary formats we can't read as text here (.rtf, .odt, legacy .doc, etc.).
  return null;
}
