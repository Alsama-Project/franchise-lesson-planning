import 'server-only';

// Turn a piece of text into a downloadable HTTP response. Single responsibility:
// this holds NO auth logic and knows nothing about which document it is serving —
// callers authorise first, resolve the text + filename, then hand both here.
//
// This is the FIRST `attachment` Content-Disposition in the app. The only other
// disposition in the codebase is the `inline` one in src/lib/pdf/render.ts, which
// this deliberately does not touch. Downloads are `no-store` (the served text is
// the current version and RLS-scoped, so it must never be cached).

const CONTENT_TYPE = 'text/markdown; charset=utf-8';

/**
 * Build a `Content-Disposition: attachment` value that survives non-ASCII
 * filenames (Arabic, spaces). Emits BOTH forms per RFC 6266:
 *   - an ASCII-only `filename="..."` fallback for legacy agents, and
 *   - a `filename*=UTF-8''<percent-encoded>` that carries the real name.
 * The UTF-8 form is never downgraded to ASCII — only the fallback is.
 */
function contentDisposition(filename: string): string {
  // ASCII fallback: drop anything outside printable ASCII, and neutralise the
  // two characters that would break the quoted-string ("\ and ").
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');

  // RFC 5987 ext-value: encodeURIComponent leaves *, ', ( and ) unescaped, but
  // they are not valid attr-chars — percent-encode them explicitly.
  const utf8 = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8}`;
}

/**
 * Wrap text as an attachment download. `filename` is used verbatim (already
 * derived by {@link deriveMarkdownFilename}); `body` is the exact stored text.
 */
export function textAttachmentResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': CONTENT_TYPE,
      'Cache-Control': 'no-store',
      'Content-Disposition': contentDisposition(filename),
    },
  });
}

/** Lowercase ASCII slug; non-alphanumerics collapse to single dashes. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The shared filename rule, applied identically across every download surface:
 *
 *   - Take `originalFilename`, strip its extension, append `.md`.
 *   - If it is null/empty, fall back to `<slug>-<YYYY-MM-DD>.md`, where the slug
 *     is a stable slug of the document/guide identifier and the date is the
 *     version's `createdAt`.
 *
 * The served body is markdown either way (that is what is stored and what the AI
 * consumes), so the extension is always `.md`.
 */
export function deriveMarkdownFilename(input: {
  originalFilename: string | null | undefined;
  /** Stable identifier used only for the no-filename fallback. */
  fallbackSlug: string;
  /** ISO timestamp of the version being served. */
  createdAt: string;
}): string {
  const original = input.originalFilename?.trim();
  if (original) {
    const base = original.replace(/\.[^./\\]+$/, '');
    return `${base || original}.md`;
  }

  const date = /^\d{4}-\d{2}-\d{2}/.test(input.createdAt)
    ? input.createdAt.slice(0, 10)
    : new Date(input.createdAt).toISOString().slice(0, 10);
  const slug = slugify(input.fallbackSlug) || 'document';
  return `${slug}-${date}.md`;
}
