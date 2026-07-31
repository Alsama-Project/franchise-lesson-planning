import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  planWorksheet,
  WorksheetPlanError,
  type WorksheetPlanContext,
} from '@/lib/ai/worksheet-plan';
import {
  readCurriculumAnchors,
  readWorksheetTemplateBody,
  templateHeadings,
} from '@/lib/ai/worksheet-shared';
import { originFromSource } from '@/types/worksheet-exercise';
import type { Block } from '@/types/lesson';

/**
 * POST /api/worksheet/plan
 *
 * Backend-only. Plans a lesson's student worksheet as an ordered list of
 * exercise specs (one Claude call, structured output), then persists a skeleton
 * `worksheet_exercise` row per spec — a FULL replan that replaces any existing
 * rows for the plan. Returns `{ specs }`.
 *
 * Input: `{ lesson_plan_id }`. Everything else is derived server-side. The only
 * hard requirements are the lesson plan and its `subject_id`; every curriculum
 * anchor is optional and gated (a missing anchor never 400s).
 *
 * The prompt/model call/parse live in `@/lib/ai/worksheet-plan`; this handler is
 * the HTTP boundary — it reads the inputs, delegates, then writes the rows.
 *
 * Requires `ANTHROPIC_API_KEY_WORKSHEET` in the environment.
 */

export const runtime = 'nodejs';
// The planner reads the full context stack plus all blocks in one call — give it
// headroom over the platform's short default.
export const maxDuration = 60;

interface PlanBody {
  lesson_plan_id?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The live exercise_type vocabulary for a subject: global labels + subject-scoped, deduped. */
async function readExerciseTypes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subjectId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('resource_tags')
    .select('label, subject_id, sort_order')
    .eq('dimension', 'exercise_type')
    .or(`subject_id.is.null,subject_id.eq.${subjectId}`)
    .order('sort_order', { ascending: true });
  const rows = (data ?? []) as { label: string; subject_id: string | null; sort_order: number }[];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const r of rows) {
    if (typeof r.label === 'string' && r.label.length > 0 && !seen.has(r.label)) {
      seen.add(r.label);
      labels.push(r.label);
    }
  }
  return labels;
}

export async function POST(request: NextRequest) {
  let body: PlanBody;
  try {
    body = (await request.json()) as PlanBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!isNonEmptyString(body.lesson_plan_id)) {
    return NextResponse.json(
      { error: 'Field "lesson_plan_id" is required and must be a non-empty string.' },
      { status: 400 },
    );
  }
  const lessonPlanId = body.lesson_plan_id.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  // Read the plan (RLS scopes this to plans the caller may see).
  const { data: planRow, error: planErr } = await supabase
    .from('lesson_plans')
    .select('id, blocks, subject_id, curriculum_lesson_id, curriculum_version_id')
    .eq('id', lessonPlanId)
    .maybeSingle();
  if (planErr) {
    return NextResponse.json({ error: 'Could not read the lesson plan.' }, { status: 502 });
  }
  const plan = planRow as {
    id: string;
    blocks: Block[] | null;
    subject_id: string | null;
    curriculum_lesson_id: string | null;
    curriculum_version_id: string | null;
  } | null;
  if (!plan) {
    return NextResponse.json({ error: 'Lesson plan not found.' }, { status: 404 });
  }
  if (!isNonEmptyString(plan.subject_id)) {
    // subject_id is a hard requirement — it steers the context stack and the
    // exercise_type vocabulary.
    return NextResponse.json(
      { error: 'This lesson plan has no subject; cannot plan a worksheet.' },
      { status: 422 },
    );
  }
  const subjectId = plan.subject_id;

  // Everything below is a gated anchor — never fatal if absent.
  const [anchors, templateBody, exerciseTypes] = await Promise.all([
    readCurriculumAnchors(supabase, plan.curriculum_lesson_id, plan.curriculum_version_id),
    readWorksheetTemplateBody(supabase, subjectId),
    readExerciseTypes(supabase, subjectId),
  ]);

  if (exerciseTypes.length === 0) {
    return NextResponse.json(
      { error: 'No exercise_type vocabulary is configured.' },
      { status: 502 },
    );
  }

  const context: WorksheetPlanContext = {
    subjectId,
    curriculumLessonId: plan.curriculum_lesson_id,
    blocks: Array.isArray(plan.blocks) ? plan.blocks : [],
    anchors,
    templateHeadings: templateHeadings(templateBody),
    exerciseTypes,
  };

  let result;
  try {
    result = await planWorksheet(context);
  } catch (err) {
    if (err instanceof WorksheetPlanError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unexpected error planning worksheet.' }, { status: 500 });
  }

  // Full replan: delete existing rows for this plan, then insert one skeleton per
  // spec. The unique (lesson_plan_id, position) constraint is DEFERRABLE and
  // cannot be an ON CONFLICT arbiter, so this is delete-then-insert, not upsert.
  const { error: delErr } = await supabase
    .from('worksheet_exercise')
    .delete()
    .eq('lesson_plan_id', lessonPlanId);
  if (delErr) {
    return NextResponse.json(
      { error: 'Could not clear the previous worksheet exercises.' },
      { status: 502 },
    );
  }

  if (result.specs.length > 0) {
    const rows = result.specs.map((spec) => ({
      lesson_plan_id: lessonPlanId,
      position: spec.position,
      title: spec.title,
      exercise_type: spec.exercise_type,
      status: 'generating' as const,
      origin: originFromSource(spec.source),
      resource_id: spec.resource_id,
      image_slots: [],
      generation: {
        model: result.model,
        docs_used: result.docsUsed,
        curriculum_lesson_id: context.curriculumLessonId,
        spec,
        prompt_hash: result.promptHash,
      },
    }));
    const { error: insErr } = await supabase.from('worksheet_exercise').insert(rows);
    if (insErr) {
      return NextResponse.json(
        { error: 'Could not create the worksheet exercises.' },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ specs: result.specs });
}
