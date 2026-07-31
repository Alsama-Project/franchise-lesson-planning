import 'server-only';
import { createClient } from '@/lib/supabase/server';
import {
  AI_CONTEXT_TOOLS,
  type AiContextBoard,
  type AiContextDocView,
  type AiContextLayer,
  type AiContextSubjectGroup,
  type AiContextToolGroup,
  type AiContextTool,
  type AiContextVersionView,
} from '@/types/ai-context';

// Read side of the admin "AI instructions" surface. Everything here goes through
// the auth'd, cookie-bound Supabase client, so RLS applies: the admin-only
// policies on `ai_context_doc` / `ai_context_doc_version` (0063) permit an admin
// to select every row, and a non-admin sees nothing (the tab is admin-gated
// anyway). The service-role key is never used, and this file never touches the
// prompt-composition path in src/lib/ai/*.
//
// Per the brief there are NO GET routes: the board is read in a server component
// and passed to the client tab whole. So the active version's `body_md` is
// included up-front (the popup's text panel needs it); inactive versions ship
// metadata only.

/** Raw `ai_context_doc_version` row shape from the embed (untyped client). */
interface RawVersion {
  id: string;
  version: number;
  body_md: string;
  original_filename: string | null;
  uploaded_by: string;
  created_at: string;
  is_active: boolean;
}

/** Raw `ai_context_doc` row with its versions embedded. */
interface RawDoc {
  id: string;
  layer: AiContextLayer;
  subject_id: string | null;
  tool: AiContextTool | null;
  name: string;
  sort_order: number;
  created_at: string;
  versions: RawVersion[] | null;
}

/**
 * Load the whole admin board: every non-archived document across the four stored
 * layers, joined to its active version, with `auth.users` ids resolved to display
 * names, grouped by layer. Returns null on a read failure so the caller can render
 * the tab's error state (the console convention).
 *
 * Uploader names are resolved with a single keyed `profiles` lookup — collect the
 * distinct ids, one `.in('id', …)`, map in memory. `profiles.id` equals
 * `auth.users.id` (0002/0005), so the ids line up. A missing or RLS-hidden profile
 * falls back to null and the UI shows the date/filename without a name — never a
 * raw uuid. No FK change, no migration.
 */
export async function getAiContextBoard(): Promise<AiContextBoard | null> {
  const supabase = await createClient();

  const [docsRes, subjectsRes] = await Promise.all([
    supabase
      .from('ai_context_doc')
      .select(
        'id, layer, subject_id, tool, name, sort_order, created_at, ' +
          'versions:ai_context_doc_version(id, version, body_md, original_filename, uploaded_by, created_at, is_active)',
      )
      .eq('is_archived', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('subjects')
      .select('id, name')
      .is('archived_at', null)
      .order('name', { ascending: true }),
  ]);

  if (docsRes.error) return null;

  const rawDocs = (docsRes.data ?? []) as unknown as RawDoc[];
  const subjectRows = (subjectsRes.data ?? []) as Array<{ id: string; name: string }>;

  // ── Resolve uploader ids → display names in one query ──
  const uploaderIds = new Set<string>();
  for (const doc of rawDocs) {
    for (const v of doc.versions ?? []) uploaderIds.add(v.uploaded_by);
  }
  const nameById = new Map<string, string>();
  if (uploaderIds.size > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', [...uploaderIds]);
    for (const p of (profileRows ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (p.full_name && p.full_name.trim()) nameById.set(p.id, p.full_name.trim());
    }
  }

  // ── Flatten each doc to its active version + version history ──
  const docViews: AiContextDocView[] = [];
  let lastChange: { at: string; uploaderName: string | null } | null = null;

  for (const doc of rawDocs) {
    const versions = [...(doc.versions ?? [])];
    if (versions.length === 0) continue; // a doc always has ≥1 version by construction

    // Newest version first for the history list.
    versions.sort((a, b) => b.version - a.version);
    // The active version drives the card + text panel; fall back to the newest
    // if (defensively) none is flagged active.
    const active = versions.find((v) => v.is_active) ?? versions[0];

    const versionViews: AiContextVersionView[] = versions.map((v) => ({
      id: v.id,
      version: v.version,
      uploaderName: nameById.get(v.uploaded_by) ?? null,
      createdAt: v.created_at,
      isActive: v.id === active.id,
    }));

    docViews.push({
      id: doc.id,
      layer: doc.layer,
      subjectId: doc.subject_id,
      tool: doc.tool,
      name: doc.name,
      sortOrder: doc.sort_order,
      activeVersion: active.version,
      originalFilename: active.original_filename,
      bodyMd: active.body_md,
      uploaderName: nameById.get(active.uploaded_by) ?? null,
      updatedAt: active.created_at,
      versions: versionViews,
    });

    // Header "last change": the most recent version upload anywhere on the board.
    for (const v of versions) {
      if (!lastChange || v.created_at > lastChange.at) {
        lastChange = { at: v.created_at, uploaderName: nameById.get(v.uploaded_by) ?? null };
      }
    }
  }

  // ── Group by layer ──
  const org = docViews.filter((d) => d.layer === 'org');
  const academic = docViews.filter((d) => d.layer === 'academic');

  const subjects: AiContextSubjectGroup[] = subjectRows.map((s) => ({
    subjectId: s.id,
    name: s.name,
    docs: docViews.filter((d) => d.layer === 'subject' && d.subjectId === s.id),
  }));

  const tools: AiContextToolGroup[] = AI_CONTEXT_TOOLS.map((tool) => ({
    tool,
    docs: docViews.filter((d) => d.layer === 'tool' && d.tool === tool),
  }));

  return {
    org,
    academic,
    subjects,
    tools,
    totalDocs: docViews.length,
    lastChange,
  };
}
