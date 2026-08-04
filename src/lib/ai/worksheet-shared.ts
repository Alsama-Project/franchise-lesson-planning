import 'server-only';
import { createHash } from 'node:crypto';
import type { createClient } from '@/lib/supabase/server';
import { markdownToDoc } from '@/lib/editor/markdown';
import { headingText } from '@/lib/ai/worksheet-assemble';
import type { WorksheetDoc } from '@/types/lesson';
import type { ActiveContextStackRow } from '@/types/ai-context';

// `headingText` lives in the pure (test-importable) assembly module; re-exported
// here so existing importers keep resolving it from worksheet-shared.
export { headingText };

/**
 * Shared server-side helpers for the worksheet-generation spine (the plan and
 * exercise AI routes and the compile action). Kept in one place so all three
 * agree on how curriculum anchors are read, how the subject's worksheet template
 * is resolved, and how a template heading's text is derived for
 * `template_anchor` matching.
 *
 * Backend-only. Everything runs through the caller's auth'd, RLS-scoped server
 * client — never the service-role key.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The curriculum anchors for a lesson. EVERY field is optional and gated: the
 * shape varies by subject (English carries grammar/vocab; weekly-shape subjects
 * carry weekly LOs; some carry only a subject/annual outcome), and any column
 * may be null. A missing anchor simply drops its line from the prompt — it never
 * blocks generation. `curriculum_lesson` has no `weekly_outcome` column; these
 * are the outcome columns that actually exist (0010/0015/0049).
 */
export interface CurriculumAnchors {
  daily_outcome: string | null;
  weekly_knowledge_lo: string | null;
  weekly_skills_lo: string | null;
  monthly_lo: string | null;
  monthly_knowledge_lo: string | null;
  monthly_skills_lo: string | null;
  subject_learning_outcome: string | null;
  annual_learning_outcome: string | null;
  grammar_vocabulary: string | null;
  theme: string | null;
}

const ANCHOR_COLUMNS =
  'daily_outcome, weekly_knowledge_lo, weekly_skills_lo, monthly_lo, ' +
  'monthly_knowledge_lo, monthly_skills_lo, subject_learning_outcome, ' +
  'annual_learning_outcome, grammar_vocabulary, theme';

/**
 * Read the curriculum anchors for a plan's lesson. Resolution mirrors
 * `getLessonById`: a version-pinned plan reads the base `curriculum_lesson`
 * table scoped to its stamped `curriculum_version_id`; an unpinned/legacy plan
 * reads the `curriculum_lesson_active` view (the subject's active version).
 * Returns null when the lesson cannot be resolved — the caller treats that as
 * "no anchors" (never an error).
 */
export async function readCurriculumAnchors(
  supabase: ServerClient,
  lessonKey: string | null | undefined,
  versionId: string | null | undefined,
): Promise<CurriculumAnchors | null> {
  if (!lessonKey) return null;

  const query = versionId
    ? supabase
        .from('curriculum_lesson')
        .select(ANCHOR_COLUMNS)
        .eq('is_active', true)
        .eq('curriculum_version_id', versionId)
        .eq('lesson_key', lessonKey)
    : supabase.from('curriculum_lesson_active').select(ANCHOR_COLUMNS).eq('lesson_key', lessonKey);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error || !data) return null;
  return data as unknown as CurriculumAnchors;
}

/** Emit only the anchor lines that carry a real value (gated, never empty lines). */
export function anchorLines(anchors: CurriculumAnchors | null): string[] {
  if (!anchors) return [];
  const hasText = (v: string | null): v is string => typeof v === 'string' && v.trim().length > 0;
  const rows: [string, string | null][] = [
    ['Daily outcome', anchors.daily_outcome],
    ['Weekly knowledge outcome', anchors.weekly_knowledge_lo],
    ['Weekly skills outcome', anchors.weekly_skills_lo],
    ['Monthly outcome', anchors.monthly_lo],
    ['Monthly knowledge outcome', anchors.monthly_knowledge_lo],
    ['Monthly skills outcome', anchors.monthly_skills_lo],
    ['Subject learning outcome', anchors.subject_learning_outcome],
    ['Annual learning outcome', anchors.annual_learning_outcome],
    ['Grammar / vocabulary', anchors.grammar_vocabulary],
    ['Theme', anchors.theme],
  ];
  return rows.filter(([, v]) => hasText(v)).map(([label, v]) => `- ${label}: ${(v as string).trim()}`);
}

/**
 * Read the SUBJECT-SCOPED `worksheet_builder` scaffold — the markdown of the
 * layer-4 context document whose `subject_id` matches this subject — or null when
 * the subject has no per-subject worksheet_builder document. This is the single
 * source of the worksheet scaffold: the planner derives its heading list from it
 * (so the model anchors against real headings) and compile builds its base
 * document from it (so those anchors have something to match). One source, no
 * divergence — replacing the old split of planner-reads-`worksheet_template` /
 * compile-reads-the-stale-plan-clone.
 *
 * WHY THE DIFF: `get_active_context_stack` returns tool-layer rows without a
 * `subject_id` column, so a single call can't tell the GLOBAL worksheet_builder
 * doc (prose instructions — must NOT become a scaffold) from a per-subject one.
 * The stack for a subject contains BOTH the global and the subject-scoped tool
 * docs; the stack for a null subject contains ONLY the global. The tool-layer doc
 * present in the former but not the latter is the per-subject override — the
 * scaffold. Runs through the security-definer RPC on the caller's RLS-scoped
 * client (the `ai_context_doc` tables are admin-only under RLS); never the
 * service-role key. Any read error resolves to null (no scaffold → compile
 * appends every exercise in order), never an exception.
 */
export async function readWorksheetScaffoldMarkdown(
  supabase: ServerClient,
  subjectId: string | null,
): Promise<string | null> {
  if (!subjectId) return null;
  const [subjectStack, globalStack] = await Promise.all([
    supabase.rpc('get_active_context_stack', {
      p_tool: 'worksheet_builder',
      p_subject_id: subjectId,
    }),
    supabase.rpc('get_active_context_stack', {
      p_tool: 'worksheet_builder',
      p_subject_id: null,
    }),
  ]);
  const subjectRows = (Array.isArray(subjectStack.data) ? subjectStack.data : []) as ActiveContextStackRow[];
  const globalRows = (Array.isArray(globalStack.data) ? globalStack.data : []) as ActiveContextStackRow[];

  // Global tool-layer doc ids — everything NOT scoped to this subject.
  const globalToolIds = new Set(globalRows.filter((r) => r.layer === 'tool').map((r) => r.doc_id));
  // The subject-scoped tool docs are the tool-layer rows unique to the subject call.
  const scoped = subjectRows.filter((r) => r.layer === 'tool' && !globalToolIds.has(r.doc_id));
  // First by the RPC's composition order (layer_rank, sort_order, created_at).
  return scoped.length > 0 ? scoped[0].body_md : null;
}

/** The scaffold's top-level doc nodes, built from its markdown (empty when null).
 *  Compile fills exercises into these; the planner reads their headings — both
 *  through `markdownToDoc`, so the two agree on exactly which headings exist. */
export function scaffoldDocContent(markdown: string | null): unknown[] {
  if (!markdown) return [];
  const doc = markdownToDoc(markdown);
  return Array.isArray(doc.content) ? doc.content : [];
}

/** The distinct heading texts in the scaffold markdown (via `markdownToDoc`), the
 *  exact set compile can match `template_anchor` against. Empty when null. */
export function scaffoldHeadings(markdown: string | null): string[] {
  if (!markdown) return [];
  return templateHeadings({ version: 3, doc: markdownToDoc(markdown) });
}

/** The v3 tiptap doc inside a worksheet/template body, or null for v2/empty/absent. */
export function worksheetV3Doc(body: unknown): WorksheetDoc | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { version?: number; doc?: unknown };
  if (b.version === 3 && b.doc && typeof b.doc === 'object') return b.doc as WorksheetDoc;
  return null;
}

/** The distinct heading texts present in a worksheet/template body (v3 only). */
export function templateHeadings(body: unknown): string[] {
  const doc = worksheetV3Doc(body);
  if (!doc || !Array.isArray(doc.content)) return [];
  const seen = new Set<string>();
  for (const node of doc.content) {
    const t = headingText(node);
    if (t) seen.add(t);
  }
  return [...seen];
}

/** Content hash of a composed prompt, for `generation.prompt_hash`. */
export function promptHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
