import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildResourceStoragePath } from '@/lib/resources/storage';
import { deriveMarkdownFilename, textAttachmentResponse } from '@/lib/download/text-attachment';

// Server helper for the private, admin-only `source-documents` bucket (migration
// 20260803140000) — where Branch 2a retains the ORIGINAL uploaded bytes for
// admin-uploaded documents. Every call here uses the caller's RLS-honouring
// client (the bucket's policies gate on public.is_admin()); the service-role key
// is never used.

/** The private, admin-only bucket holding retained original uploads. */
export const SOURCE_DOCUMENTS_BUCKET = 'source-documents';

/** Signed-URL TTL for original downloads. One hour, matching /api/resources/[id]/file
 *  — deliberately NOT the 10-year TTL used for inline worksheet images. */
export const SOURCE_DOCUMENTS_SIGNED_TTL_SECONDS = 60 * 60;

export type UploadSourceResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Upload a raw original `File` to `source-documents` with the RLS client (the
 * admin session's `auth.uid()` becomes the object owner; the bucket's
 * `source_documents_insert_admin` policy authorises it). Reuses the resource
 * bank's path convention — `${userId}/${uuid}-${safe}` — which is not coupled to
 * any bucket. Returns the object path on success.
 */
export async function uploadSourceDocument(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<UploadSourceResult> {
  const path = buildResourceStoragePath(userId, file.name);
  const { error } = await supabase.storage
    .from(SOURCE_DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/**
 * Best-effort rollback of an uploaded original after a subsequent DB write fails,
 * so a failed upload never leaks an orphaned object. Mirrors the orphan cleanup in
 * `uploadWorksheetImageAction`.
 */
export async function removeSourceDocument(
  supabase: SupabaseClient,
  path: string,
): Promise<void> {
  await supabase.storage.from(SOURCE_DOCUMENTS_BUCKET).remove([path]);
}

/**
 * Mint a short-lived signed URL for downloading a retained original, forcing a
 * save under `downloadName` (Supabase sets `Content-Disposition: attachment`).
 * Returns null if the object can't be signed (missing/removed).
 */
export async function signSourceDocumentDownloadUrl(
  supabase: SupabaseClient,
  path: string,
  downloadName: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SOURCE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SOURCE_DOCUMENTS_SIGNED_TTL_SECONDS, { download: downloadName });
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * The shared original-then-derived download fallback (Branch 2a/2b). When a
 * retained original exists, redirect to a short-lived signed URL that saves the
 * byte-identical original under its true filename; otherwise serve the derived
 * markdown as a `.md` attachment (Branch 1 behaviour). If signing the original
 * fails (e.g. the object was removed), fall through to the derived text rather
 * than error. Callers authorise first — this holds no auth logic.
 */
export async function originalOrDerivedDownload(
  supabase: SupabaseClient,
  opts: {
    /** Path of the retained original, or null → derived-only. */
    originalStoragePath: string | null;
    /** Original filename — the download name for the original AND the source for
     *  the derived `.md` name. */
    originalFilename: string | null;
    /** Stable slug for the derived filename fallback when no original name exists. */
    fallbackSlug: string;
    /** ISO timestamp of the version being served (derived-name fallback). */
    createdAt: string;
    /** The derived text to serve when no original is present. */
    derivedText: string;
  },
): Promise<Response> {
  if (opts.originalStoragePath) {
    const downloadName = opts.originalFilename?.trim() || 'source-document';
    const url = await signSourceDocumentDownloadUrl(supabase, opts.originalStoragePath, downloadName);
    if (url) {
      const redirect = NextResponse.redirect(url);
      redirect.headers.set('Cache-Control', 'no-store');
      return redirect;
    }
    // Signing failed (e.g. object removed) — fall through to the derived text.
  }

  const filename = deriveMarkdownFilename({
    originalFilename: opts.originalFilename,
    fallbackSlug: opts.fallbackSlug,
    createdAt: opts.createdAt,
  });
  return textAttachmentResponse(filename, opts.derivedText);
}
