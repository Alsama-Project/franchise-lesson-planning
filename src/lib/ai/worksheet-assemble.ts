// Pure worksheet ASSEMBLY — the fill-not-replace core of `compileWorksheet`,
// factored out of the server action so it is deterministic, dependency-free, and
// unit-testable (no DB, no `server-only`, no secrets). The action reads the
// scaffold + exercise rows and hands the prepared inputs here; this module owns the
// anchor matching, the `wsCompiled` idempotency marker, and the node layout.
//
// It is intentionally NOT `server-only`: it carries no privileged data and is
// imported by tests directly. `compileWorksheet` (a server action) composes it.

import type { WorksheetV3, WorksheetDoc } from '@/types/lesson';
import type { ImageSlot } from '@/types/worksheet-exercise';
import { PICTURE_MARKER_LINE } from '@/lib/editor/markdown';

/** The marker attr stamped on every node compile inserts, so a later run can strip
 *  it. A plain JSON attribute — no schema/migration change. The `WsCompiledMarker`
 *  editor extension declares it (default `false`, `renderHTML` → `{}`) so it
 *  survives a `getJSON()` round trip yet emits nothing to printed HTML / PDF. Kept
 *  in sync with that extension's attribute name by hand. */
export const COMPILED_ATTR = 'wsCompiled';

/** The identity attr stamped alongside `wsCompiled` on every node of an exercise, so
 *  a later per-exercise regenerate can find that exercise's nodes and splice new ones
 *  in their place. Like `wsCompiled` it is a plain JSON attribute declared by the
 *  `WsCompiledMarker` extension (default `null`, `renderHTML` → `{}`, `keepOnSplit:
 *  false`) — it round-trips through `getJSON()` yet never reaches printed HTML / PDF,
 *  and a teacher who splits a node inside an exercise gets an id-less (hers) sibling. */
export const EXERCISE_ID_ATTR = 'exerciseId';

/**
 * Tag one top-level node as compile-inserted (idempotency marker), and — when an
 * `exerciseId` is given — stamp that identity so the node's exercise is recoverable.
 * The id is omitted (not stamped as `null`) when absent, so callers with no identity
 * (and the assembly idempotency tests) produce output byte-identical to the old
 * marker-only tag.
 */
export function tagCompiled(node: unknown, exerciseId?: string | null): unknown {
  if (!node || typeof node !== 'object') return node;
  const n = node as Record<string, unknown>;
  const attrs = n.attrs && typeof n.attrs === 'object' ? (n.attrs as Record<string, unknown>) : {};
  const tagged: Record<string, unknown> = { ...attrs, [COMPILED_ATTR]: true };
  if (exerciseId != null) tagged[EXERCISE_ID_ATTR] = exerciseId;
  return { ...n, attrs: tagged };
}

/** The `exerciseId` a node carries (compile identity), or null for any node that
 *  carries none — teacher-authored content, scaffold, or an untagged node. */
export function nodeExerciseId(node: unknown): string | null {
  const attrs = (node as { attrs?: unknown })?.attrs;
  if (!attrs || typeof attrs !== 'object') return null;
  const id = (attrs as Record<string, unknown>)[EXERCISE_ID_ATTR];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** True when a node was inserted by a previous compile run. */
export function isCompiled(node: unknown): boolean {
  const attrs = (node as { attrs?: unknown })?.attrs;
  return (
    !!attrs && typeof attrs === 'object' && (attrs as Record<string, unknown>)[COMPILED_ATTR] === true
  );
}

/** Recover the bare scaffold from a (possibly already-filled) doc's content by
 *  dropping every node a previous compile inserted. */
export function stripCompiled(content: unknown[]): unknown[] {
  return content.filter((n) => !isCompiled(n));
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

/** The heading level (1–3) of an UNTAGGED (scaffold) heading node, or null for any
 *  non-heading node and for a tagged (`wsCompiled`) node. A tagged node is exercise
 *  content — even a heading the model emitted inside an exercise body — so it is
 *  never treated as a scaffold heading here: it neither bounds a scaffold heading's
 *  span nor is a drop candidate; it simply counts as content. Levels default to 1
 *  (matching `markdownToDoc`, which always stamps `attrs.level`). */
function scaffoldHeadingLevel(node: unknown): number | null {
  if (isCompiled(node)) return null;
  const n = node as { type?: unknown; attrs?: { level?: unknown } };
  if (n?.type !== 'heading') return null;
  const lvl = Number(n.attrs?.level);
  return Number.isFinite(lvl) && lvl >= 1 ? lvl : 1;
}

/**
 * Drop scaffold headings that a student would be handed with nothing under them.
 *
 * A scaffold heading is KEPT iff its span — from just after it up to the next
 * scaffold heading of level ≤ its own (or end of document) — contains at least one
 * node that is NOT a scaffold heading. That single node may be a spliced exercise
 * (tagged), coordinator-written prose the template carries (untagged, non-heading),
 * or the content of a nested child heading — any of the three keeps the heading.
 *
 * This one invariant handles nesting: a `##` parent whose span holds only `###`
 * children is kept only if some child's span holds content; if every child is empty
 * the parent's span is all-headings too, so parent and children drop together in
 * this single pass. Tagged exercise nodes are never dropped and never bound a span,
 * so a heading the model emitted inside an exercise body is left untouched.
 */
export function dropEmptyScaffoldHeadings(content: unknown[]): unknown[] {
  const drop = new Array(content.length).fill(false);
  for (let i = 0; i < content.length; i++) {
    const level = scaffoldHeadingLevel(content[i]);
    if (level === null) continue; // not a scaffold heading — never a drop candidate
    let hasContent = false;
    for (let j = i + 1; j < content.length; j++) {
      const jl = scaffoldHeadingLevel(content[j]);
      if (jl !== null && jl <= level) break; // span ends at the next same-or-shallower heading
      if (jl === null) {
        hasContent = true; // a non-scaffold-heading node lives under this heading
        break;
      }
      // jl > level: a deeper scaffold heading — not itself content; keep scanning its span.
    }
    if (!hasContent) drop[i] = true;
  }
  return content.filter((_, i) => !drop[i]);
}

/** One exercise ready to place: its row `id` (stamped onto every node so a later
 *  per-exercise regenerate can find them), its `template_anchor` (or null), and its
 *  flowing top-level nodes (image slots already resolved by the caller). */
export interface PreparedExercise {
  id: string;
  anchor: string | null;
  nodes: unknown[];
}

/**
 * Assemble the compiled worksheet: insert each exercise whose `anchor` matches a
 * scaffold heading (by exact trimmed text) right after the FIRST such heading, and
 * append the rest (no anchor, or an anchor with no matching heading) in order after
 * the last node. `baseContent` is the scaffold's nodes (empty when the subject has
 * no scaffold → exercises alone, in order).
 *
 * Finally, any scaffold heading left with nothing under it — no spliced exercise and
 * no coordinator-written prose — is dropped (`dropEmptyScaffoldHeadings`), so a
 * four-section template with three exercises never prints a bare heading over blank
 * space. An empty parent heading falls together with its empty children.
 *
 * IDEMPOTENCY: the base is `stripCompiled`ed first (recovering the bare scaffold
 * even if a previously-compiled doc is passed in) and every inserted node is
 * `tagCompiled`. So this is a pure function of (scaffold, exercises): re-running it
 * — even feeding a prior run's output back as the base — yields byte-identical
 * output. The empty-heading drop preserves this: a dropped heading had no exercise
 * anchored to it, so on a re-compile that heading's exercise (if any) appends
 * exactly as before, and the drop reproduces identically. Inputs are deep-cloned,
 * so callers' arrays are never mutated.
 */
export function assembleWorksheetDoc(
  baseContent: unknown[],
  exercises: PreparedExercise[],
): WorksheetV3 {
  // Recover the bare scaffold and isolate from caller state.
  const base = stripCompiled(structuredClone(baseContent));

  // Which anchors correspond to a real heading in the scaffold.
  const headingTexts = new Set<string>();
  for (const node of base) {
    const t = headingText(node);
    if (t) headingTexts.add(t);
  }

  // Group exercises: those that fill a scaffold heading, and those that append.
  const byAnchor = new Map<string, unknown[][]>();
  const appended: unknown[][] = [];
  for (const ex of exercises) {
    // Tag every inserted node so a later run can strip it back out (idempotency) and
    // stamp its exercise identity so a per-exercise regenerate can find them again.
    const nodes = structuredClone(ex.nodes).map((n) => tagCompiled(n, ex.id));
    if (ex.anchor && headingTexts.has(ex.anchor)) {
      const list = byAnchor.get(ex.anchor) ?? [];
      list.push(nodes);
      byAnchor.set(ex.anchor, list);
    } else {
      appended.push(nodes);
    }
  }

  // Walk the scaffold, inserting each anchor's exercises right after the FIRST
  // heading whose text matches (a repeated heading is filled once).
  const out: unknown[] = [];
  const consumed = new Set<string>();
  for (const node of base) {
    out.push(node);
    const t = headingText(node);
    if (t && byAnchor.has(t) && !consumed.has(t)) {
      consumed.add(t);
      for (const group of byAnchor.get(t)!) out.push(...group);
    }
  }

  // A scaffold heading that nothing landed under — no spliced exercise and no
  // coordinator prose — would print as a bare heading over blank space on a
  // student's sheet. Drop those (empty parents fall with their empty children).
  // This runs BEFORE the append below: the anchorless / unmatched exercises belong
  // to no section, so they must not be "adopted" by (and thus rescue) a trailing
  // empty scaffold heading.
  const pruned = dropEmptyScaffoldHeadings(out);

  // Append the unmatched / anchorless exercises in position order after the last node.
  for (const group of appended) pruned.push(...group);

  return { version: 3, doc: { type: 'doc', content: pruned } };
}

// ── Image slots → image nodes ────────────────────────────────────────────────
//
// A generated image is authored as a `[Picture: …]` marker, which `markdownToDoc`
// passes through as literal text, so in body_doc it is a top-level `paragraph`
// whose only content is that one marker. The exercise route builds `image_slots`
// one-per-marker in the SAME order the markers appear, so within a row the k-th
// marker paragraph pairs with `image_slots[k]`. Where that slot has a non-null
// `storage_path`, the marker is replaced by a `ResizableImage` node (type `image`)
// carrying `storagePath` + `slotId`; `src` is left null so `resolveImageSrc`
// re-signs from the path (never a persisted, expiring URL). Where there is no paired
// slot, or its `storage_path` is null, the text marker is left exactly as it is —
// the pre-image fallback the teacher already sees, which must not regress.
//
// This lives in the pure module (not the server action) because BOTH writers need
// it identically: `compileWorksheet` on the initial build, and the client-side
// per-exercise splice when a single exercise is regenerated in the live document.

/** The flowing nodes of an exercise's body_doc, or [] when it carries none. */
export function exerciseNodes(bodyDoc: WorksheetDoc | null): unknown[] {
  if (!bodyDoc || typeof bodyDoc !== 'object') return [];
  const content = (bodyDoc as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

/**
 * If `node` is a marker paragraph — a `paragraph` whose entire content is text
 * nodes concatenating to exactly one `[Picture: …]` marker and nothing else —
 * return the trimmed marker text; otherwise null. A paragraph carrying a marker
 * plus any other text (or any non-text inline node) is NOT a marker paragraph. The
 * marker pattern (`PICTURE_MARKER_LINE`) is shared with `markdownToDoc` and the pane
 * so the three can never drift on what counts as a marker paragraph.
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
  return PICTURE_MARKER_LINE.test(text) ? text.trim() : null;
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
export function fillImageSlots(nodes: unknown[], slots: ImageSlot[]): unknown[] {
  let i = 0;
  return nodes.map((node) => {
    if (markerParagraphText(node) === null) return node;
    const slot = slots[i++]; // advance per marker, before the resolved-check
    return slot && slot.storage_path ? slotImageNode(slot) : node;
  });
}

/**
 * The placeholder nodes for an exercise whose generation FAILED (null body_doc).
 * Compile emits nothing for such a row, which would leave a failed exercise
 * invisible in the document; instead we emit one visible paragraph so the teacher
 * sees it failed and can regenerate it from the same gutter affordance. The nodes
 * are UNtagged here — `assembleWorksheetDoc` / the splice tags them with the
 * exercise's `wsCompiled` + `exerciseId` like any other exercise node. `text` is the
 * content-language string the caller resolves (server: subject language; client:
 * `context.contentLanguage`), so this module stays dependency-free.
 */
export function failedExercisePlaceholder(text: string): unknown[] {
  return [{ type: 'paragraph', content: [{ type: 'text', text }] }];
}

/** Where a per-exercise splice removes and inserts, as ARRAY INDICES into a doc's
 *  top-level node list (the caller maps them to ProseMirror positions). */
export interface SplicePlan {
  /** Indices of every top-level node carrying the exercise's id (may be non-contiguous). */
  removeIndices: number[];
  /** Index at which to insert the new nodes (the first removed node's slot; or, when
   *  none carry the id, just after the scaffold anchor heading, else the end). */
  insertIndex: number;
}

/**
 * Plan a per-exercise splice over a doc's top-level nodes.
 *
 * The range is EVERY top-level node carrying `exerciseId`, contiguous or not: the
 * new content replaces all of them and lands at the position the FIRST one held.
 * Teacher-authored nodes interleaved between them carry no id, are not in
 * `removeIndices`, and so survive untouched — ending up adjacent to the regenerated
 * content. Predictable and lossless over positional elegance.
 *
 * When NO node carries the id (the teacher deleted the exercise), insert just after
 * the exercise's scaffold `anchor` heading if one exists, otherwise append at the end.
 */
export function planExerciseSplice(
  topNodes: unknown[],
  exerciseId: string,
  anchor: string | null,
): SplicePlan {
  const removeIndices: number[] = [];
  topNodes.forEach((n, i) => {
    if (nodeExerciseId(n) === exerciseId) removeIndices.push(i);
  });
  if (removeIndices.length > 0) {
    return { removeIndices, insertIndex: removeIndices[0] };
  }
  if (anchor) {
    for (let i = 0; i < topNodes.length; i++) {
      if (headingText(topNodes[i]) === anchor) return { removeIndices: [], insertIndex: i + 1 };
    }
  }
  return { removeIndices: [], insertIndex: topNodes.length };
}
