import 'server-only';
import { docxToMarkdown } from '@/lib/ai/docx';

// Shared upload → markdown resolution for the admin context-doc routes (create +
// replace). Mirrors POST /api/ai-resource-guide EXACTLY: same accepted types
// (.md / .txt read verbatim, .docx via mammoth+turndown with images dropped) and
// the same size caps. Extracted here so both routes share one implementation
// without touching src/lib/ai/* (docxToMarkdown is imported, not modified).

/** Max accepted document size. Each doc is composed into AI calls, so a runaway
 *  upload would bloat the prompt; 256 KB is generous for prose. */
export const MAX_BYTES = 256 * 1024;

/** Raw upload bound for a `.docx` (which may carry images we discard). Only caps
 *  what the parser ingests; the extracted text is held to {@link MAX_BYTES}. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const TEXT_EXTENSIONS = ['.md', '.txt'] as const;
const DOCX_EXTENSION = '.docx';
const DOCX_MIMETYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** All accepted extensions, for the file-type error message. */
export const ALLOWED_EXTENSIONS = [...TEXT_EXTENSIONS, DOCX_EXTENSION] as const;

/** A resolved upload, or a ready-to-return error with an HTTP status + message. */
export type ParsedUpload =
  | { ok: true; text: string; filename: string }
  | { ok: false; status: number; error: string };

/**
 * Read a multipart `file` field and resolve it to the stored markdown, applying
 * the shared type + size validation. Returns a discriminated result so the caller
 * maps `{ status, error }` straight onto a NextResponse. Never throws for the
 * expected failure modes (missing file, wrong type, too large, unreadable docx,
 * empty text).
 */
export async function parseUploadedDoc(form: FormData): Promise<ParsedUpload> {
  const candidate = form.get('file');
  if (!(candidate instanceof File)) {
    return { ok: false, status: 400, error: 'No file provided.' };
  }
  const file = candidate;

  const name = file.name.toLowerCase();
  const isDocx = name.endsWith(DOCX_EXTENSION) || file.type === DOCX_MIMETYPE;
  const isText = TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!isDocx && !isText) {
    return {
      ok: false,
      status: 400,
      error: `Unsupported file type. Upload a ${ALLOWED_EXTENSIONS.join(', ')} file.`,
    };
  }

  // Bound the parser's input. Text docs are small; a .docx gets a roomier raw cap
  // (images are dropped) — the real limit is applied to the extracted text below.
  const rawCap = isDocx ? MAX_UPLOAD_BYTES : MAX_BYTES;
  if (file.size > rawCap) {
    return { ok: false, status: 400, error: `File is too large (max ${Math.round(rawCap / 1024)} KB).` };
  }

  let text: string;
  if (isDocx) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = (await docxToMarkdown(buffer)).trim();
    } catch {
      return {
        ok: false,
        status: 400,
        error: 'Could not read the Word document. Please check the file and try again.',
      };
    }
  } else {
    text = (await file.text()).trim();
  }

  if (text.length === 0) {
    return { ok: false, status: 400, error: 'The document is empty.' };
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `Document text is too large (max ${Math.round(MAX_BYTES / 1024)} KB).`,
    };
  }

  return { ok: true, text, filename: file.name };
}
