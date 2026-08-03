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
//
// IDEMPOTENCY: compile is fill-not-replace against `lesson_plans.worksheet`, and
// its OWN output is persisted back into that same column — so the next run reads
// the already-filled doc as its "template". Without care that re-inserts every
// exercise again and the doc grows unboundedly. To converge, every node compile
// inserts is tagged with the `wsCompiled` attr (see `tagCompiled`), and the top of
// each run STRIPS those tagged nodes back out (`stripCompiled`), recovering the
// bare scaffold before filling. Repeated compiles over unchanged rows therefore
// produce byte-identical output. The tag lives only in the JSONB; the editor
// schema doesn't declare it, so read-only/print/PDF renders drop it harmlessly,
// and it survives in the stored column (the pane renders rows, never re-serialising
// the doc through tiptap) so the NEXT compile can find and strip it.

import { createClient } from '@/lib/supabase/server';
import { headingText, worksheetV3Doc } from '@/lib/ai/worksheet-shared';
import type { WorksheetDoc, WorksheetV3 } from '@/types/lesson';
import type { ImageSlot, WorksheetExerciseGeneration } from '@/types/worksheet-exercise';

interface ExerciseRow {
  position: number;
  body_doc: WorksheetDoc | null;
  image_slots: ImageSlot[] | null;
  generation: WorksheetExerciseGeneration | null;
}

/** The marker attr stamped on every node compile inserts, so a later run can strip
 *  it. A plain JSON attribute — no schema/migration change; the editor ignores it. */
const COMPILED_ATTR = 'wsCompiled';

/** Tag one top-level node as compile-inserted (idempotency marker). */
function tagCompiled(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  const n = node as Record<string, unknown>;
  const attrs = n.attrs && typeof n.attrs === 'object' ? (n.attrs as Record<string, unknown>) : {};
  return { ...n, attrs: { ...attrs, [COMPILED_ATTR]: true } };
}

/** True when a node was inserted by a previous compile run. */
function isCompiled(node: unknown): boolean {
  const attrs = (node as { attrs?: unknown })?.attrs;
  return (
    !!attrs && typeof attrs === 'object' && (attrs as Record<string, unknown>)[COMPILED_ATTR] === true
  );
}

/** Recover the bare scaffold from a (possibly already-filled) template doc's content
 *  by dropping every node a previous compile inserted. */
function stripCompiled(content: unknown[]): unknown[] {
  return content.filter((n) => !isCompiled(n));
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

  const { data: planRow } = await supabase
    .from('lesson_plans')
    .select('worksheet')
    .eq('id', lessonPlanId)
    .maybeSingle();
  const templateDoc = worksheetV3Doc((planRow as { worksheet?: unknown } | null)?.worksheet);

  const { data: exRows } = await supabase
    .from('worksheet_exercise')
    .select('position, body_doc, image_slots, generation')
    .eq('lesson_plan_id', lessonPlanId)
    .order('position', { ascending: true });
  const exercises = ((exRows ?? []) as ExerciseRow[])
    .map((row) => ({
      anchor: row.generation?.spec?.template_anchor?.trim() || null,
      // Pair markers ↔ slots per row (fresh index), against THIS row's own
      // body_doc + image_slots, before the empty-body filter below.
      nodes: fillImageSlots(exerciseNodes(row.body_doc), row.image_slots ?? []),
    }))
    // Only exercises that actually carry content participate; a skeleton /
    // failed / still-generating row (null body_doc) is skipped.
    .filter((e) => e.nodes.length > 0);

  // Base content: the seeded template's doc (a deep clone so we never mutate the
  // stored plan), or empty when there is no v3 template. STRIP any nodes a previous
  // compile inserted first, so a re-compile re-fills the bare scaffold rather than
  // stacking a second copy of every exercise (idempotency — see the file header).
  const baseContent: unknown[] = templateDoc
    ? stripCompiled(structuredClone(Array.isArray(templateDoc.content) ? templateDoc.content : []))
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
    // Tag every inserted node so the NEXT compile can strip it back out (idempotency).
    const nodes = structuredClone(ex.nodes).map(tagCompiled);
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
