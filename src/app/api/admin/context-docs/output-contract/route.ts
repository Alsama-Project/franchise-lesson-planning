import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/context-docs/guard';
import { OUTPUT_CONTRACT } from '@/lib/ai/floor';
import { AI_CONTEXT_TOOLS, type AiContextTool } from '@/types/ai-context';

/**
 * GET /api/admin/context-docs/output-contract?tool=<tool>
 *
 * Admin-only. Returns the read-only OUTPUT CONTRACT text for one tool — the half of
 * the code FLOOR that stays locked in code (`@/lib/ai/floor` `OUTPUT_CONTRACT`),
 * as opposed to the editable safeguarding half that lives in `ai_context_doc`.
 *
 * There is nothing here to edit: this endpoint only surfaces the exact text the
 * admin board's read-only "Output contract" view shows, so an admin can see what
 * each tool must always return. No database access — the text is a code constant.
 * Gated by the same `requireAdmin()` as the other context-doc routes.
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const tool = request.nextUrl.searchParams.get('tool');
  if (!tool || !AI_CONTEXT_TOOLS.includes(tool as AiContextTool)) {
    return NextResponse.json({ error: 'A valid tool is required.' }, { status: 400 });
  }

  return NextResponse.json({ tool, text: OUTPUT_CONTRACT[tool as AiContextTool] });
}
