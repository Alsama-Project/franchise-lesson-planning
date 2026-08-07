'use server';

// Compile a lesson's generated worksheet exercises into a single v3 tiptap
// document, ready for the editor to adopt.
//
// IT MUST NOT WRITE `lesson_plans.worksheet`, AND MUST NOT CALL revalidatePath.
// The editor seeds worksheet state once (LessonPlanEditor.tsx) and never
// re-syncs from props, autosaving on an ungated debounce. A server-side write
// while that editor is mounted is guaranteed to be overwritten by the next flush
// of the stale client buffer. So this action ASSEMBLES and RETURNS the compiled
// doc; the caller does `setWorksheet(compiled)` and the existing debounce
// persists it.
//
// Assembly is FILL-not-replace: fetch the subject's worksheet scaffold at compile
// time (the subject-scoped `worksheet_builder` context document, as markdown →
// tiptap doc), read the plan's exercise rows in position order, insert each
// exercise whose spec carries a matching `template_anchor` right after that
// heading in the scaffold, and append the rest (no anchor, or anchor not found) in
// position order after the last node. A subject with no scaffold document yields
// the exercises alone in position order — this is the common day-one case and must
// not error.
//
// The scaffold now comes from the context stack — NOT from `lesson_plans.worksheet`
// (the old per-plan seeded clone that went stale the moment a coordinator edited
// the template). This is the same document the planner reads its heading list from
// (`readWorksheetScaffoldMarkdown`), so the anchors the model emits always describe
// headings this base actually contains — the split-brain is closed.
//
// "Exercise N" is never persisted and never printed — it is a render-time label
// only, so nothing here writes it into the doc.
//
// IDEMPOTENCY: compile's output is persisted into `lesson_plans.worksheet` by the
// editor's debounce, but compile no longer READS that column — its base is always
// the freshly-fetched scaffold (pristine `markdownToDoc` output, never carrying a
// `wsCompiled` tag). So two consecutive compiles over unchanged rows produce
// byte-identical output by construction, and compile's convergence no longer
// depends on the tag surviving an editor round trip at all. Every node compile
// inserts is still tagged with the `wsCompiled` attr (see `tagCompiled` in
// worksheet-assemble.ts), and the base is still run through `stripCompiled` —
// defensive, and preserving the marker contract. The tag is declared by the
// `WsCompiledMarker` editor extension so it survives `getJSON()` (default `false`,
// `renderHTML` → `{}`), meaning it round-trips in the JSONB yet still emits nothing
// to read-only/print/PDF output.

import { createClient } from '@/lib/supabase/server';
import { readWorksheetScaffoldMarkdown, scaffoldDocContent } from '@/lib/ai/worksheet-shared';
import {
  assembleWorksheetDoc,
  exerciseNodes,
  fillImageSlots,
  layoutExerciseImages,
  failedExercisePlaceholder,
  type PreparedExercise,
} from '@/lib/ai/worksheet-assemble';
import {
  toContentLanguage,
  worksheetArtifactText,
} from '@/lib/editor/worksheet-content-locale';
import type { WorksheetDoc, WorksheetV3 } from '@/types/lesson';
import type { ImageSlot, WorksheetExerciseGeneration, WorksheetExerciseStatus } from '@/types/worksheet-exercise';

// The `[Picture: …]` marker → image-node resolution now lives in the pure assembly
// module (`fillImageSlots`), because the per-exercise splice in the live document
// needs the identical transform. This action composes it.

interface ExerciseRow {
  id: string;
  position: number;
  status: WorksheetExerciseStatus;
  body_doc: WorksheetDoc | null;
  image_slots: ImageSlot[] | null;
  generation: WorksheetExerciseGeneration | null;
}

/**
 * Compile the worksheet for a plan. Returns the assembled `{ version: 3, doc }`.
 * Reads run through the caller's auth'd, RLS-scoped client.
 */
export async function compileWorksheet(lessonPlanId: string): Promise<WorksheetV3> {
  const supabase = await createClient();

  // The plan's subject steers which scaffold document to fetch. RLS scopes this
  // read to plans the caller may see.
  const { data: planRow } = await supabase
    .from('lesson_plans')
    .select('subject_id')
    .eq('id', lessonPlanId)
    .maybeSingle();
  const subjectId = (planRow as { subject_id?: string | null } | null)?.subject_id ?? null;

  // The scaffold: the subject-scoped worksheet_builder document, as markdown. Null
  // when the subject has no such document — compile then appends every exercise in
  // order (no scaffold), which is fine.
  const scaffoldMarkdown = await readWorksheetScaffoldMarkdown(supabase, subjectId);

  // The subject's content language steers the failed-exercise placeholder text (the
  // worksheet artifact follows the subject's language, not the UI locale). Defaults
  // to English for a null subject / unknown value — mirrors the DB default.
  const { data: subjectRow } = subjectId
    ? await supabase.from('subjects').select('content_language').eq('id', subjectId).maybeSingle()
    : { data: null };
  const contentLanguage = toContentLanguage(
    (subjectRow as { content_language?: string | null } | null)?.content_language,
  );
  const failedText = worksheetArtifactText(contentLanguage, 'exerciseFailed');

  const { data: exRows } = await supabase
    .from('worksheet_exercise')
    .select('id, position, status, body_doc, image_slots, generation')
    .eq('lesson_plan_id', lessonPlanId)
    .order('position', { ascending: true });
  const exercises: PreparedExercise[] = ((exRows ?? []) as ExerciseRow[])
    .map((row): PreparedExercise | null => {
      const anchor = row.generation?.spec?.template_anchor?.trim() || null;
      // Pair markers ↔ slots per row (fresh index), against THIS row's own
      // body_doc + image_slots, then lay a run of adjacent images out as a grid
      // (flashcards) sized by count — a lone image stays large; 2+ become a table.
      const nodes = layoutExerciseImages(
        fillImageSlots(exerciseNodes(row.body_doc), row.image_slots ?? []),
      );
      if (nodes.length > 0) return { id: row.id, anchor, nodes };
      // A failed row carries no body — emit a visible, retryable placeholder rather
      // than dropping it (an invisible gap the teacher can't act on). A skeleton /
      // still-generating row (also null body) is skipped as before.
      if (row.status === 'failed') return { id: row.id, anchor, nodes: failedExercisePlaceholder(failedText) };
      return null;
    })
    .filter((e): e is PreparedExercise => e !== null);

  // Base content: the scaffold's nodes, built fresh from its markdown, or empty when
  // the subject has no scaffold document. Assembly (strip → anchor-match → fill →
  // append, with the `wsCompiled` tagging) lives in the pure, tested module.
  return assembleWorksheetDoc(scaffoldDocContent(scaffoldMarkdown), exercises);
}
