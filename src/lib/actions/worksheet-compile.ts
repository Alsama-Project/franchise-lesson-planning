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
import { assembleWorksheetDoc, type PreparedExercise } from '@/lib/ai/worksheet-assemble';
import type { WorksheetDoc, WorksheetV3 } from '@/types/lesson';
import type { ImageSlot, WorksheetExerciseGeneration } from '@/types/worksheet-exercise';

interface ExerciseRow {
  position: number;
  body_doc: WorksheetDoc | null;
  image_slots: ImageSlot[] | null;
  generation: WorksheetExerciseGeneration | null;
}

/** The flowing nodes of an exercise's body_doc, or [] when it carries none. */
function exerciseNodes(bodyDoc: WorksheetDoc | null): unknown[] {
  if (!bodyDoc || typeof bodyDoc !== 'object') return [];
  const content = (bodyDoc as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

// ── Image slots → image nodes ────────────────────────────────────────────────
//
// A generated image is authored as a `[Picture: …]` marker, which `markdownToDoc`
// passes through as literal text, so in body_doc it is a top-level `paragraph`
// whose only content is that one marker (the floor requires each marker alone on
// its own line). The exercise route builds `image_slots` one-per-marker in the
// SAME order the markers appear in body_md (and thus body_doc), so within a row
// the k-th marker paragraph pairs with `image_slots[k]`. Where that slot has a
// non-null `storage_path`, the marker is replaced by a `ResizableImage` node
// (tiptap node type `image`) carrying `storagePath` + `slotId`; `src` is left null
// so `resolveImageSrc` re-signs from the path (never a persisted, expiring URL).
// Where there is no paired slot, or its `storage_path` is null, the text marker is
// left exactly as it is — the pre-image fallback the teacher already sees, which
// must not regress.

const PICTURE_MARKER = /^\s*\[Picture:\s*[^\]]+\]\s*$/;

/**
 * If `node` is a marker paragraph — a `paragraph` whose entire content is text
 * nodes concatenating to exactly one `[Picture: …]` marker and nothing else —
 * return the trimmed marker text; otherwise null. A paragraph carrying a marker
 * plus any other text (or any non-text inline node) is NOT a marker paragraph.
 */
function markerParagraphText(node: unknown): string | null {
  const n = node as { type?: unknown; content?: unknown };
  if (n?.type !== 'paragraph' || !Array.isArray(n.content) || n.content.length === 0) return null;
  let text = '';
  for (const child of n.content) {
    const c = child as { type?: unknown; text?: unknown };
    if (c?.type !== 'text' || typeof c.text !== 'string') return null; // hardBreak / non-text → not pure
    text += c.text;
  }
  return PICTURE_MARKER.test(text) ? text.trim() : null;
}

/** The `image` node for a resolved slot. `src` stays null — `resolveImageSrc`
 *  serves from `storagePath` through the re-signing route. */
function slotImageNode(slot: ImageSlot): unknown {
  return {
    type: 'image',
    attrs: {
      src: null,
      alt: slot.subject ?? null,
      storagePath: slot.storage_path,
      slotId: slot.slot_id,
    },
  };
}

/**
 * Replace each marker paragraph in one exercise's top-level nodes with its slot's
 * image node, where that slot's image is ready. The marker index resets per call
 * (per exercise row) and advances on EVERY marker paragraph — resolved or not — so
 * a null-storage marker never shifts the pairing of a later one. Returns a new
 * array of the same length; non-marker nodes and unresolved markers pass through
 * unchanged.
 */
function fillImageSlots(nodes: unknown[], slots: ImageSlot[]): unknown[] {
  let i = 0;
  return nodes.map((node) => {
    if (markerParagraphText(node) === null) return node;
    const slot = slots[i++]; // advance per marker, before the resolved-check
    return slot && slot.storage_path ? slotImageNode(slot) : node;
  });
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

  const { data: exRows } = await supabase
    .from('worksheet_exercise')
    .select('position, body_doc, image_slots, generation')
    .eq('lesson_plan_id', lessonPlanId)
    .order('position', { ascending: true });
  const exercises: PreparedExercise[] = ((exRows ?? []) as ExerciseRow[])
    .map((row) => ({
      anchor: row.generation?.spec?.template_anchor?.trim() || null,
      // Pair markers ↔ slots per row (fresh index), against THIS row's own
      // body_doc + image_slots, before the empty-body filter below.
      nodes: fillImageSlots(exerciseNodes(row.body_doc), row.image_slots ?? []),
    }))
    // Only exercises that actually carry content participate; a skeleton /
    // failed / still-generating row (null body_doc) is skipped.
    .filter((e) => e.nodes.length > 0);

  // Base content: the scaffold's nodes, built fresh from its markdown, or empty when
  // the subject has no scaffold document. Assembly (strip → anchor-match → fill →
  // append, with the `wsCompiled` tagging) lives in the pure, tested module.
  return assembleWorksheetDoc(scaffoldDocContent(scaffoldMarkdown), exercises);
}
