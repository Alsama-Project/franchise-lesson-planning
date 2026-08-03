import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import {
  generateExercise,
  WorksheetExerciseError,
  type AuthoredImageSlot,
  type WorksheetExerciseContext,
} from '@/lib/ai/worksheet-exercise';
import { readCurriculumAnchors } from '@/lib/ai/worksheet-shared';
import { markdownToDoc } from '@/lib/editor/markdown';
import type {
  ExerciseSpec,
  ImageSlot,
  WorksheetExerciseGeneration,
} from '@/types/worksheet-exercise';

/**
 * POST /api/worksheet/exercise
 *
 * Backend-only. Generates (or regenerates) one worksheet exercise's content from
 * its stored spec, and writes it back to the SAME `worksheet_exercise` row:
 * `body_md`, the derived `body_doc` tiptap fragment, `status = 'ready'`, the
 * `image_slots` (one per `[Picture: …]` marker, subject/brief authored by the
 * model), and `generation` updated with the fresh model/prompt_hash. On failure the row is set to
 * `status = 'failed'` — never left stuck on `'generating'`.
 *
 * Input: `{ exercise_id }`. Nothing else. `body_md` is the source of truth;
 * `body_doc` is converted from it, and the `[Picture: …]` markers stay in
 * `body_md` so a failed or disabled image degrades gracefully. Returns
 * `{ exercise }`.
 *
 * Requires `ANTHROPIC_API_KEY_WORKSHEET` in the environment.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ExerciseBody {
  exercise_id?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Build the image slots for the row. The `[Picture: …]` markers in `body_md` are
 * the SOURCE OF TRUTH for how many images the exercise needs (the renderer parses
 * them), so slot count always equals marker count. Each marker is paired, in
 * order, with the model-authored slot ({@link AuthoredImageSlot}) — `subject` the
 * literal thing depicted, `brief` a full visual description for an image model
 * that never sees the exercise. If the model returned fewer entries than there
 * are markers, the marker text is used as a safe fallback. The mechanical fields
 * (`slot_id`, `status`, `storage_path`) are added here, not by the model. The
 * markers stay in `body_md` unchanged.
 */
function buildImageSlots(bodyMd: string, authored: AuthoredImageSlot[]): ImageSlot[] {
  const markers: string[] = [];
  const re = /\[Picture:\s*([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyMd)) !== null) markers.push(m[1].trim());

  return markers.map((markerText, i) => {
    const a = authored[i];
    return {
      slot_id: randomUUID(),
      subject: a?.subject ? a.subject : markerText,
      brief: a?.brief ? a.brief : markerText,
      status: 'pending',
      storage_path: null,
    };
  });
}

export async function POST(request: NextRequest) {
  let body: ExerciseBody;
  try {
    body = (await request.json()) as ExerciseBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!isNonEmptyString(body.exercise_id)) {
    return NextResponse.json(
      { error: 'Field "exercise_id" is required and must be a non-empty string.' },
      { status: 400 },
    );
  }
  const exerciseId = body.exercise_id.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  // Read the exercise row (RLS delegates to the parent plan's visibility).
  const { data: exRow, error: exErr } = await supabase
    .from('worksheet_exercise')
    .select('id, lesson_plan_id, generation')
    .eq('id', exerciseId)
    .maybeSingle();
  if (exErr) {
    return NextResponse.json({ error: 'Could not read the exercise.' }, { status: 502 });
  }
  const exercise = exRow as {
    id: string;
    lesson_plan_id: string;
    generation: WorksheetExerciseGeneration | null;
  } | null;
  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found.' }, { status: 404 });
  }
  const spec = exercise.generation?.spec as ExerciseSpec | undefined;
  if (!spec) {
    return NextResponse.json(
      { error: 'This exercise has no stored spec to generate from.' },
      { status: 422 },
    );
  }

  // Re-read the plan + curriculum for context.
  const { data: planRow } = await supabase
    .from('lesson_plans')
    .select('subject_id, curriculum_lesson_id, curriculum_version_id')
    .eq('id', exercise.lesson_plan_id)
    .maybeSingle();
  const plan = planRow as {
    subject_id: string | null;
    curriculum_lesson_id: string | null;
    curriculum_version_id: string | null;
  } | null;
  const subjectId = plan?.subject_id ?? null;

  const anchors = await readCurriculumAnchors(
    supabase,
    plan?.curriculum_lesson_id,
    plan?.curriculum_version_id,
  );

  const context: WorksheetExerciseContext = { subjectId, spec, anchors };

  let result;
  try {
    result = await generateExercise(context);
  } catch (err) {
    // Never leave the row stuck on 'generating'. Mark it failed, then surface the error.
    await supabase
      .from('worksheet_exercise')
      .update({ status: 'failed' })
      .eq('id', exerciseId);
    if (err instanceof WorksheetExerciseError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unexpected error generating exercise.' }, { status: 500 });
  }

  const bodyMd = result.bodyMd;
  const bodyDoc = markdownToDoc(bodyMd);
  const imageSlots = buildImageSlots(bodyMd, result.imageSlots);
  const generation: WorksheetExerciseGeneration = {
    model: result.model,
    docs_used: result.docsUsed,
    curriculum_lesson_id:
      exercise.generation?.curriculum_lesson_id ?? plan?.curriculum_lesson_id ?? null,
    spec,
    prompt_hash: result.promptHash,
  };

  const { data: updated, error: updErr } = await supabase
    .from('worksheet_exercise')
    .update({
      body_md: bodyMd,
      body_doc: bodyDoc,
      status: 'ready',
      image_slots: imageSlots,
      generation,
    })
    .eq('id', exerciseId)
    .select('*')
    .maybeSingle();
  if (updErr || !updated) {
    // Content generated but the write failed — mark failed so it isn't stuck.
    await supabase
      .from('worksheet_exercise')
      .update({ status: 'failed' })
      .eq('id', exerciseId);
    return NextResponse.json({ error: 'Could not save the generated exercise.' }, { status: 502 });
  }

  return NextResponse.json({ exercise: updated });
}
