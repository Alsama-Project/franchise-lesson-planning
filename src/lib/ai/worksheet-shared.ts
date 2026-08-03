import 'server-only';
import { createHash } from 'node:crypto';
import type { createClient } from '@/lib/supabase/server';
import type { WorksheetDoc } from '@/types/lesson';

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
 * Read the subject's Worksheet Master Template body (the seeded v3/v2 envelope,
 * or null when the subject has no template). SELECT-able by any authenticated
 * user (0062), so it runs through the same auth'd client.
 */
export async function readWorksheetTemplateBody(
  supabase: ServerClient,
  subjectId: string | null,
): Promise<unknown> {
  if (!subjectId) return null;
  const { data } = await supabase
    .from('worksheet_template')
    .select('body')
    .eq('subject_id', subjectId)
    .maybeSingle();
  return (data as { body: unknown } | null)?.body ?? null;
}

/** Concatenated text of a tiptap heading node, or null when the node is not a heading. */
export function headingText(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as { type?: string; content?: unknown[] };
  if (n.type !== 'heading' || !Array.isArray(n.content)) return null;
  const text = n.content
    .map((c) => (c && typeof c === 'object' ? ((c as { text?: string }).text ?? '') : ''))
    .join('')
    .trim();
  return text.length > 0 ? text : null;
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
