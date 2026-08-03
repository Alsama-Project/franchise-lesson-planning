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
// Assembly is FILL-not-replace: read the plan's current worksheet (the seeded
// template, or null) and its exercise rows in position order, insert each
// exercise whose spec carries a matching `template_anchor` right after that
// heading in the template, and append the rest (no anchor, or anchor not found)
// in position order after the last node. A null/empty template yields the
// exercises alone in position order.
//
// "Exercise N" is never persisted and never printed — it is a render-time label
// only, so nothing here writes it into the doc.

import { createClient } from '@/lib/supabase/server';
import { headingText, worksheetV3Doc } from '@/lib/ai/worksheet-shared';
import type { WorksheetDoc, WorksheetV3 } from '@/types/lesson';
import type { WorksheetExerciseGeneration } from '@/types/worksheet-exercise';

interface ExerciseRow {
  position: number;
  body_doc: WorksheetDoc | null;
  generation: WorksheetExerciseGeneration | null;
}

/** The flowing nodes of an exercise's body_doc, or [] when it carries none. */
function exerciseNodes(bodyDoc: WorksheetDoc | null): unknown[] {
  if (!bodyDoc || typeof bodyDoc !== 'object') return [];
  const content = (bodyDoc as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

/**
 * Compile the worksheet for a plan. Returns the assembled `{ version: 3, doc }`.
 * Reads run through the caller's auth'd, RLS-scoped client.
 */
export async function compileWorksheet(lessonPlanId: string): Promise<WorksheetV3> {
  const supabase = await createClient();

  const { data: planRow } = await supabase
    .from('lesson_plans')
    .select('worksheet')
    .eq('id', lessonPlanId)
    .maybeSingle();
  const templateDoc = worksheetV3Doc((planRow as { worksheet?: unknown } | null)?.worksheet);

  const { data: exRows } = await supabase
    .from('worksheet_exercise')
    .select('position, body_doc, generation')
    .eq('lesson_plan_id', lessonPlanId)
    .order('position', { ascending: true });
  const exercises = ((exRows ?? []) as ExerciseRow[])
    .map((row) => ({
      anchor: row.generation?.spec?.template_anchor?.trim() || null,
      nodes: exerciseNodes(row.body_doc),
    }))
    // Only exercises that actually carry content participate; a skeleton /
    // failed / still-generating row (null body_doc) is skipped.
    .filter((e) => e.nodes.length > 0);

  // Base content: the seeded template's doc (a deep clone so we never mutate the
  // stored plan), or empty when there is no v3 template.
  const baseContent: unknown[] = templateDoc
    ? structuredClone(Array.isArray(templateDoc.content) ? templateDoc.content : [])
    : [];

  // Which anchors correspond to a real heading in the template.
  const headingTexts = new Set<string>();
  for (const node of baseContent) {
    const t = headingText(node);
    if (t) headingTexts.add(t);
  }

  // Group exercises: those that fill a template heading (by exact trimmed text),
  // and those that append (no anchor, or an anchor with no matching heading).
  const byAnchor = new Map<string, unknown[][]>();
  const appended: unknown[][] = [];
  for (const ex of exercises) {
    const nodes = structuredClone(ex.nodes);
    if (ex.anchor && headingTexts.has(ex.anchor)) {
      const list = byAnchor.get(ex.anchor) ?? [];
      list.push(nodes);
      byAnchor.set(ex.anchor, list);
    } else {
      appended.push(nodes);
    }
  }

  // Walk the template, inserting each anchor's exercises right after the FIRST
  // heading whose text matches (a repeated heading is filled once).
  const out: unknown[] = [];
  const consumed = new Set<string>();
  for (const node of baseContent) {
    out.push(node);
    const t = headingText(node);
    if (t && byAnchor.has(t) && !consumed.has(t)) {
      consumed.add(t);
      for (const group of byAnchor.get(t)!) out.push(...group);
    }
  }

  // Append the unmatched / anchorless exercises in position order after the last node.
  for (const group of appended) out.push(...group);

  return { version: 3, doc: { type: 'doc', content: out } };
}
