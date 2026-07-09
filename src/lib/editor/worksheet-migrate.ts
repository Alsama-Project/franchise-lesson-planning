// Migrate the v2 block-based worksheet (an ordered list of Free / resource blocks,
// each Free block a tiptap doc plus block-owned floating overlays) into the v3
// shape: a SINGLE continuous tiptap document (Docs-style flow).
//
// This module is deliberately PURE — no `@tiptap/*`, no DOM, no network. It only
// reshapes plain JSON, so it runs identically in the unit tests, in the headless
// dry-run script (Node, service role), and at read time in the browser. The
// forward transform (`migrateWorksheetToV3`) is idempotent and reversible: the
// reverse (`migrateV3ToV2`, in ./worksheet) lets an old-builder read degrade a v3
// row gracefully instead of hitting the empty-worksheet fallback.
//
// Amendment map (approved Phase 1 plan):
//  - No generatedResource node / no persisted `fromAI`: AI content is already plain
//    flowing nodes in each Free block's doc, so it just concatenates through.
//  - No resourceRef *editing* chrome: a legacy `kind:'resource'` block cannot be
//    resolved to inline content here (buildBlocksFromResource is async + needs the
//    browser: signed-URL fetch, <img> decode, pdf.js, re-upload), so it migrates to
//    a RENDER-ONLY `resourceRef` node. See `RESOURCE_REF_NOTE`.
//  - Floating elements flatten into the flow: images → inline image nodes,
//    text boxes → blockquote "callout" blocks (empty text boxes are dropped).
//  - Text-box-over-image overlaps are DETECTED and reported (never silently
//    flattened blind) — see `findFloatingOverImage` / the dry-run summary.

import type {
  FloatingElement,
  FloatingImage,
  FloatingTextBox,
  Worksheet,
  WorksheetDoc,
  WorksheetV3,
} from '@/types/lesson';
import { parseWorksheet } from './worksheet';

/** Why legacy resource blocks become a render-only node rather than inline content. */
export const RESOURCE_REF_NOTE =
  'buildBlocksFromResource is async and browser-only (signed-URL fetch, image ' +
  'decode, pdf.js render, storage re-upload); it cannot run in the pure/headless ' +
  'migration boundary, so kind:"resource" blocks migrate to a render-only ' +
  'resourceRef node (rendered read-only via ResourceBlock).';

/** A minimal tiptap node shape (the migration only ever reads/writes JSON). */
type DocNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: unknown[];
};

// ── Detection: which on-disk shape a raw column value is ────────────────────

export type SourceVersion = 'v1' | 'v2' | 'v3' | 'empty' | 'unknown';

/** Classify the raw `lesson_plans.worksheet` value without mutating it. */
export function sourceVersion(raw: unknown): SourceVersion {
  if (raw == null) return 'empty';
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'unknown';
  const obj = raw as Record<string, unknown>;
  if (obj.version === 3 && isDocNode(obj.doc)) return 'v3';
  if (obj.version === 2 && Array.isArray(obj.blocks)) return 'v2';
  if (obj.type === 'doc') return 'v1';
  return 'unknown';
}

/** True for a value that looks like a tiptap `doc` node. */
function isDocNode(value: unknown): value is DocNode {
  return typeof value === 'object' && value !== null && (value as DocNode).type === 'doc';
}

/** True when raw is already a v3 envelope (drives idempotency). */
export function isWorksheetV3(raw: unknown): raw is WorksheetV3 {
  return sourceVersion(raw) === 'v3';
}

// ── Node constructors (plain JSON, no @tiptap dependency) ───────────────────

const EMPTY_PARAGRAPH: DocNode = { type: 'paragraph' };

/** A render-only reference to a bank resource (migrated legacy resource block). */
function resourceRefNode(resourceId: string, uploaderName: string | null): DocNode {
  return { type: 'resourceRef', attrs: { resourceId, uploaderName } };
}

/** A floating image flattened into the flow as a centred inline image node. The
 *  attrs mirror the ResizableImage extension (`width`, `align`) so it round-trips. */
function inlineImageNode(el: FloatingImage): DocNode {
  return {
    type: 'image',
    attrs: {
      src: el.src,
      alt: el.alt ?? null,
      width: Math.round(el.w) || null,
      align: 'center',
    },
  };
}

/** A floating text box flattened into the flow as a blockquote "callout". Returns
 *  null for a text box with no real content (so we never emit an orphan callout). */
function calloutNode(el: FloatingTextBox): DocNode | null {
  const content = Array.isArray(el.doc?.content) ? (el.doc!.content as DocNode[]) : [];
  if (!nodesHaveText(content)) return null;
  return { type: 'blockquote', content };
}

/** A text box that overlaps an image flattened into a `caption` node (placed
 *  immediately after that image so the label stays with its figure). Null when the
 *  box has no real content. */
function captionNode(el: FloatingTextBox): DocNode | null {
  const content = Array.isArray(el.doc?.content) ? (el.doc!.content as DocNode[]) : [];
  if (!nodesHaveText(content)) return null;
  return { type: 'caption', content };
}

// ── Floating-over-image overlap detection (report, don't silently flatten) ──

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned rectangle overlap with a small tolerance (touching edges don't
 *  count). Both rects are in the same block-relative coordinate space. */
function rectsOverlap(a: Rect, b: Rect): boolean {
  const EPS = 1;
  return (
    a.x < b.x + b.w - EPS &&
    a.x + a.w > b.x + EPS &&
    a.y < b.y + b.h - EPS &&
    a.y + a.h > b.y + EPS
  );
}

/** A detected text-box-over-image overlap within a single Free block. */
export interface FloatingOverlap {
  textBoxId: string;
  imageId: string;
}

/** Find every text-box/image overlap among a Free block's floating elements. These
 *  are label-over-figure layouts that a naive flatten would turn into an image
 *  followed by a detached caption — surfaced so a human decides, per the plan. */
export function findFloatingOverImage(elements: FloatingElement[]): FloatingOverlap[] {
  const boxes = elements.filter((e): e is FloatingTextBox => e.kind === 'textbox');
  const images = elements.filter((e): e is FloatingImage => e.kind === 'image');
  const overlaps: FloatingOverlap[] = [];
  for (const box of boxes) {
    for (const img of images) {
      if (rectsOverlap(box, img)) overlaps.push({ textBoxId: box.id, imageId: img.id });
    }
  }
  return overlaps;
}

// ── Forward migration: v2 (or v1/garbage) → v3 ──────────────────────────────

/**
 * Migrate any stored worksheet value to the v3 continuous-document envelope.
 *
 * Idempotent: a v3 input is returned unchanged (only its doc is normalised to a
 * well-formed `{ type:'doc', content:[...] }`). Everything else is first run
 * through `parseWorksheet` (which already heals v1 bare docs, legacy page-level
 * `elements`, and garbage into a v2 block list), then flattened block-by-block in
 * document order into one doc.
 */
export function migrateWorksheetToV3(raw: unknown): WorksheetV3 {
  if (isWorksheetV3(raw)) {
    return { version: 3, doc: normaliseDoc((raw as WorksheetV3).doc) };
  }

  const ws: Worksheet = parseWorksheet(raw);
  const content: DocNode[] = [];

  for (const block of ws.blocks) {
    if (block.kind === 'resource') {
      content.push(resourceRefNode(block.resourceId, block.uploaderName));
      continue;
    }

    // Free block: its flowing rich text first…
    const docContent = Array.isArray(block.doc?.content)
      ? (block.doc!.content as DocNode[])
      : [];
    content.push(...docContent);

    // …then its block-owned floating overlays, flattened into the flow. A text box
    // that OVERLAPS an image (a label-over-figure) becomes a `caption` placed
    // immediately AFTER that specific image, so the label stays with its figure
    // rather than being dumped at the block end. Every other text box becomes an
    // inline callout. Emission is in stacking (z) order.
    const floats = [...block.elements].sort((a, b) => a.z - b.z);
    const overlaps = findFloatingOverImage(block.elements);
    // Each overlapping text box is captioned under its first (lowest-z) image.
    const captionsByImage = new Map<string, string>(); // imageId → textBoxId (first wins)
    const captionedBoxes = new Set<string>();
    for (const el of floats) {
      if (el.kind !== 'image') continue;
      for (const o of overlaps) {
        if (o.imageId === el.id && !captionedBoxes.has(o.textBoxId)) {
          if (!captionsByImage.has(el.id)) captionsByImage.set(el.id, o.textBoxId);
          captionedBoxes.add(o.textBoxId);
        }
      }
    }
    const boxById = new Map(
      floats.filter((e): e is FloatingTextBox => e.kind === 'textbox').map((e) => [e.id, e]),
    );
    for (const el of floats) {
      if (el.kind === 'image') {
        content.push(inlineImageNode(el));
        const boxId = captionsByImage.get(el.id);
        const box = boxId ? boxById.get(boxId) : undefined;
        const caption = box ? captionNode(box) : null;
        if (caption) content.push(caption);
      } else if (!captionedBoxes.has(el.id)) {
        const callout = calloutNode(el);
        if (callout) content.push(callout);
      }
    }
  }

  // A tiptap doc must hold at least one block node, or the editor won't mount.
  if (content.length === 0) content.push({ ...EMPTY_PARAGRAPH });

  return { version: 3, doc: { type: 'doc', content } };
}

/** Normalise an arbitrary value into a well-formed tiptap doc node. */
function normaliseDoc(doc: WorksheetDoc | undefined): WorksheetDoc {
  if (isDocNode(doc)) {
    const content = Array.isArray(doc.content) ? doc.content : [];
    return {
      ...doc,
      type: 'doc',
      content: content.length > 0 ? content : [{ ...EMPTY_PARAGRAPH }],
    } as WorksheetDoc;
  }
  return { type: 'doc', content: [{ ...EMPTY_PARAGRAPH }] } as WorksheetDoc;
}

// ── Corpus analysis (shared by the dry-run script and the tests) ────────────

/** True when a subtree contains any non-whitespace text. */
function nodesHaveText(nodes: DocNode[] | undefined): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((n) => {
    if (typeof n?.text === 'string' && n.text.trim() !== '') return true;
    return nodesHaveText(n?.content);
  });
}

/** Count `image` nodes anywhere in a subtree. */
function countImages(nodes: DocNode[] | undefined): number {
  if (!Array.isArray(nodes)) return 0;
  return nodes.reduce(
    (sum, n) => sum + (n?.type === 'image' ? 1 : 0) + countImages(n?.content),
    0,
  );
}

/** Rough character length of a subtree's text (for the overflow heuristic). */
function textLength(nodes: DocNode[] | undefined): number {
  if (!Array.isArray(nodes)) return 0;
  return nodes.reduce(
    (sum, n) => sum + (typeof n?.text === 'string' ? n.text.length : 0) + textLength(n?.content),
    0,
  );
}

// Heuristic thresholds for "would this single former block overflow one A4 page?".
// True overflow needs rendered-height measurement (the v2 builder computed it at
// runtime; it is never persisted), which is impossible headless — so the dry-run
// reports a deliberately conservative PROXY and labels it as such.
const OVERFLOW_IMAGE_COUNT = 3;
const OVERFLOW_NODE_COUNT = 22;
const OVERFLOW_TEXT_CHARS = 3200;

/** Per-row analysis used to build the dry-run corpus summary. Pure; never throws
 *  for shape reasons (migration failures are caught and reported via `ok`/`error`). */
export interface WorksheetRowAnalysis {
  source: SourceVersion;
  blockCount: number;
  freeBlocks: number;
  resourceRefs: number;
  floatingImages: number;
  floatingTextBoxes: number;
  /** Number of text-box-over-image overlaps found across all blocks. */
  floatingOverImage: number;
  /** Blocks flagged as overflow-RISK by the documented heuristic proxy. */
  overflowRiskBlocks: number;
  /** Top-level node count of the migrated v3 doc. */
  migratedNodeCount: number;
  ok: boolean;
  error?: string;
}

export function analyzeWorksheetRow(raw: unknown): WorksheetRowAnalysis {
  const source = sourceVersion(raw);
  const analysis: WorksheetRowAnalysis = {
    source,
    blockCount: 0,
    freeBlocks: 0,
    resourceRefs: 0,
    floatingImages: 0,
    floatingTextBoxes: 0,
    floatingOverImage: 0,
    overflowRiskBlocks: 0,
    migratedNodeCount: 0,
    ok: true,
  };

  try {
    const ws = parseWorksheet(raw);
    analysis.blockCount = ws.blocks.length;
    for (const block of ws.blocks) {
      if (block.kind === 'resource') {
        analysis.resourceRefs += 1;
        continue;
      }
      analysis.freeBlocks += 1;
      const imgs = block.elements.filter((e) => e.kind === 'image').length;
      const boxes = block.elements.filter((e) => e.kind === 'textbox').length;
      analysis.floatingImages += imgs;
      analysis.floatingTextBoxes += boxes;
      analysis.floatingOverImage += findFloatingOverImage(block.elements).length;

      const docContent = Array.isArray(block.doc?.content)
        ? (block.doc!.content as DocNode[])
        : [];
      const inlineImages = countImages(docContent) + imgs;
      const nodeCount = docContent.length + block.elements.length;
      const chars = textLength(docContent);
      if (
        inlineImages >= OVERFLOW_IMAGE_COUNT ||
        nodeCount >= OVERFLOW_NODE_COUNT ||
        chars >= OVERFLOW_TEXT_CHARS
      ) {
        analysis.overflowRiskBlocks += 1;
      }
    }

    const v3 = migrateWorksheetToV3(raw);
    analysis.migratedNodeCount = Array.isArray(v3.doc.content) ? v3.doc.content.length : 0;
  } catch (err) {
    analysis.ok = false;
    analysis.error = err instanceof Error ? err.message : String(err);
  }

  return analysis;
}

// Re-export the reverse for callers that import the migration surface as a unit.
export { migrateV3ToV2 } from './worksheet';
