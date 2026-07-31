import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/context-docs/guard';

/**
 * POST /api/admin/context-docs/[id]/versions/[versionId]/activate
 *
 * Admin-only. Restore an existing version: flip `is_active` to it via the
 * `activate_ai_context_doc_version` RPC (0066). No new row is created, so version
 * numbers stay stable ("v2" always means the same text). The RPC deactivates the
 * current active version before activating the target — same one-active-per-doc
 * transaction constraint as replace. RLS client; the service-role key is never
 * used.
 */
export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id, versionId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('activate_ai_context_doc_version', {
    p_doc_id: id,
    p_version_id: versionId,
  });

  if (error) {
    const notFound = /not found/i.test(error.message ?? '');
    return NextResponse.json(
      { error: notFound ? 'Version not found.' : 'Could not restore the version. Please try again.' },
      { status: notFound ? 404 : 500 },
    );
  }

  return NextResponse.json({ version: data as number });
}
