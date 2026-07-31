import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/context-docs/guard';

/**
 * PATCH /api/admin/context-docs/[id]
 *
 * Admin-only. Update a document's mutable identity fields: `name` (rename),
 * `sort_order`, and `is_archived`. A single-row update on `ai_context_doc`,
 * through the RLS client — the admin `for all` policy (0063) permits it; the
 * service-role key is never used. Only the provided fields are changed.
 *
 * Archiving is the destructive path the UI wires (the document stops feeding
 * every future AI call); `sort_order` is settable here but the surface draws no
 * reorder affordance.
 */
export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: { name?: unknown; sort_order?: unknown; is_archived?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      return NextResponse.json({ error: 'sort_order must be an integer.' }, { status: 400 });
    }
    patch.sort_order = body.sort_order;
  }
  if (body.is_archived !== undefined) {
    if (typeof body.is_archived !== 'boolean') {
      return NextResponse.json({ error: 'is_archived must be a boolean.' }, { status: 400 });
    }
    patch.is_archived = body.is_archived;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ai_context_doc')
    .update(patch)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not update the document.' }, { status: 500 });
  }
  // RLS-scoped update of a non-existent / non-permitted row affects no rows.
  if (!data) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  return NextResponse.json({ id: (data as { id: string }).id });
}
