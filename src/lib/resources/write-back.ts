import 'server-only';

// Write-back of AI-generated worksheet exercises into the shared resource bank,
// triggered when a coordinator approves a lesson plan. This module is the single
// home for that logic; the approval server actions (decidePlan / setPlanStatus in
// src/lib/actions/lesson-plan.ts) call it after a successful approve and swallow
// any failure — a write-back problem must NEVER fail the approval.
//
// Every read/write runs through the auth'd, cookie-bound Supabase client, so RLS
// scopes it to the approving user. There is NO service-role client here.
//
// TWO MEANINGS OF `origin` (never conflated):
//   • worksheet_exercise.origin  = 'generated' | 'reused' | 'adapted'  (wsOrigin)
//   • resources.origin           = 'upload' | 'link' | 'ai_generated'  (always
//     written as the literal 'ai_generated' on the write-back path)
// This file only ever READS worksheet_exercise.origin and only ever WRITES the
// resources literal — the two vocabularies are kept strictly apart.
//
// This branch NEVER writes to worksheet_exercise.

import { createClient } from '@/lib/supabase/server';
import { recordUsage } from '@/lib/resources/usage';

/** worksheet_exercise.origin vocabulary (kept distinct from resources.origin). */
type WsOrigin = 'generated' | 'reused' | 'adapted';

/** A top-level reason the whole write-back was skipped (no exercise processed). */
export type WriteBackSkip = 'role' | 'plan_not_found' | 'not_approved' | 'no_exercises';

/** How subject_id / year were resolved, for observability in the approval log. */
type ResolvedVia = 'plan' | 'curriculum' | 'unresolved';

/** Per-exercise outcome record — logged, never surfaced to the user. */
export interface WriteBackExerciseRecord {
  exerciseId: string;
  /** worksheet_exercise.origin, aliased so it can never be read as a resources origin. */
  wsOrigin: WsOrigin;
  outcome: 'written' | 'reused' | 'skipped';
  /** The resources row upserted (generated/adapted) — absent for reused/skipped. */
  resourceId?: string;
  /** Named reason when outcome === 'skipped'. */
  reason?: string;
  /** Tag labels that had no matching global tag (link skipped, row not failed). */
  tagMisses?: string[];
  /** Non-fatal notes (e.g. a tag-link RLS rejection). */
  notes?: string[];
}

export interface WriteBackResult {
  /** True when the guards passed and exercises were processed. */
  ran: boolean;
  /** Set when `ran` is false — why the whole write-back was skipped. */
  skipped?: WriteBackSkip;
  /** Count of resources rows upserted (generated/adapted exercises). */
  written: number;
  /** Count of reuse usages recorded (reused exercises). */
  reused: number;
  subjectResolvedVia?: ResolvedVia;
  yearResolvedVia?: ResolvedVia;
  /** True when the plan's curriculum lesson carried no daily_outcome. */
  dailyOutcomeNull?: boolean;
  exercises: WriteBackExerciseRecord[];
}

interface PlanRow {
  id: string;
  status: string;
  subject_id: string | null;
  year: number | null;
  curriculum_lesson_id: string | null;
  curriculum_version_id: string | null;
}

interface WorksheetExerciseRow {
  id: string;
  title: string;
  exercise_type: string | null;
  body_md: string | null;
  body_doc: unknown | null;
  status: string;
  origin: WsOrigin;
  resource_id: string | null;
  image_slots: unknown;
  generation: Record<string, unknown> | null;
}

/** The curriculum lesson resolved for the plan (all fields best-effort/nullable). */
interface CurriculumResolution {
  /** curriculum_lesson.id (uuid) — the FK target for resources.curriculum_lesson_id. */
  id: string | null;
  /** subject_id resolved from curriculum_lesson.subject_code → subjects.code. */
  subjectId: string | null;
  year: number | null;
  dailyOutcome: string | null;
}

type Supa = Awaited<ReturnType<typeof createClient>>;

function skip(reason: WriteBackSkip): WriteBackResult {
  return { ran: false, skipped: reason, written: 0, reused: 0, exercises: [] };
}

/**
 * Resolve the plan's curriculum lesson via the auth'd client. curriculum_lesson is
 * reference data readable by any authenticated user (its RLS `curr_read` policy),
 * so no service-role client is needed. A version-stamped plan pins to its version;
 * an unstamped plan resolves against the active-version view. Returns best-effort
 * fields — any of them may be null, and the caller records that.
 */
async function resolveCurriculumLesson(
  supabase: Supa,
  plan: PlanRow,
): Promise<CurriculumResolution> {
  const empty: CurriculumResolution = { id: null, subjectId: null, year: null, dailyOutcome: null };
  const key = plan.curriculum_lesson_id;
  if (!key) return empty;

  const cols = 'id, subject_code, year, daily_outcome';
  type CurriculumRow = {
    id: string;
    subject_code: string | null;
    year: number | null;
    daily_outcome: string | null;
  };
  let row: CurriculumRow | null = null;

  if (plan.curriculum_version_id) {
    const { data } = await supabase
      .from('curriculum_lesson')
      .select(cols)
      .eq('lesson_key', key)
      .eq('curriculum_version_id', plan.curriculum_version_id)
      .eq('is_active', true)
      .limit(1);
    row = ((data ?? []) as CurriculumRow[])[0] ?? null;
  }

  if (!row) {
    // Unstamped/legacy plan, or the pinned read missed: fall back to the subject's
    // active version via the view (which is `select cl.*`, so it carries `id`).
    const { data } = await supabase
      .from('curriculum_lesson_active')
      .select(cols)
      .eq('lesson_key', key)
      .limit(1);
    row = ((data ?? []) as CurriculumRow[])[0] ?? null;
  }

  if (!row) return empty;

  let subjectId: string | null = null;
  if (row.subject_code) {
    const { data: subj } = await supabase
      .from('subjects')
      .select('id')
      .eq('code', row.subject_code)
      .maybeSingle();
    subjectId = (subj as { id: string } | null)?.id ?? null;
  }

  return {
    id: row.id,
    subjectId,
    year: row.year ?? null,
    dailyOutcome: (row.daily_outcome ?? null) || null,
  };
}

/** Build resources.generated_from with EXACTLY the five allowed keys, no more. */
function buildGeneratedFrom(
  generation: Record<string, unknown> | null,
  planId: string,
): Record<string, unknown> {
  const gen = generation ?? {};
  return {
    model: gen.model ?? null,
    docs_used: gen.docs_used ?? gen.docsUsed ?? null,
    prompt_hash: gen.prompt_hash ?? gen.promptHash ?? null,
    // Adapted-from provenance already rides inside spec (spec.resource_id).
    spec: gen.spec ?? null,
    lesson_plan_id: planId,
  };
}

/**
 * Write approved AI-generated worksheet exercises back into the resource bank.
 *
 * Guards (in order) each return a skip reason and never throw to the caller:
 *   1. actor role must satisfy the applied INSERT policy (coordinator or admin —
 *      see migration 0070); otherwise skipped 'role'.
 *   2. the plan must exist and be status 'approved'; otherwise skipped.
 *
 * For each ready/edited exercise:
 *   • generated | adapted → upsert a resources row (arbiter source_exercise_id).
 *   • reused              → record a use against the exercise's resource_id.
 *
 * The whole function is best-effort and resilient: a per-exercise failure is
 * recorded and skipped, never propagated. It NEVER writes to worksheet_exercise.
 */
export async function writeBackApprovedExercises(planId: string): Promise<WriteBackResult> {
  const supabase = await createClient();

  // ── Guard 1: actor role (no service-role client; RLS is the real boundary) ──
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return skip('role');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  // Matches the applied INSERT policy widened by 0070 (coordinator OR admin). If
  // 0070 is not yet applied, an admin's insert is still rejected by RLS below and
  // recorded as a per-exercise skip — the approval is unaffected either way.
  if (role !== 'coordinator' && role !== 'admin') return skip('role');

  // ── Guard 2: plan exists and is approved ──
  const { data: planData } = await supabase
    .from('lesson_plans')
    .select('id, status, subject_id, year, curriculum_lesson_id, curriculum_version_id')
    .eq('id', planId)
    .maybeSingle();
  const plan = planData as PlanRow | null;
  if (!plan) return skip('plan_not_found');
  if (plan.status !== 'approved') return skip('not_approved');

  // ── Resolve subject_id + year + daily_outcome + curriculum_lesson_id BEFORE any
  //    insert (resources_ai_scoped rejects a null subject_id/year — a check
  //    violation must never be the error path). ──
  const curriculum = await resolveCurriculumLesson(supabase, plan);

  const subjectId = plan.subject_id ?? curriculum.subjectId ?? null;
  const year = plan.year ?? curriculum.year ?? null;
  const dailyOutcome = curriculum.dailyOutcome;
  const curriculumLessonId = curriculum.id;

  const subjectResolvedVia: ResolvedVia = plan.subject_id
    ? 'plan'
    : curriculum.subjectId
      ? 'curriculum'
      : 'unresolved';
  const yearResolvedVia: ResolvedVia =
    plan.year != null ? 'plan' : curriculum.year != null ? 'curriculum' : 'unresolved';

  // ── Select the exercises to write back — only ready/edited, never generating/failed. ──
  const { data: exData } = await supabase
    .from('worksheet_exercise')
    .select(
      'id, title, exercise_type, body_md, body_doc, status, origin, resource_id, image_slots, generation',
    )
    .eq('lesson_plan_id', planId)
    .in('status', ['ready', 'edited'])
    .order('position', { ascending: true });
  const exercises = (exData ?? []) as WorksheetExerciseRow[];

  const result: WriteBackResult = {
    ran: true,
    written: 0,
    reused: 0,
    subjectResolvedVia,
    yearResolvedVia,
    dailyOutcomeNull: dailyOutcome === null,
    exercises: [],
  };
  if (exercises.length === 0) return { ...skip('no_exercises'), subjectResolvedVia, yearResolvedVia };

  // Global (subject_id IS NULL) exercise_type + format tag vocabulary, fetched once.
  // Scoped to two dimensions → a handful of rows, well under the PostgREST cap.
  const { data: tagData } = await supabase
    .from('resource_tags')
    .select('id, dimension, label')
    .is('subject_id', null)
    .in('dimension', ['exercise_type', 'format']);
  const globalTags = (tagData ?? []) as Array<{ id: string; dimension: string; label: string }>;
  const norm = (s: string) => s.trim().toLowerCase();
  const formatExerciseTagId =
    globalTags.find((t) => t.dimension === 'format' && norm(t.label) === 'exercise')?.id ?? null;

  for (const ex of exercises) {
    const wsOrigin = ex.origin; // worksheet_exercise.origin — never a resources origin
    const record: WriteBackExerciseRecord = { exerciseId: ex.id, wsOrigin, outcome: 'skipped' };

    // ── reused → no resources row; record usage against the exercise's resource. ──
    if (wsOrigin === 'reused') {
      if (!ex.resource_id) {
        record.reason = 'reused_without_resource_id';
        result.exercises.push(record);
        continue;
      }
      const usage = await recordUsage(ex.resource_id, planId);
      if (usage.ok) {
        record.outcome = 'reused';
        result.reused += 1;
      } else {
        record.reason = `usage_failed: ${usage.error ?? 'unknown'}`;
      }
      result.exercises.push(record);
      continue;
    }

    // ── generated | adapted → upsert a resources row. ──
    // Scope must be resolvable, or resources_ai_scoped would reject the row.
    if (!subjectId || year == null) {
      record.reason = `unresolved_scope: subject=${subjectResolvedVia}, year=${yearResolvedVia}`;
      result.exercises.push(record);
      continue;
    }
    // resources_ai_has_body / resources_one_source require a non-empty body_md.
    const bodyMd = (ex.body_md ?? '').trim() ? ex.body_md : null;
    if (!bodyMd) {
      record.reason = 'missing_body_md';
      result.exercises.push(record);
      continue;
    }

    const imageSlots = Array.isArray(ex.image_slots) ? ex.image_slots : [];
    const sharedPatch: Record<string, unknown> = {
      title: ex.title,
      body_md: bodyMd,
      body_doc: ex.body_doc ?? null,
      curriculum_lesson_id: curriculumLessonId,
      daily_outcome: dailyOutcome,
      subject_id: subjectId,
      year,
      image_slots: imageSlots,
      image_count: imageSlots.length,
      generated_from: buildGeneratedFrom(ex.generation, planId),
    };

    // Upsert on the resources_source_exercise_key arbiter, expressed as
    // select-then-update-or-insert so the insert-only columns (uploaded_by,
    // origin, source_exercise_id) and the never-touch columns (created_at,
    // usage_count) are honoured — PostgREST cannot express a partial DO UPDATE SET.
    let resourceId: string | null = null;
    const { data: existing } = await supabase
      .from('resources')
      .select('id')
      .eq('source_exercise_id', ex.id)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('resources')
        .update(sharedPatch)
        .eq('source_exercise_id', ex.id)
        .select('id')
        .maybeSingle();
      if (error || !data) {
        record.reason = `update_failed: ${error?.message ?? 'no row'}`;
        result.exercises.push(record);
        continue;
      }
      resourceId = (data as { id: string }).id;
    } else {
      const insertRow = {
        ...sharedPatch,
        uploaded_by: user.id,
        origin: 'ai_generated', // resources.origin literal — NOT wsOrigin
        source_exercise_id: ex.id,
      };
      const { data, error } = await supabase
        .from('resources')
        .insert(insertRow)
        .select('id')
        .maybeSingle();
      if (error) {
        // Lost a race on resources_source_exercise_key — resolve to update.
        if (error.code === '23505') {
          const { data: raced } = await supabase
            .from('resources')
            .update(sharedPatch)
            .eq('source_exercise_id', ex.id)
            .select('id')
            .maybeSingle();
          resourceId = (raced as { id: string } | null)?.id ?? null;
        }
        if (!resourceId) {
          record.reason = `insert_failed: ${error.message}`;
          result.exercises.push(record);
          continue;
        }
      } else {
        resourceId = (data as { id: string } | null)?.id ?? null;
      }
    }

    if (!resourceId) {
      record.reason = 'no_resource_id';
      result.exercises.push(record);
      continue;
    }

    // ── Tag links: format 'Exercise' + the matching exercise_type, global only. ──
    const misses: string[] = [];
    const tagIds: string[] = [];
    if (formatExerciseTagId) tagIds.push(formatExerciseTagId);
    else misses.push('format:Exercise');

    const exType = ex.exercise_type ?? '';
    const typeTagId = exType.trim()
      ? globalTags.find((t) => t.dimension === 'exercise_type' && norm(t.label) === norm(exType))?.id ?? null
      : null;
    if (typeTagId) tagIds.push(typeTagId);
    else misses.push(`exercise_type:${exType || '(empty)'}`);

    if (tagIds.length > 0) {
      const { error: linkError } = await supabase
        .from('resource_tag_links')
        .upsert(
          tagIds.map((tagId) => ({ resource_id: resourceId, tag_id: tagId })),
          { onConflict: 'resource_id,tag_id', ignoreDuplicates: true },
        );
      if (linkError) record.notes = [`tag_link_error: ${linkError.message}`];
    }
    if (misses.length > 0) record.tagMisses = misses;

    record.outcome = 'written';
    record.resourceId = resourceId;
    result.written += 1;
    result.exercises.push(record);
  }

  return result;
}
