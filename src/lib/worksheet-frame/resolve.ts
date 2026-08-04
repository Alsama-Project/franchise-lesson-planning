import 'server-only';
import type { createClient } from '@/lib/supabase/server';

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
