// Pure worksheet ASSEMBLY — the fill-not-replace core of `compileWorksheet`,
// factored out of the server action so it is deterministic, dependency-free, and
// unit-testable (no DB, no `server-only`, no secrets). The action reads the
// scaffold + exercise rows and hands the prepared inputs here; this module owns the
// anchor matching, the `wsCompiled` idempotency marker, and the node layout.
//
// It is intentionally NOT `server-only`: it carries no privileged data and is
// imported by tests directly. `compileWorksheet` (a server action) composes it.

import type { WorksheetV3, WorksheetDoc } from '@/types/lesson';
import type { ImageSlot, WorksheetItem } from '@/types/worksheet-exercise';
import { PICTURE_MARKER, PICTURE_MARKER_LINE } from '@/lib/editor/markdown';
import { composeExerciseItems, type YearBand } from '@/lib/ai/worksheet-compose';
import { toBlockSlot, type BlockSlot } from '@/lib/ai/worksheet-blocks';
import type { FramePlaceholders } from '@/lib/worksheet-frame/frame';
import {
  MASTHEAD_DEPARTMENT,
  MASTHEAD_LESSON_TITLE,
  isBodyLabelLine,
  isEmptyFormatLine,
  isFormatLine,
  isInsertBox,
  isItalicOnlyParagraph,
  isStubLine,
  matchHeadingSlots,
  nodeText,
} from '@/lib/ai/worksheet-headings';

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

/** The marker stamped on every heading compile takes from the subject's template
 *  scaffold, so the editor's `ScaffoldHeadingLock` can positively identify a section
 *  heading (and leave exercise + teacher-authored headings freely editable). Declared,
 *  like the others, by `WsCompiledMarker` (default false, `renderHTML` → {}). */
export const SCAFFOLD_ATTR = 'wsScaffold';

/** Tag a base (scaffold) node: stamp `wsScaffold: true` on a heading so the editor can
 *  lock it, and pass every other node through unchanged. */
function markScaffoldHeading(node: unknown): unknown {
  if (!node || typeof node !== 'object' || (node as { type?: unknown }).type !== 'heading') return node;
  const n = node as Record<string, unknown>;
  const attrs = n.attrs && typeof n.attrs === 'object' ? (n.attrs as Record<string, unknown>) : {};
  return { ...n, attrs: { ...attrs, [SCAFFOLD_ATTR]: true } };
}

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

/** One exercise ready to place: its row `id` (stamped onto every node so a later
 *  per-exercise regenerate can find them), its `template_anchor` (or null), its plan-step
 *  `slot` (the `{{block:…}}` token it belongs to, or null/absent for legacy rows), and
 *  its flowing top-level nodes (image slots already resolved by the caller). */
export interface PreparedExercise {
  id: string;
  anchor: string | null;
  slot?: BlockSlot | null;
  nodes: unknown[];
}

/** Optional inputs that switch on token-driven filling. */
export interface AssembleOptions {
  /** Teacher-written plan content per slot, from `buildBlockContent`. */
  blockContent?: Partial<Record<BlockSlot, unknown[]>>;
  /** Values for `{{subject}}` / `{{theme}}` / … tokens in the template body. */
  placeholders?: FramePlaceholders;
}

const TOKEN_TEXT = /^\s*\{\{\s*block:\s*([a-z_]+)\s*\}\}\s*$/i;

/** The slot a node is a `{{block:<slot>}}` token for, or null. Matches a top-level
 *  paragraph whose whole text is the token (what `markdownToDoc` emits). */
function tokenSlot(node: unknown): BlockSlot | null {
  const n = node as { type?: string; content?: unknown[]; attrs?: unknown };
  if (!n || n.type !== 'paragraph' || isCompiled(n) || !Array.isArray(n.content)) return null;
  const text = n.content
    .map((c) => (c && typeof c === 'object' ? ((c as { text?: string }).text ?? '') : ''))
    .join('');
  const m = TOKEN_TEXT.exec(text);
  return m ? toBlockSlot(m[1].toLowerCase()) : null;
}

/** True for an empty paragraph/heading carrying a HintPlaceholder `placeholder` attr. */
function isHintNode(node: unknown): boolean {
  const n = node as { type?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  if (!n || (n.type !== 'paragraph' && n.type !== 'heading') || isCompiled(n)) return false;
  const ph = n.attrs?.placeholder;
  return typeof ph === 'string' && ph.trim().length > 0 && (!n.content || n.content.length === 0);
}

/** Masthead placeholders in heading mode: `[Department Name]` is replaced as a SUBSTRING of
 *  any text node, `Lesson Title` only when the text node is EXACTLY that. An empty value
 *  leaves the literal alone. Mutates the (already cloned) tree. */
function fillMasthead(node: unknown, subject: string, theme: string): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text' && typeof n.text === 'string') {
    if (subject && n.text.includes(MASTHEAD_DEPARTMENT)) n.text = n.text.split(MASTHEAD_DEPARTMENT).join(subject);
    if (theme && n.text.trim() === MASTHEAD_LESSON_TITLE) n.text = theme;
  }
  if (Array.isArray(n.content)) for (const c of n.content) fillMasthead(c, subject, theme);
}

/**
 * Fill ONE heading-matched section (`sec` = the nodes between its heading and the next).
 * Reuses the #453 content (`text` = `buildBlockContent` nodes, `groups` = the slot's
 * exercises) — only PLACEMENT is new:
 *  - the section's lone italic hint line becomes an empty HintPlaceholder node (never
 *    prints) — whether or not the section has content;
 *  - with content: an empty `Format:` line takes the plan's Format line (never a second
 *    one), stub lines / `[Insert …]` boxes / old empty hint nodes are dropped, and the text
 *    then the exercises go after the `Task instructions:` / `Questions / checks:` label,
 *    else after the hint.
 */
function fillSection(sec: unknown[], text: unknown[], groups: unknown[][]): unknown[] {
  // The hint: the italic-only paragraph first under the heading, or under its Format line.
  const hintIdx = isItalicOnlyParagraph(sec[0])
    ? 0
    : isFormatLine(sec[0]) && isItalicOnlyParagraph(sec[1])
      ? 1
      : -1;
  const formatIdx = isFormatLine(sec[0]) ? 0 : hintIdx === 0 && isFormatLine(sec[1]) ? 1 : -1;
  const blank = (node: unknown): unknown => ({
    type: 'paragraph',
    attrs: { placeholder: nodeText(node).trim() },
  });

  const hasContent = text.length > 0 || groups.length > 0;
  if (!hasContent) return sec.map((node, i) => (i === hintIdx ? blank(node) : node));

  // An empty template Format line absorbs the plan's own Format line (same label, now with
  // the activity title); a filled one wins. Either way no second Format line is added.
  const planText = [...text];
  let formatLine: unknown = formatIdx >= 0 ? sec[formatIdx] : null;
  if (formatIdx >= 0 && isFormatLine(planText[0])) {
    const planFormat = planText.shift();
    if (isEmptyFormatLine(sec[formatIdx])) formatLine = planFormat;
  }

  const kept: unknown[] = [];
  let hintPos = -1;
  let labelPos = -1;
  sec.forEach((node, i) => {
    if (i === hintIdx) {
      kept.push(blank(node));
      hintPos = Math.max(hintPos, kept.length - 1);
      return;
    }
    if (i === formatIdx) {
      kept.push(formatLine);
      hintPos = Math.max(hintPos, kept.length - 1);
      return;
    }
    if (isStubLine(node) || isInsertBox(node) || isHintNode(node)) return; // dropped: it has content now
    kept.push(node);
    if (labelPos < 0 && isBodyLabelLine(node)) labelPos = kept.length - 1;
  });
  const at = (labelPos >= 0 ? labelPos : hintPos) + 1;
  return [...kept.slice(0, at), ...planText, ...groups.flat(), ...kept.slice(at)];
}

const FIELD_TOKEN = /\{\{\s*(subject|year|theme|centre|objective|lesson_key)\s*\}\}/gi;

/** Substitute `{{subject}}`-style field tokens in every text node of the template body
 *  (deep). Known tokens with no value render empty; other `{{…}}` text is left alone so
 *  an editor's typo stays visible. Mutates the (already cloned) tree. */
function fillFieldTokens(node: unknown, values: FramePlaceholders): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text' && typeof n.text === 'string') {
    n.text = n.text.replace(FIELD_TOKEN, (_m, name: string) => {
      const v = values[name.toLowerCase() as keyof FramePlaceholders];
      return v == null ? '' : String(v);
    });
  }
  if (Array.isArray(n.content)) for (const c of n.content) fillFieldTokens(c, values);
}

/**
 * Assemble the compiled worksheet: fill the subject's template scaffold with the plan.
 *
 * TOKEN MODE (the template contains `{{block:<slot>}}` paragraphs). Each token is
 * replaced by that plan step's content: the teacher's own text (`blockContent`,
 * verbatim), then every AI exercise planned for the slot as ONE contiguous group. Any
 * hint/stub lines directly above the token are dropped when the slot has content; an
 * empty slot keeps them. Exercises with no slot (legacy rows) or whose token is absent
 * fall back to heading-anchor placement, else append — so nothing is ever lost.
 *
 * HEADING MODE (no tokens). The standard section headings are recognised through the
 * synonyms table in `worksheet-headings.ts` ("4. Independent Practice" →
 * `independent_practice`) and filled exactly like a token slot (see `fillSection`). A
 * heading that matches nothing, or is ambiguous, is left exactly as in anchor mode below.
 * The masthead's `[Department Name]` / `Lesson Title` literals are filled too.
 *
 * ANCHOR MODE (no tokens and no recognised headings). Exactly the original behaviour: each
 * exercise lands right after the FIRST heading whose exact trimmed text equals its
 * `anchor`; the rest append in order. Plan text is NOT placed (no slots to place it).
 *
 * In both modes every scaffold heading is kept — an empty section keeps its heading
 * (no pruning) — headings are never moved or split, and `{{subject}}`/`{{theme}}`-style
 * field tokens in the template body are filled from `options.placeholders`.
 *
 * IDEMPOTENCY: the base is `stripCompiled`ed first and every inserted node is
 * `tagCompiled` (exercise nodes with their exercise id, plan-text nodes without). It is
 * a pure function of (scaffold, exercises, options): re-running it — even feeding a
 * prior run's output back as the base — yields byte-identical output. Inputs are
 * deep-cloned, so callers' arrays are never mutated.
 */
export function assembleWorksheetDoc(
  baseContent: unknown[],
  exercises: PreparedExercise[],
  options: AssembleOptions = {},
): WorksheetV3 {
  // Recover the bare scaffold and isolate from caller state. Every scaffold heading is
  // stamped `wsScaffold` so the editor can lock it (see ScaffoldHeadingLock).
  const base = stripCompiled(structuredClone(baseContent)).map(markScaffoldHeading);
  if (options.placeholders) for (const node of base) fillFieldTokens(node, options.placeholders);

  const tokenSlots = new Set<BlockSlot>();
  for (const node of base) {
    const slot = tokenSlot(node);
    if (slot) tokenSlots.add(slot);
  }

  // HEADING MODE: only when the template has no tokens (token mode always wins).
  const headingSlots = tokenSlots.size === 0 ? matchHeadingSlots(base) : new Map<number, BlockSlot>();
  if (headingSlots.size > 0 && options.placeholders) {
    const { subject, theme } = options.placeholders;
    for (const node of base) fillMasthead(node, String(subject ?? ''), String(theme ?? ''));
  }
  const matchedSlots = tokenSlots.size > 0 ? tokenSlots : new Set<BlockSlot>(headingSlots.values());

  const headingTexts = new Set<string>();
  for (const node of base) {
    const t = headingText(node);
    if (t) headingTexts.add(t);
  }

  // Group exercises: by slot token first, else by heading anchor, else append.
  const bySlot = new Map<BlockSlot, unknown[][]>();
  const byAnchor = new Map<string, unknown[][]>();
  const appended: unknown[][] = [];
  for (const ex of exercises) {
    // Every node of an exercise is stamped with the exercise id and placed as ONE
    // group, so an exercise can never be split by (or leak across) a heading.
    const nodes = structuredClone(ex.nodes).map((n) => tagCompiled(n, ex.id));
    if (ex.slot && matchedSlots.has(ex.slot)) {
      const list = bySlot.get(ex.slot) ?? [];
      list.push(nodes);
      bySlot.set(ex.slot, list);
    } else if (ex.anchor && headingTexts.has(ex.anchor)) {
      const list = byAnchor.get(ex.anchor) ?? [];
      list.push(nodes);
      byAnchor.set(ex.anchor, list);
    } else {
      appended.push(nodes);
    }
  }

  const out: unknown[] = [];
  const consumedHeadings = new Set<string>();
  const consumedSlots = new Set<BlockSlot>();
  for (let i = 0; i < base.length; i++) {
    const node = base[i];
    const slot = tokenSlot(node);
    if (slot) {
      // First token for a slot takes the content; a repeated token is just removed.
      if (!consumedSlots.has(slot)) {
        consumedSlots.add(slot);
        const text = (options.blockContent?.[slot] ?? []).map((n) => tagCompiled(structuredClone(n)));
        const groups = bySlot.get(slot) ?? [];
        if (text.length > 0 || groups.length > 0) {
          // The content replaces the hint/stub lines directly above the token.
          while (out.length > 0 && isHintNode(out[out.length - 1])) out.pop();
          out.push(...text);
          for (const group of groups) out.push(...group);
        }
      }
      continue; // the token paragraph itself never prints
    }
    out.push(node);
    const t = headingText(node);
    if (t && byAnchor.has(t) && !consumedHeadings.has(t)) {
      consumedHeadings.add(t);
      for (const group of byAnchor.get(t)!) out.push(...group);
    }
    const headingSlot = headingSlots.get(i);
    if (headingSlot) {
      // The section runs to the next heading; fill it and skip past its scaffold nodes.
      let end = i + 1;
      while (end < base.length && (base[end] as { type?: string })?.type !== 'heading') end++;
      const text = (options.blockContent?.[headingSlot] ?? []).map((n) => tagCompiled(structuredClone(n)));
      out.push(...fillSection(base.slice(i + 1, end), text, bySlot.get(headingSlot) ?? []));
      i = end - 1;
    }
  }

  // Unmatched / anchorless exercises append in position order after the last node.
  for (const group of appended) out.push(...group);

  return { version: 3, doc: { type: 'doc', content: out } };
}

// ── Image slots → inline image nodes ─────────────────────────────────────────
//
// A generated image is authored as a `[Picture: …]` marker, which `markdownToDoc`
// passes through as literal text. The exercise route builds `image_slots` one-per-
// marker in the SAME order the markers appear, so the k-th marker (in document order)
// pairs with `image_slots[k]`. Where that slot has a non-null `storage_path`, the
// marker RUN inside its text node is replaced IN PLACE by an inline `ResizableImage`
// node (type `image`, `inline: true`) carrying `storagePath` + `slotId`; `src` is left
// null so `resolveImageSrc` re-signs from the path (never a persisted, expiring URL).
//
// Because the image is inline, the surrounding text stays put: a marker alone in its
// paragraph becomes a paragraph holding just the image (the legal inline form of the
// old top-level block image), and a marker embedded in a sentence ("… the [Picture: a
// fox] jumped …") becomes an image sitting BETWEEN the words. Where there is no paired
// slot, or its `storage_path` is null, the marker text is left exactly as it is — the
// pre-image fallback the teacher already sees, which must not regress.
//
// This lives in the pure module (not the server action) because BOTH writers need it
// identically: `compileWorksheet` on the initial build, and the client-side per-
// exercise splice when a single exercise is regenerated in the live document.

/** The flowing nodes of an exercise's body_doc, or [] when it carries none. */
export function exerciseNodes(bodyDoc: WorksheetDoc | null): unknown[] {
  if (!bodyDoc || typeof bodyDoc !== 'object') return [];
  const content = (bodyDoc as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

/** The inline `image` node for a resolved slot. `src` stays null — `resolveImageSrc`
 *  serves from `storagePath` through the re-signing route. `brief` is stamped on so a
 *  per-image regenerate can re-send it (it round-trips via getJSON yet never prints —
 *  see `worksheetImageAttributes`). */
function slotImageNode(slot: ImageSlot): unknown {
  return {
    type: 'image',
    attrs: {
      src: null,
      alt: slot.subject ?? null,
      storagePath: slot.storage_path,
      slotId: slot.slot_id,
      brief: slot.brief ?? null,
    },
  };
}

/** A loose text/inline node as it appears in body_doc JSON. */
type InlineNode = { type?: unknown; text?: unknown; marks?: unknown };

/**
 * Split one text node on its `[Picture: …]` markers, resolving each against the next
 * slot from `take`. Returns the replacement inline nodes: the text before/after each
 * marker (with its marks preserved), and either an inline image node (slot ready) or
 * the marker's literal text (no slot / not ready). Empty text pieces are dropped so no
 * zero-length text node reaches the schema.
 */
function splitTextOnMarkers(
  node: InlineNode,
  take: () => ImageSlot | undefined,
): unknown[] {
  const text = node.text as string;
  const marks = node.marks;
  const textPiece = (t: string): unknown => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
  const out: unknown[] = [];
  let last = 0;
  // A fresh global regex per call — never the shared non-global PICTURE_MARKER — so
  // there is no `lastIndex` state to leak between text nodes.
  for (const match of text.matchAll(new RegExp(PICTURE_MARKER.source, 'g'))) {
    const idx = match.index ?? 0;
    if (idx > last) out.push(textPiece(text.slice(last, idx)));
    const slot = take(); // advance per marker, resolved or not
    out.push(slot && slot.storage_path ? slotImageNode(slot) : textPiece(match[0]));
    last = idx + match[0].length;
  }
  if (last < text.length) out.push(textPiece(text.slice(last)));
  return out;
}

/**
 * Replace every `[Picture: …]` marker across one exercise's nodes with its paired
 * slot's inline image, where that slot is ready. Markers are matched in DOCUMENT ORDER
 * wherever they sit in a text run (alone in a paragraph, or beside words, or nested in
 * a list item / table cell), and each advances the slot index — resolved or not — so a
 * null-storage marker never shifts a later pairing. The image is spliced INLINE into
 * its paragraph, so surrounding text keeps its place.
 *
 * The top-level node COUNT is preserved (only inline content within nodes changes), so
 * exercise-identity tagging (`tagCompiled`) and the per-exercise splice still key off
 * the same top-level nodes. Nodes with no markers pass through by reference.
 */
export function fillImageSlots(nodes: unknown[], slots: ImageSlot[]): unknown[] {
  let i = 0;
  const take = (): ImageSlot | undefined => slots[i++];

  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node;
    const n = node as { type?: unknown; content?: unknown };
    if (!Array.isArray(n.content)) return node;
    let changed = false;
    const content: unknown[] = [];
    for (const child of n.content) {
      const c = child as InlineNode;
      if (c && c.type === 'text' && typeof c.text === 'string' && PICTURE_MARKER.test(c.text)) {
        content.push(...splitTextOnMarkers(c, take));
        changed = true;
      } else {
        const healed = walk(child);
        if (healed !== child) changed = true;
        content.push(healed);
      }
    }
    return changed ? { ...(node as object), content } : node;
  };

  return nodes.map(walk);
}

// ── Size every image by how many the exercise has (count-based, layout-INDEPENDENT) ──
//
// A generated image carries no width, so on the page it prints at full column width — fine
// for a lone illustration, unusable once an exercise has several. The sizing signal is HOW
// MANY images the exercise holds and NOTHING ELSE: an exercise with four scattered picture-
// prompts (each `[Picture: …]` sitting between numbered `**1.**` sentences, so `markdownToDoc`
// makes NO list and `layoutExercisePictures` matches NO grid) must get the SAME small images
// as a four-card flashcard grid. Sizing that only fell out of BUILDING a grid was the bug —
// a non-grid exercise kept full-width images no matter how many it had.
//
// This runs AFTER `fillImageSlots` (over the real `image` nodes, ready slots only, so it
// counts what will actually print) and is applied at EVERY call site, table or not. Width is
// an explicit pixel value against the fixed A4 text column — the same layout width the editor
// and the "full width" control use — because compile has no DOM to measure. Crucially the
// image `renderHTML` emits `width:Npx; max-width:100%`, so this explicit width is CAPPED by a
// narrow flashcard/media cell (the grid keeps sizing those via the cell) yet TAKES EFFECT for
// a bare image alone in its paragraph — which is exactly the case that used to print huge.

/** The A4 editable text-column width in layout px: PAGE_WIDTH − 2× side pad. Mirrors the page
 *  geometry in `doc/theme.ts` (794 − 2×56); kept local so this pure module stays dependency-
 *  free. Images size as a fraction of THIS, so a count-based width means the same in the
 *  editor (an A4-scaled page) and in print (physical A4). */
const TEXT_COLUMN_WIDTH = 794 - 2 * 56;

/**
 * Target width (layout px) for each image when an exercise holds `count` of them, or null
 * (natural / full width) for a lone image, which stays large. 2–3 read medium, 4+ small —
 * the same 2–3-vs-4+ split the flashcard grid uses (`SIDE_BY_SIDE_MAX`), so a scattered set
 * and a grid of the same count land at the same size.
 */
export function imageWidthForCount(count: number): number | null {
  if (count <= 1) return null;
  const fraction = count === 2 ? 0.46 : count === 3 ? 0.3 : 0.22;
  return Math.round(TEXT_COLUMN_WIDTH * fraction);
}

/** Count every `image` node anywhere in `nodes` — into list items and table cells too. */
function countImageNodes(nodes: unknown[]): number {
  let n = 0;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const x = node as { type?: unknown; content?: unknown };
    if (x.type === 'image') n += 1;
    if (Array.isArray(x.content)) x.content.forEach(walk);
  };
  nodes.forEach(walk);
  return n;
}

/**
 * Stamp a count-based `width` on every image node of ONE exercise, so images size by how many
 * the exercise has — never by whether a layout pattern matched. Run AFTER `fillImageSlots`.
 *
 * Deterministic and idempotent: the width is a pure function of the image count, so re-running
 * (or re-compiling) reproduces it. An image that already carries an explicit `width` — a
 * teacher's drag-resize — is left untouched, so a re-compile never overrides a manual size.
 * Nodes with no images (0 or 1) pass through by reference; walks into cells and list items so
 * a grid's images are sized the same as loose ones (their cell's `max-width:100%` then caps
 * the value, keeping the grid's own layout intact).
 */
export function sizeImagesByCount(nodes: unknown[]): unknown[] {
  const width = imageWidthForCount(countImageNodes(nodes));
  if (width == null) return nodes; // 0 or 1 image → nothing to shrink
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node;
    const n = node as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown };
    if (n.type === 'image') {
      if (n.attrs?.width != null) return node; // respect a teacher-set width
      return { ...(node as object), attrs: { ...(n.attrs ?? {}), width } };
    }
    if (!Array.isArray(n.content)) return node;
    let changed = false;
    const content = n.content.map((c) => {
      const healed = walk(c);
      if (healed !== c) changed = true;
      return healed;
    });
    return changed ? { ...(node as object), content } : node;
  };
  return nodes.map(walk);
}

// ── Picture layout: flashcard grid + image-beside-sentence rows (compile-time) ─
//
// A bare inline image carries no width, so on the page it prints at full size — one
// picture per line down the sheet, unusable when an exercise has several. Compile sizes
// pictures by arranging them into tables whose cells constrain the width. TWO shapes the
// model writes, both keyed on STRUCTURE (never on a label's content, which keeps
// changing) and both built BEFORE `fillImageSlots` — while the pictures are still
// `[Picture: …]` markers, because `fillImageSlots` splices each image INLINE into its
// paragraph (there is no top-level image node to group afterwards). Once a table is built,
// `fillImageSlots` walks into its cells and resolves the markers there.
//
//   • FLASHCARD GRID — a run of consecutive `[Picture: …]` marker paragraphs, each with
//     at most one short line between (a **bold** word, a `### word` heading, or nothing —
//     the model's `______` writing blank is dropped by markdownToDoc, so a blank card
//     arrives label-less and the layout synthesises the writing line). Two or more become
//     a grid (3–4 per row → each small); a lone card stays large.
//
//   • IMAGE-BESIDE-SENTENCE ROWS — a picture-prompted gap fill: a `[Picture: …]` marker
//     followed by a NUMBERED line (an `orderedList`/`bulletList` after markdownToDoc),
//     repeated. Each picture belongs beside its OWN sentence, NOT in a shared grid, so
//     this builds a two-column table — a narrow picture column, the sentence beside it —
//     one row per pair. The narrow column is what sizes the picture down.
//
// The two are told apart by what FOLLOWS a marker: another marker or a short word → a
// flashcard; a list (the numbered sentence) → an image-beside-sentence row.

/** Concatenated text of a node's direct children, or null if any child is a non-text node
 *  (an inline image, hard break, …) — i.e. the node is not a plain single-line text node. */
function pureText(node: unknown): string | null {
  const content = (node as { content?: unknown })?.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  let text = '';
  for (const child of content) {
    const c = child as { type?: unknown; text?: unknown };
    if (c?.type !== 'text' || typeof c.text !== 'string') return null;
    text += c.text;
  }
  return text;
}

/** A top-level paragraph whose ENTIRE text is one `[Picture: …]` marker — the picture side
 *  of a flashcard, before `fillImageSlots` turns the marker into an inline image. */
function isPictureMarkerParagraph(node: unknown): boolean {
  if ((node as { type?: unknown })?.type !== 'paragraph') return false;
  const text = pureText(node);
  return text !== null && PICTURE_MARKER_LINE.test(text);
}

/** The one short "line" that may sit between two picture markers — the word under a card.
 *  STRUCTURE, not content: a `paragraph` (older `**bold**`) OR a level-3 `heading` (the
 *  `### word` the heading contract now produces), short (≤ 3 words, ≤ 24 chars), and not
 *  itself a picture marker. A level-2 `##` TITLE is never a label (it breaks the run). */
function isShortLabel(node: unknown): boolean {
  const n = node as { type?: unknown; attrs?: { level?: unknown } };
  const isPara = n?.type === 'paragraph';
  const isLabelHeading = n?.type === 'heading' && Number(n.attrs?.level) === 3;
  if (!isPara && !isLabelHeading) return false;
  const text = pureText(node);
  if (text === null) return false;
  const trimmed = text.trim();
  if (!trimmed || PICTURE_MARKER_LINE.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 3 && trimmed.length <= 24;
}

/** A blank writing line for a card with no word — "say the word, then write it here". A
 *  short underscore run (what the model itself writes as `______`, before markdownToDoc
 *  drops it as a thematic break). */
function writingLine(): unknown {
  return { type: 'paragraph', content: [{ type: 'text', text: '__________' }] };
}

/** The "sentence" side of a picture-prompted gap fill: the numbered line the model writes
 *  under a picture, which markdownToDoc turns into a list (`1. The ___ is …` → a single-
 *  item `orderedList`; a `- …` prompt → a `bulletList`). A marker followed by one of these
 *  is an image-beside-sentence row, NOT a flashcard — the picture belongs beside its own
 *  sentence. A short LABEL (a word) is never a list, so the two shapes never collide. */
function isMediaBody(node: unknown): boolean {
  const t = (node as { type?: unknown })?.type;
  return t === 'orderedList' || t === 'bulletList';
}

/** The OTHER "sentence" the model actually writes for a picture-prompted gap fill: a
 *  paragraph that OPENS with a number, e.g. `**1.** The ___ is …`. The model bolds the
 *  number (`**1.**`), so markdownToDoc makes a plain bold PARAGRAPH — never an ordered
 *  list — which is exactly why `isMediaBody` (list-only) missed this shape and the pairs
 *  stacked. STRUCTURE, not content: a single-line `paragraph` (all text, no inline image)
 *  whose trimmed text starts `1.` / `1)` and is not itself a picture marker. Length is not
 *  constrained — these are full one-line prompts, not short labels. */
function isNumberedSentence(node: unknown): boolean {
  if ((node as { type?: unknown })?.type !== 'paragraph') return false;
  const text = pureText(node);
  if (text === null) return false;
  const trimmed = text.trim();
  if (!trimmed || PICTURE_MARKER_LINE.test(trimmed)) return false;
  return /^\d+[.)]\s/.test(trimmed);
}

/** A numbered-sentence ↔ picture pair starting at `nodes[i]`, in EITHER order (the model
 *  usually writes the sentence first, then its `[Picture: …]`, but tolerate the reverse),
 *  or null when the two nodes at `i` are not such a pair. Normalised so the caller always
 *  gets `{ sentence, marker }` regardless of which came first. */
function sentencePictureAt(nodes: unknown[], i: number): { sentence: unknown; marker: unknown } | null {
  const a = nodes[i];
  const b = nodes[i + 1];
  if (isNumberedSentence(a) && isPictureMarkerParagraph(b)) return { sentence: a, marker: b };
  if (isPictureMarkerParagraph(a) && isNumberedSentence(b)) return { sentence: b, marker: a };
  return null;
}

/** Build the sentence-beside-image table for the numbered-sentence gap fill: one row per
 *  (sentence, picture) pair, the SENTENCE in the wide left column and its picture in the
 *  narrow right column. Mirror image of `mediaTable`'s column order — this shape reads as a
 *  worksheet (read the prompt, look at the picture on the right), and the narrow picture
 *  column is what sizes the image down. */
function sentencePictureTable(pairs: { sentence: unknown; marker: unknown }[]): unknown {
  const rows = pairs.map((p) => ({
    type: 'tableRow',
    content: [mediaCell('text', [p.sentence]), mediaCell('pic', [p.marker])],
  }));
  return { type: 'table', content: rows };
}

const SIDE_BY_SIDE_MAX = 3; // 1 image large; 2–3 side by side in one row; 4+ wrap to a grid.

/** Columns per row for a grid of `n` cards: 2–3 stay in one row; 4+ use 3 or 4 per row,
 *  whichever fills the last row best (fewest empty pad cells), preferring 4 on a tie. */
function perRowFor(n: number): number {
  if (n <= SIDE_BY_SIDE_MAX) return n;
  const pad = (perRow: number) => (perRow - (n % perRow)) % perRow;
  return pad(3) < pad(4) ? 3 : 4;
}

/** One grid cell holding a card's picture (marker paragraph, which `fillImageSlots` later
 *  fills) and its word — the model's label if it wrote one, else a blank writing line; or
 *  an empty cell used to pad a short final row so the table stays rectangular (ProseMirror
 *  requires it). `wsFlashcardCell` (declared by FlashcardTableStyle) renders the
 *  borderless-grid class and round-trips through getJSON. */
function flashcardCell(content: unknown[] | null): unknown {
  return {
    type: 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null, wsFlashcardCell: true },
    content: content ?? [{ type: 'paragraph' }],
  };
}

/** Build the flashcard grid table laying `cards` out `perRow` per row. */
function flashcardTable(cards: { marker: unknown; label: unknown | null }[], perRow: number): unknown {
  const rows: unknown[] = [];
  for (let r = 0; r < cards.length; r += perRow) {
    const cells = cards.slice(r, r + perRow).map((card) =>
      flashcardCell([card.marker, card.label ?? writingLine()]),
    );
    while (cells.length < perRow) cells.push(flashcardCell(null)); // pad → rectangular
    rows.push({ type: 'tableRow', content: cells });
  }
  return { type: 'table', content: rows };
}

/** One cell of an image-beside-sentence row: `role` is `'pic'` (the narrow picture column,
 *  which sizes the image down) or `'text'` (the sentence beside it). `wsMediaCell`
 *  (declared by MediaCellStyle) renders the borderless class + column width and round-trips
 *  through getJSON. */
function mediaCell(role: 'pic' | 'text', content: unknown[]): unknown {
  return {
    type: 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null, wsMediaCell: role },
    content,
  };
}

/** Build the image-beside-sentence table: one row per (picture, sentence) pair, the picture
 *  in a narrow left column and its numbered sentence beside it. */
function mediaTable(pairs: { marker: unknown; body: unknown }[]): unknown {
  const rows = pairs.map((p) => ({
    type: 'tableRow',
    content: [mediaCell('pic', [p.marker]), mediaCell('text', [p.body])],
  }));
  return { type: 'table', content: rows };
}

/**
 * Lay an exercise's pictures out as tables, BEFORE `fillImageSlots`, so each is sized by
 * its cell rather than printing full-width. Two shapes, told apart by what follows a
 * `[Picture: …]` marker:
 *
 *   • a NUMBERED SENTENCE next to a marker (`**1.**` bold, so markdownToDoc makes a
 *     paragraph, NOT a list — the shape the model actually writes), repeated → a two-column
 *     table with the SENTENCE wide on the left and its picture narrow on the right.
 *   • a marker followed by a NUMBERED line (a real markdown list) → an image-beside-sentence
 *     row (narrow picture | sentence); a run of such pairs becomes a two-column table.
 *   • otherwise → a flashcard run: consecutive markers each optionally trailed by one short
 *     word; two or more become a grid (a blank card gets a writing line), a lone card stays
 *     inline and large.
 *
 * Everything else passes through untouched, in order. `fillImageSlots` then walks into the
 * cells and splices each marker's image in place.
 */
export function layoutExercisePictures(nodes: unknown[]): unknown[] {
  const out: unknown[] = [];
  let i = 0;
  while (i < nodes.length) {
    // A RUN of numbered-sentence ↔ picture pairs (the `**1.**`-bold gap fill). Require TWO
    // consecutive pairs to start, so a single decorative picture that merely happens to sit
    // by a numbered line is left large (not forced into a narrow column). Each pair advances
    // by two; the sentence rides the wide left column, its picture the narrow right one.
    if (sentencePictureAt(nodes, i) && sentencePictureAt(nodes, i + 2)) {
      const pairs: { sentence: unknown; marker: unknown }[] = [];
      for (let p = sentencePictureAt(nodes, i); p; p = sentencePictureAt(nodes, i)) {
        pairs.push(p);
        i += 2;
      }
      out.push(sentencePictureTable(pairs));
      continue;
    }
    if (!isPictureMarkerParagraph(nodes[i])) {
      out.push(nodes[i]);
      i += 1;
      continue;
    }
    // A marker followed by a list (the numbered sentence) → image-beside-sentence rows.
    if (isMediaBody(nodes[i + 1])) {
      const pairs: { marker: unknown; body: unknown }[] = [];
      while (i < nodes.length && isPictureMarkerParagraph(nodes[i]) && isMediaBody(nodes[i + 1])) {
        pairs.push({ marker: nodes[i], body: nodes[i + 1] });
        i += 2;
      }
      out.push(mediaTable(pairs));
      continue;
    }
    // Otherwise a flashcard run — but a marker that is itself followed by a list belongs to
    // the media branch, so it ends this run rather than joining the grid.
    const cards: { marker: unknown; label: unknown | null }[] = [];
    while (i < nodes.length && isPictureMarkerParagraph(nodes[i]) && !isMediaBody(nodes[i + 1])) {
      const marker = nodes[i];
      i += 1;
      let label: unknown | null = null;
      if (i < nodes.length && isShortLabel(nodes[i])) {
        label = nodes[i];
        i += 1;
      }
      cards.push({ marker, label });
    }
    if (cards.length === 1) {
      out.push(cards[0].marker);
      if (cards[0].label) out.push(cards[0].label);
    } else {
      out.push(flashcardTable(cards, perRowFor(cards.length)));
    }
  }
  return out;
}

// ── The composed (items[]) path vs. the markdown path ─────────────────────────
//
// When the model declared `items[]`, compile READS the item shape and applies the
// first matching composition rule (`composeExerciseItems`) rather than pattern-matching
// its markdown to GUESS a layout. The markdown the model still returns (`body_doc`)
// carries only the framing prose — the `## Title`, the intro, `### Word Bank`,
// `### Extension` — plus a single `[Items]` marker paragraph declaring WHERE the
// composed arrangement sits. Compile replaces that marker with the composed nodes (or
// appends them when the model omitted the marker).
//
// No `items[]` → the exact same `layoutExercisePictures → fillImageSlots →
// sizeImagesByCount` pipeline as before, byte-for-byte. That is what keeps every
// existing document, and any generation the model returns without items, working
// exactly as it does today — the whole point of landing this in one branch.

/** A top-level paragraph whose entire text is the literal `[Items]` marker — the
 *  model's declaration of where the composed arrangement belongs. */
export const ITEMS_MARKER_LINE = /^\s*\[Items\]\s*$/i;

function isItemsMarkerParagraph(node: unknown): boolean {
  if ((node as { type?: unknown })?.type !== 'paragraph') return false;
  const text = pureText(node);
  return text !== null && ITEMS_MARKER_LINE.test(text.trim());
}

/** Replace the first `[Items]` marker paragraph in `framing` with the composed nodes,
 *  or append them when there is no marker (a model that declared items but no marker). */
function spliceComposedAtMarker(framing: unknown[], composed: unknown[]): unknown[] {
  const idx = framing.findIndex(isItemsMarkerParagraph);
  if (idx === -1) return [...framing, ...composed];
  return [...framing.slice(0, idx), ...composed, ...framing.slice(idx + 1)];
}

/** The composition inputs a row carries when the model declared `items[]`. `band` is
 *  the lesson's year band (from `classes.year`), which parameterises every rule. */
export interface ExerciseComposition {
  items: WorksheetItem[] | null | undefined;
  passage: string | null | undefined;
  band: YearBand;
}

/**
 * Build one exercise's top-level nodes. With `items[]`, compose them by rule and splice
 * the result into the framing prose at the `[Items]` marker; without, run the unchanged
 * markdown path. Both writers — `compileWorksheet` and the per-exercise splice — call
 * this, so the two paths can never drift on which pipeline an exercise gets.
 *
 * `sizeImagesByCount` runs on both outputs: it respects the year-band widths the
 * composer already set (it never overrides an explicit `width`), and sizes any stray
 * image on the markdown path exactly as before.
 */
export function buildExerciseContent(
  bodyDoc: WorksheetDoc | null,
  imageSlots: ImageSlot[],
  composition: ExerciseComposition | null,
): unknown[] {
  const items = (composition?.items ?? []).filter(
    (it): it is WorksheetItem => !!it && typeof it === 'object',
  );
  if (composition && items.length > 0) {
    const composed = composeExerciseItems({
      items,
      passage: composition.passage,
      band: composition.band,
      slots: imageSlots,
    });
    // The composer resolved item pictures by subject already; the framing prose carries
    // no picture markers in the items path (floor), so no `fillImageSlots` here.
    return sizeImagesByCount(spliceComposedAtMarker(exerciseNodes(bodyDoc), composed));
  }
  // No items → today's markdown path, unchanged.
  return sizeImagesByCount(
    fillImageSlots(layoutExercisePictures(exerciseNodes(bodyDoc)), imageSlots),
  );
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
