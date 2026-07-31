import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import type { AiContextLayer, AiContextTool } from '@/types/ai-context';

// Shared admin gate + scope validation for the context-doc routes. The gate is
// the same ladder as POST /api/ai-resource-guide: getCurrentProfile() → 401 if
// none, 403 unless role === 'admin', with the tables' admin-only RLS (0063) as
// the backstop.

const LAYERS: readonly AiContextLayer[] = ['org', 'academic', 'subject', 'tool'];
const TOOLS: readonly AiContextTool[] = ['worksheet_builder', 'resource_generator', 'smartt_checker', 'worksheet_image'];

/** Resolve the caller and require the admin role. Returns the profile, or a ready
 *  NextResponse to return as-is (401/403). */
export async function requireAdmin(): Promise<
  { ok: true; profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>> } | { ok: false; response: NextResponse }
> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  if (profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Only administrators can manage AI instructions.' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, profile };
}

export interface ScopeInput {
  layer: string | null;
  subjectId: string | null;
  tool: string | null;
}

export type ScopeResult =
  | { ok: true; layer: AiContextLayer; subjectId: string | null; tool: AiContextTool | null }
  | { ok: false; error: string };

/**
 * Validate the (layer, subject_id, tool) combination against the DB
 * `ai_context_doc_scope` CHECK (0063) BEFORE insert, so a bad combination returns
 * a clear 400 rather than surfacing as a constraint error:
 *  - org / academic → no subject, no tool;
 *  - subject        → subject required, no tool;
 *  - tool           → tool required, subject optional (null = all subjects).
 */
export function validateScope(input: ScopeInput): ScopeResult {
  const { layer } = input;
  if (!layer || !LAYERS.includes(layer as AiContextLayer)) {
    return { ok: false, error: 'A valid layer is required.' };
  }
  const l = layer as AiContextLayer;
  const subjectId = input.subjectId && input.subjectId.trim() ? input.subjectId.trim() : null;
  const toolRaw = input.tool && input.tool.trim() ? input.tool.trim() : null;

  if (toolRaw && !TOOLS.includes(toolRaw as AiContextTool)) {
    return { ok: false, error: 'Unknown tool.' };
  }
  const tool = toolRaw as AiContextTool | null;

  if (l === 'org' || l === 'academic') {
    if (subjectId || tool) {
      return { ok: false, error: 'Organisation and academic documents take no subject or tool.' };
    }
    return { ok: true, layer: l, subjectId: null, tool: null };
  }
  if (l === 'subject') {
    if (!subjectId || tool) {
      return { ok: false, error: 'A subject document needs a subject and no tool.' };
    }
    return { ok: true, layer: l, subjectId, tool: null };
  }
  // l === 'tool'
  if (!tool) {
    return { ok: false, error: 'A tool document needs a tool.' };
  }
  return { ok: true, layer: l, subjectId, tool };
}
