// Pure worksheet ASSEMBLY — the fill-not-replace core of `compileWorksheet`,
// factored out of the server action so it is deterministic, dependency-free, and
// unit-testable (no DB, no `server-only`, no secrets). The action reads the
// scaffold + exercise rows and hands the prepared inputs here; this module owns the
// anchor matching, the `wsCompiled` idempotency marker, and the node layout.
//
// It is intentionally NOT `server-only`: it carries no privileged data and is
// imported by tests directly. `compileWorksheet` (a server action) composes it.

import type { WorksheetV3 } from '@/types/lesson';

/** The marker attr stamped on every node compile inserts, so a later run can strip
 *  it. A plain JSON attribute — no schema/migration change. The `WsCompiledMarker`
 *  editor extension declares it (default `false`, `renderHTML` → `{}`) so it
 *  survives a `getJSON()` round trip yet emits nothing to printed HTML / PDF. Kept
 *  in sync with that extension's attribute name by hand. */
export const COMPILED_ATTR = 'wsCompiled';

/** Tag one top-level node as compile-inserted (idempotency marker). */
export function tagCompiled(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  const n = node as Record<string, unknown>;
  const attrs = n.attrs && typeof n.attrs === 'object' ? (n.attrs as Record<string, unknown>) : {};
  return { ...n, attrs: { ...attrs, [COMPILED_ATTR]: true } };
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

/** One exercise ready to place: its `template_anchor` (or null) and its flowing
 *  top-level nodes (image slots already resolved by the caller). */
export interface PreparedExercise {
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
    // Tag every inserted node so a later run can strip it back out (idempotency).
    const nodes = structuredClone(ex.nodes).map(tagCompiled);
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
