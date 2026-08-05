import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';
import type { ParsedFrame } from './frame';
import { parseFrameCached } from './parse';
import { defaultFrameHtml } from './defaults';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Server-side resolution of a subject's stored page frame.
//
// One row per subject or nothing: resolution is a single keyed read of
// `worksheet_frame`, no global/subject inheritance, no active-version selection.
// Returns the frame HTML, or null when the subject has no uploaded frame — the
// caller then falls back to the built-in default page (the pane renders what it
// renders today). Runs through the caller's RLS-scoped client (read is open to any
// authenticated user under RLS); the service-role key is never used. Any read error
// resolves to null so a transient failure prints the built-in page, never throws.

/** Read a subject's uploaded frame HTML, or null when none / on error. */
export async function readWorksheetFrameHtml(
  supabase: ServerClient,
  subjectId: string | null,
): Promise<string | null> {
  if (!subjectId) return null;
  const { data, error } = await supabase
    .from('worksheet_frame')
    .select('html')
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (error || !data) return null;
  const html = (data as { html?: string | null }).html;
  return html && html.trim() ? html : null;
}

/**
 * Resolve the page frame a subject should render, PARSED and scoped ready for either
 * renderer: the subject's uploaded frame if it has one, else the built-in default for
 * its content language. Always returns a frame (the default guarantees every subject a
 * proper Alsama page). The parse is cached per distinct HTML, so a shared default is
 * transformed at most once per process. Runs through the caller's RLS-scoped client; a
 * transient read failure quietly falls back to the default, never throws.
 */
export async function resolveParsedFrame(
  supabase: ServerClient,
  subjectId: string | null,
  language: WorksheetContentLanguage,
): Promise<ParsedFrame> {
  const uploaded = await readWorksheetFrameHtml(supabase, subjectId);
  return parseFrameCached(uploaded ?? defaultFrameHtml(language));
}
