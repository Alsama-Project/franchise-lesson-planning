import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/context-docs/guard';
import { composeContextStack, ContextStackError } from '@/lib/ai/context-stack';
import { toContentLanguage, type WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';
import { AI_CONTEXT_TOOLS } from '@/types/ai-context';
import type { AiContextLayer, AiContextPreviewPayload, AiContextPreviewTool } from '@/types/ai-context';

/**
 * GET /api/admin/context-docs/preview?subject_id=<uuid?>
 *
 * Admin-only, READ-ONLY. Returns the fully composed system prompt for each of the
 * four tools, straight from the real {@link composeContextStack} — never a
 * reimplementation, so if the composer changes, this preview changes with it (or
 * the build fails on the shared types).
 *
 * `subject_id` is optional: absent → the global-only stack (layer 3 empty);
 * present → that subject steers layers 3 and any per-subject tool overrides. The
 * subject's `content_language` is read once and threaded to the composer; only
 * `smartt_checker`'s floor consults it, but passing it uniformly is faithful and a
 * no-op for the other tools.
 *
 * FAIL CLOSED is surfaced, not hidden: the composer THROWS `ContextStackError` on
 * an empty or errored stack. Each tool is composed inside its own try/catch so one
 * unconfigured tool becomes an `ok: false` panel carrying the thrown message +
 * status, while the others still render. Any non-`ContextStackError` is unexpected
 * and propagates as a 500.
 *
 * Everything runs on the auth'd, cookie-bound RLS client (the composer's RPC is
 * security-definer); the service-role key is never used.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const rawSubjectId = request.nextUrl.searchParams.get('subject_id');
  const subjectId = rawSubjectId && rawSubjectId.trim().length > 0 ? rawSubjectId.trim() : null;

  // Read the subject's name + content_language once (reference table, admin-readable
  // under RLS). Only smartt_checker consults the language; the name is for the panel
  // header. No subject → the global stack, English feedback language.
  let subjectName: string | null = null;
  let contentLanguage: WorksheetContentLanguage = 'en';
  if (subjectId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('subjects')
      .select('name, content_language')
      .eq('id', subjectId)
      .maybeSingle();
    if (data) {
      const row = data as { name: unknown; content_language: unknown };
      subjectName = typeof row.name === 'string' ? row.name : null;
      contentLanguage = toContentLanguage(row.content_language);
    }
  }

  const tools: AiContextPreviewTool[] = [];
  for (const tool of AI_CONTEXT_TOOLS) {
    try {
      const composed = await composeContextStack({ tool, subjectId, contentLanguage });
      tools.push({
        tool,
        ok: true,
        system: composed.system,
        docsUsed: composed.docsUsed.map((d) => ({
          name: d.name,
          // `ContextDocUsed.layer` is the DB layer string; the composer only ever
          // emits the four board layers, so narrow to that union for the client.
          layer: d.layer as AiContextLayer,
          version: d.version,
        })),
      });
    } catch (err) {
      if (err instanceof ContextStackError) {
        tools.push({ tool, ok: false, error: err.message, status: err.status });
        continue;
      }
      throw err;
    }
  }

  const payload: AiContextPreviewPayload = { subjectId, subjectName, contentLanguage, tools };
  return NextResponse.json(payload);
}
