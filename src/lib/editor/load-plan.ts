import { createClient } from '@/lib/supabase/server';
import { getLessonById, getPreviousLesson } from '@/lib/curriculumUtils';
import { DEFAULT_BLOCKS } from '@/lib/blocks';
import { getTagVocabulary, listFolders, getResourcesByIds } from '@/lib/resources';
import type { Block, LessonBlockType, LessonPlan, PlanScope } from '@/types/lesson';
import type { Folder, ResourceWithTags, TagsByDimension } from '@/types/resource';

/** Block types that have a pre-approved activity bank today. */
export const ACTIVITY_BLOCK_TYPES: LessonBlockType[] = ['cfu', 'exit_ticket'];

export type ClassLiteracy = 'literate' | 'illiterate' | 'mixed';

/** A pre-approved activity row, narrowed to what the editor needs. */
export interface ActivityBankItem {
  id: string;
  block_type: LessonBlockType;
  name: string;
  summary: string | null;
  literate_instructions: string | null;
  illiterate_instructions: string | null;
  sort_order: number;
}

/**
 * The locked class context shown in the slim header. For `centre`/`org` scope
 * plans there is no single class, so `id` may be empty and `literacy`
 * defaults to `mixed`; the year/subject/centre come from the plan's own columns.
 */
export interface EditorClassContext {
  id: string;
  year: number;
  literacy: ClassLiteracy;
  schoolName: string;
  subjectName: string;
  /** The subject id — scopes the embedded Resource Bank panel. */
  subjectId: string | null;
  /** Plan scope, so the header/wizard can label centre/org plans. */
  scope: PlanScope;
}

/**
 * The context the embedded Resource Bank panel (steps 2 & 3) needs on first
 * paint: the subject/tag vocabulary for the Search tab, the user's folders for
 * the Folders tab, and the resources already attached to this plan's blocks (so
 * each section can show ✓ Added and its "Attached from the bank" list without a
 * round-trip). Everything is loaded through the auth'd, RLS-scoped client.
 */
export interface EditorResourceBank {
  subjectId: string | null;
  vocabulary: TagsByDimension;
  folders: Folder[];
  /** Resources already attached to any block, resolved with their tags. */
  attached: ResourceWithTags[];
}

/** The locked curriculum context resolved from `curriculum_lesson_id`. */
export interface EditorCurriculumContext {
  dailyLO: string;
  /** Focus area = the curriculum's linguistic skill (e.g. "Reading"). */
  focusArea: string;
  theme: string;
  /** Combined grammar + vocabulary focus shown in the cream context cell. */
  grammarVocab: string;
  /**
   * The previous lesson's daily outcome (the curriculum slot immediately before
   * this plan's, within the same subject + year). Shown read-only in the Link-it
   * Recap section so teachers see what was taught last lesson. Empty when this is
   * the first lesson of its year.
   */
  previousDailyLO: string;
  /** The week-level knowledge objective ("This week ·" context under the daily outcome). */
  weekLO: string;
  /** The broader skill objective ("This month ·" context under the daily outcome). */
  monthLO: string;
  /**
   * Combined monthly learning outcome (curriculum_lesson.monthly_lo), distinct
   * from monthLO (the monthly *skills* LO). Sent to the AI resource generator;
   * not shown in the curriculum band.
   */
  monthlyLO: string;
  /** The curriculum lesson's code (taxonomy id / lesson key), shown on the worksheet footer. */
  lessonCode: string;
}

/** Everything the client editor needs, fully serializable. */
export interface EditorPlanData {
  plan: LessonPlan;
  classContext: EditorClassContext;
  curriculum: EditorCurriculumContext | null;
  /** Pre-approved activities grouped by block type (cfu, exit_ticket today). */
  activitiesByBlock: Partial<Record<LessonBlockType, ActivityBankItem[]>>;
  /** Context for the embedded Resource Bank panel on steps 2 & 3. */
  resourceBank: EditorResourceBank;
}

// The Supabase client is intentionally untyped in this project (the generated
// Database type is still a placeholder), so we shape the joined rows by hand.
interface RawClassJoin {
  id: string;
  year: number;
  literacy: ClassLiteracy;
  school: { name: string } | { name: string }[] | null;
  subject: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface RawPlanRow {
  id: string;
  class_id: string | null;
  scope: PlanScope;
  school_id: string | null;
  subject_id: string | null;
  year: number | null;
  curriculum_lesson_id: string;
  lesson_date: string | null;
  weekday: number | null;
  period: number | null;
  status: LessonPlan['status'];
  smartt_objective: string | null;
  smartt_check: LessonPlan['smartt_check'];
  blocks: unknown;
  worksheet: unknown;
  required_materials: unknown;
  created_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  class: RawClassJoin | RawClassJoin[] | null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Load a lesson plan for the editor through the auth'd client (RLS enforced):
 * the plan, its class (school/subject/year/literacy), the resolved
 * curriculum context, and the activity bank for the blocks that have one.
 *
 * Returns `null` when the plan does not exist or the user is not permitted to
 * see it (RLS hides it), so the route can 404.
 */
export async function loadPlanForEditor(id: string): Promise<EditorPlanData | null> {
  const supabase = await createClient();

  // The plan (with its class join) and the activity bank are independent reads,
  // so issue them together instead of waterfalling. The activity bank is a small
  // fixed reference set; fetching it up front costs nothing if the plan 404s.
  const [
    { data: planRow, error },
    { data: activityRows },
  ] = await Promise.all([
    supabase
      .from('lesson_plans')
      .select(
        `id, class_id, scope, school_id, subject_id, year,
         curriculum_lesson_id, lesson_date, weekday, period, status,
         smartt_objective, smartt_check, blocks, worksheet, required_materials, created_by,
         submitted_at, reviewed_at, review_note, created_at, updated_at,
         class:classes (
           id, year, literacy,
           school:schools ( name ),
           subject:subjects ( id, name )
         )`
      )
      .eq('id', id)
      // A trashed plan (soft delete, 0048) reads as not-found, so the editor,
      // the read-only view, and the single-plan PDF (all delegate here) 404 it.
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('activity_bank')
      .select(
        'id, block_type, name, summary, literate_instructions, illiterate_instructions, sort_order',
      )
      .in('block_type', ACTIVITY_BLOCK_TYPES)
      .order('sort_order', { ascending: true }),
  ]);

  // A genuinely missing or RLS-forbidden row leaves `error` null and `planRow`
  // null — that's a real 404. A query error (e.g. selecting a column that no
  // longer exists) is a bug, NOT a missing plan: surface it loudly so it can
  // never again silently masquerade as a 404.
  if (error) {
    console.error(`loadPlanForEditor: query failed for plan ${id}:`, error);
    throw new Error(`Failed to load plan ${id}: ${error.message}`);
  }
  if (!planRow) return null;

  const row = planRow as unknown as RawPlanRow;
  const rawClass = one(row.class);

  // Class-scope plans take their context from the joined class. Centre/org-scope
  // plans have no single class, so resolve year/subject/centre from the plan's own
  // scope columns (literacy defaults to `mixed`, no group label).
  let classContext: EditorClassContext;
  if (rawClass) {
    const school = one(rawClass.school);
    const subject = one(rawClass.subject);
    classContext = {
      id: rawClass.id,
      year: rawClass.year,
      literacy: rawClass.literacy,
      schoolName: school?.name ?? '',
      subjectName: subject?.name ?? '',
      subjectId: subject?.id ?? null,
      scope: row.scope,
    };
  } else {
    // Centre/org-scope plan: no single class. Look up the subject + centre
    // names from the plan's scope columns.
    const [{ data: subjectRow }, schoolRes] = await Promise.all([
      row.subject_id
        ? supabase.from('subjects').select('id, name').eq('id', row.subject_id).maybeSingle()
        : Promise.resolve({ data: null }),
      row.school_id
        ? supabase.from('schools').select('name').eq('id', row.school_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const subject = subjectRow as { id: string; name: string } | null;
    const school = schoolRes.data as { name: string } | null;
    classContext = {
      id: '',
      year: row.year ?? 0,
      literacy: 'mixed',
      schoolName: school?.name ?? '',
      subjectName: subject?.name ?? '',
      subjectId: row.subject_id,
      scope: row.scope,
    };
  }

  // Resolve the locked curriculum context from the Supabase-backed curriculum.
  const lookup = await getLessonById(row.curriculum_lesson_id);
  const lesson = Array.isArray(lookup) ? lookup[0] : lookup;
  // The lesson taught immediately before this one (same subject + year), resolved
  // from the curriculum sequence. Its daily outcome anchors the Link-it recap.
  const previousLesson =
    lesson && lesson.subject && lesson.week != null && lesson.periodNum != null
      ? await getPreviousLesson(lesson.subject, lesson.yearNum ?? 0, lesson.week, lesson.periodNum)
      : null;
  const grammarVocab = lesson
    ? [lesson.vocabFocus, lesson.grammarFocus].filter((s) => s && s.trim()).join(' · ')
    : '';
  const curriculum: EditorCurriculumContext | null = lesson
    ? {
        dailyLO: lesson.dailyLO,
        focusArea: lesson.linguisticSkill,
        theme: lesson.theme,
        grammarVocab,
        previousDailyLO: previousLesson?.dailyLO ?? '',
        // The knowledge objective is the finer-grained (≈ weekly) target; the
        // skill objective is the broader (≈ monthly) one. Both are already
        // stem-cleaned by getLessonById.
        weekLO: lesson.knowledgeLO,
        monthLO: lesson.skillLO,
        monthlyLO: lesson.monthlyLO ?? '',
        // `lesson.id` is the taxonomy id when present, else the lesson key; fall
        // back to the plan's stored reference so the footer always has a code.
        lessonCode: lesson.id || row.curriculum_lesson_id,
      }
    : null;

  // Group the pre-fetched activity bank by block type.
  const activitiesByBlock: Partial<Record<LessonBlockType, ActivityBankItem[]>> = {};
  for (const row of (activityRows ?? []) as ActivityBankItem[]) {
    (activitiesByBlock[row.block_type] ??= []).push(row);
  }

  const blocks: Block[] =
    Array.isArray(row.blocks) && row.blocks.length > 0
      ? (row.blocks as Block[])
      : DEFAULT_BLOCKS;

  const requiredMaterials = Array.isArray(row.required_materials)
    ? (row.required_materials as unknown[])
    : undefined;

  // Resource-bank context for the embedded panel (steps 2 & 3). The vocabulary
  // is scoped to the class's subject (so subject-specific dimensions adapt); the
  // folders are the user's; the attached set resolves every resourceId already
  // written onto a block. These three reads are independent, so batch them.
  const attachedIds = [
    ...new Set(blocks.flatMap((b) => b.resourceIds ?? [])),
  ];
  const [vocabulary, folders, attached] = await Promise.all([
    getTagVocabulary(classContext.subjectId ?? undefined),
    listFolders(),
    getResourcesByIds(attachedIds),
  ]);
  const resourceBank: EditorResourceBank = {
    subjectId: classContext.subjectId,
    vocabulary,
    folders,
    attached,
  };

  const plan: LessonPlan = {
    id: row.id,
    class_id: row.class_id,
    scope: row.scope,
    subject_id: row.subject_id,
    school_id: row.school_id,
    year: row.year,
    curriculum_lesson_id: row.curriculum_lesson_id,
    lesson_date: row.lesson_date,
    weekday: row.weekday,
    period: row.period,
    status: row.status,
    smartt_objective: row.smartt_objective,
    smartt_check: row.smartt_check,
    blocks,
    created_by: row.created_by,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    review_note: row.review_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    worksheet: row.worksheet ?? undefined,
    requiredMaterials,
  };

  return { plan, classContext, curriculum, activitiesByBlock, resourceBank };
}
