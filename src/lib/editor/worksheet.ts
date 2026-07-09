// Normalising and mutating the student-worksheet body.
//
// `lesson_plans.worksheet` is an unenforced JSONB column, so every read goes
// through `parseWorksheet`, which accepts both the current versioned envelope
// ({ version: 2, blocks: [...] }) and the legacy v1 shape (a bare tiptap
// document) and always returns a well-formed `Worksheet`. The small block
// helpers below keep the editor's reducer-style updates in one place.

import type {
  FloatingElement,
  FloatingImage,
  FloatingTextBox,
  Worksheet,
  WorksheetBlock,
  WorksheetDoc,
  WorksheetFreeBlock,
  WorksheetResourceBlock,
  WorksheetV3,
} from '@/types/lesson';

/** Generate a stable client id for a worksheet block. */
export function newBlockId(): string {
  // crypto.randomUUID is available in modern browsers and Node 19+. Worksheet
  // ids are only created in response to a user action (never during SSR render),
  // so this never runs on the server's first paint.
  return crypto.randomUUID();
}

/** An empty worksheet (no exercises yet). */
export function emptyWorksheet(): Worksheet {
  return { version: 2, blocks: [] };
}

/** True for a value that looks like a tiptap document node. */
function isTiptapDoc(value: unknown): value is WorksheetDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'doc'
  );
}

type DocNode = { type?: string; attrs?: unknown; content?: unknown[] };

/**
 * Merge adjacent same-type list nodes (`orderedList` / `bulletList`) into one.
 *
 * The AI generator emits "simple markdown" where numbered items are often
 * separated by blank lines; each gap closes the list, so a run of items becomes
 * one single-item `<ol>` per item and every item renders as "1." Coalescing the
 * contiguous run back into a single list node makes the numbering increment.
 * Applied once at the JSON boundary (`parseWorksheet`) so the editor, the print
 * view and the read-only preview all render the healed doc, and existing saved
 * worksheets self-heal on load. Top-level lists only — the subset we emit.
 */
function coalesceDocLists(doc: WorksheetDoc): WorksheetDoc {
  const content = doc.content;
  if (!Array.isArray(content) || content.length === 0) return doc;
  const merged: DocNode[] = [];
  let changed = false;
  for (const raw of content) {
    const node = raw as DocNode;
    const isList = node?.type === 'orderedList' || node?.type === 'bulletList';
    const prev = merged[merged.length - 1];
    if (
      isList &&
      prev &&
      prev.type === node.type &&
      JSON.stringify(prev.attrs ?? null) === JSON.stringify(node.attrs ?? null)
    ) {
      prev.content = [...(prev.content ?? []), ...(node.content ?? [])];
      changed = true;
    } else if (isList) {
      // Shallow-clone list nodes so a later merge never mutates the source doc.
      merged.push({ ...node, content: [...(node.content ?? [])] });
    } else {
      merged.push(node);
    }
  }
  return changed ? { ...doc, content: merged } : doc;
}

/** Narrow an unknown array element to a valid WorksheetBlock, or null. */
function asBlock(value: unknown): WorksheetBlock | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.kind === 'free') {
    const doc = isTiptapDoc(v.doc) ? coalesceDocLists(v.doc) : null;
    return {
      id: typeof v.id === 'string' ? v.id : newBlockId(),
      kind: 'free',
      doc,
      fromAI: v.fromAI === true,
      elements: Array.isArray(v.elements)
        ? v.elements.map(asElement).filter((e): e is FloatingElement => e !== null)
        : [],
    };
  }
  if (v.kind === 'resource' && typeof v.resourceId === 'string') {
    return {
      id: typeof v.id === 'string' ? v.id : newBlockId(),
      kind: 'resource',
      resourceId: v.resourceId,
      uploaderName: typeof v.uploaderName === 'string' ? v.uploaderName : null,
    };
  }
  return null;
}

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Narrow an unknown array element to a valid FloatingElement, or null. */
function asElement(value: unknown): FloatingElement | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const id = typeof v.id === 'string' ? v.id : newBlockId();
  const geom = { id, x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 200), h: num(v.h, 120), z: num(v.z, 1) };
  if (v.kind === 'textbox') {
    return {
      ...geom,
      kind: 'textbox',
      doc: isTiptapDoc(v.doc) ? v.doc : null,
      border: v.border === true,
      fill: v.fill === 'white' ? 'white' : 'transparent',
    };
  }
  if (v.kind === 'image' && typeof v.src === 'string') {
    return {
      ...geom,
      kind: 'image',
      src: v.src,
      alt: typeof v.alt === 'string' ? v.alt : null,
    };
  }
  return null;
}

/**
 * Normalise the raw `worksheet` column into a `Worksheet`. Handles three cases:
 *  - the current v2 envelope → validated block-by-block;
 *  - a legacy bare tiptap doc (v1) → wrapped as a single Free block;
 *  - anything else (null/garbage) → an empty worksheet.
 */
export function parseWorksheet(raw: unknown): Worksheet {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    // v3 (the continuous document editor's shape). An old-builder read must
    // degrade this gracefully rather than fall through to the empty branch, so
    // the whole doc is re-homed into a single Free block (migrateV3ToV2). The
    // new editor never reads through here — it consumes the v3 envelope directly.
    if (obj.version === 3 && isTiptapDoc(obj.doc)) {
      return migrateV3ToV2(obj.doc);
    }
    if (obj.version === 2 && Array.isArray(obj.blocks)) {
      const blocks = obj.blocks.map(asBlock).filter((b): b is WorksheetBlock => b !== null);
      // Backfill: a legacy page-level `elements` array (from the pre-containment
      // shape) is re-homed into the first Free block so nothing is orphaned.
      if (Array.isArray(obj.elements) && obj.elements.length > 0) {
        const legacy = obj.elements.map(asElement).filter((e): e is FloatingElement => e !== null);
        if (legacy.length > 0) {
          let host = blocks.find((b): b is WorksheetFreeBlock => b.kind === 'free');
          if (!host) {
            host = newFreeBlock();
            blocks.push(host);
          }
          host.elements = [...host.elements, ...legacy];
        }
      }
      return { version: 2, blocks };
    }
    // Legacy v1: a single tiptap document stored directly in the column.
    if (isTiptapDoc(obj)) {
      const block: WorksheetFreeBlock = {
        id: newBlockId(),
        kind: 'free',
        doc: coalesceDocLists(obj),
        fromAI: false,
        elements: [],
      };
      return { version: 2, blocks: [block] };
    }
  }
  return emptyWorksheet();
}

// ── v3 → v2 downgrade (the kill-switch read path) ──────────────────────────

/** Node/mark types the LEGACY worksheet schema (worksheetEditorExtensions) can
 *  parse. A v3 doc may carry nodes/marks outside this set; feeding those to the old
 *  `generateHTML(doc, worksheetEditorExtensions())` throws ("no node/mark type X in
 *  this schema") or strips content, so `downgradeV3Doc` must rewrite them first. */
const LEGACY_NODE_TYPES = new Set([
  'doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem',
  'blockquote', 'horizontalRule', 'hardBreak', 'text', 'image', 'codeBlock',
]);
const LEGACY_MARK_TYPES = new Set([
  'bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'link',
]);
// `link` is not in the legacy schema, so it is stripped (keeping the text) rather
// than kept — listed above only to document that it is handled explicitly below.
LEGACY_MARK_TYPES.delete('link');

type MigrateNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: MigrateNode[];
  text?: string;
  marks?: { type?: string }[];
};

/** Plain-text of a node subtree (used to collapse tables into paragraphs). */
function nodeText(node: MigrateNode | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map(nodeText).join('');
}

/** A paragraph node carrying the given plain text (empty text → empty paragraph). */
function textParagraph(text: string): MigrateNode {
  const value = text.trim();
  return value
    ? { type: 'paragraph', content: [{ type: 'text', text: value }] }
    : { type: 'paragraph' };
}

/** Strip marks the legacy schema can't parse (notably `link`), keeping the text. */
function downgradeMarks(node: MigrateNode): MigrateNode {
  const next: MigrateNode = { ...node };
  if (Array.isArray(node.marks)) {
    const kept = node.marks.filter((m) => m.type && LEGACY_MARK_TYPES.has(m.type));
    if (kept.length > 0) next.marks = kept;
    else delete next.marks;
  }
  if (Array.isArray(node.content)) next.content = node.content.flatMap(downgradeNode);
  return next;
}

/**
 * Rewrite ONE v3 node into zero or more legacy-schema-safe nodes:
 *  - table → one paragraph per row (cells joined by " | "); the caption/plain text
 *    survives, the grid does not (the old builder has no table extension);
 *  - taskList/taskItem → bulletList/listItem;
 *  - resourceRef → a placeholder paragraph;
 *  - caption → paragraph;
 *  - pageBreak → horizontalRule;
 *  - anything already legacy → recurse into its content, stripping stray marks.
 */
function downgradeNode(node: MigrateNode): MigrateNode[] {
  switch (node.type) {
    case 'table': {
      const rows = node.content ?? [];
      return rows.map((row) =>
        textParagraph((row.content ?? []).map((cell) => nodeText(cell).trim()).join(' | ')),
      );
    }
    case 'taskList':
      return [
        {
          type: 'bulletList',
          content: (node.content ?? []).flatMap(downgradeNode),
        },
      ];
    case 'taskItem':
      return [{ type: 'listItem', content: (node.content ?? []).flatMap(downgradeNode) }];
    case 'resourceRef': {
      const uploader =
        node.attrs && typeof node.attrs.uploaderName === 'string' ? node.attrs.uploaderName : null;
      return [textParagraph(uploader ? `[Attached resource — ${uploader}]` : '[Attached resource]')];
    }
    case 'caption':
      return [{ type: 'paragraph', content: (node.content ?? []).flatMap(downgradeNode) }];
    case 'pageBreak':
      return [{ type: 'horizontalRule' }];
    default: {
      if (node.type && !LEGACY_NODE_TYPES.has(node.type)) {
        // An unknown node the old schema can't hold: keep its text as a paragraph
        // so nothing silently vanishes and generateHTML never throws.
        return [textParagraph(nodeText(node))];
      }
      return [downgradeMarks(node)];
    }
  }
}

/** Rewrite a whole v3 doc into a legacy-schema-safe doc (see `downgradeNode`). */
export function downgradeV3Doc(doc: WorksheetV3['doc']): WorksheetDoc {
  const content = Array.isArray((doc as MigrateNode).content)
    ? ((doc as MigrateNode).content as MigrateNode[]).flatMap(downgradeNode)
    : [];
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] } as WorksheetDoc;
}

/**
 * Degrade a v3 continuous document back to a v2 worksheet (the flag kill-switch /
 * old-builder read path). The doc is first rewritten to legacy-schema-safe nodes
 * (`downgradeV3Doc`: tables → paragraphs, taskList → bulletList, link marks
 * dropped, resourceRef → placeholder, caption → paragraph, pageBreak → hr) so the
 * old `generateHTML(doc, worksheetEditorExtensions())` never throws or blanks, then
 * wrapped as ONE Free block. Lossy by design (the multi-block split and rich nodes
 * collapse), but the text/headings/lists/images survive.
 *
 * IMPORTANT: this is a RENDER-ONLY path. Its result must never be written back over
 * the source v3 row — the caller (LessonPlanEditor) mounts a read-only view for a
 * v3 row when the document-editor flag is off, so no autosave can clobber it.
 */
export function migrateV3ToV2(doc: WorksheetV3['doc']): Worksheet {
  const block = newFreeBlock();
  block.doc = coalesceDocLists(downgradeV3Doc(doc));
  return { version: 2, blocks: [block] };
}

/** True when the worksheet has no exercises (drives the empty state). */
export function isWorksheetEmpty(ws: Worksheet): boolean {
  return ws.blocks.length === 0;
}

/** Append a block, returning a new worksheet. */
export function appendBlock(ws: Worksheet, block: WorksheetBlock): Worksheet {
  return { ...ws, blocks: [...ws.blocks, block] };
}

/** Insert one or more blocks at `index` (clamped to [0, length]), returning a
 *  new worksheet. Index === length appends. Drives "insert between blocks". */
export function insertBlocksAt(
  ws: Worksheet,
  index: number,
  newBlocks: WorksheetBlock[],
): Worksheet {
  const blocks = [...ws.blocks];
  const i = Math.max(0, Math.min(index, blocks.length));
  blocks.splice(i, 0, ...newBlocks);
  return { ...ws, blocks };
}

/** Replace the block with `id` via an updater, returning a new worksheet. */
export function updateBlock(
  ws: Worksheet,
  id: string,
  update: (block: WorksheetBlock) => WorksheetBlock,
): Worksheet {
  return { ...ws, blocks: ws.blocks.map((b) => (b.id === id ? update(b) : b)) };
}

/** Remove the block with `id`, returning a new worksheet. */
export function removeBlock(ws: Worksheet, id: string): Worksheet {
  return { ...ws, blocks: ws.blocks.filter((b) => b.id !== id) };
}

/** Duplicate the block with `id`, inserting the copy directly after it. */
export function duplicateBlock(ws: Worksheet, id: string): Worksheet {
  const index = ws.blocks.findIndex((b) => b.id === id);
  if (index === -1) return ws;
  const src = ws.blocks[index];
  // Free blocks carry contained elements — give the copy fresh element ids too.
  const copy: WorksheetBlock =
    src.kind === 'free'
      ? { ...src, id: newBlockId(), elements: src.elements.map((e) => ({ ...e, id: newBlockId() })) }
      : { ...src, id: newBlockId() };
  const blocks = [...ws.blocks];
  blocks.splice(index + 1, 0, copy);
  return { ...ws, blocks };
}

/** Move the block at `from` to `to`, returning a new worksheet (no-op if equal). */
export function moveBlock(ws: Worksheet, from: number, to: number): Worksheet {
  if (from === to || from < 0 || to < 0 || from >= ws.blocks.length || to >= ws.blocks.length) {
    return ws;
  }
  const blocks = [...ws.blocks];
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return { ...ws, blocks };
}

/** A new, empty Free block (the choice state shows until the teacher picks a path). */
export function newFreeBlock(): WorksheetFreeBlock {
  return { id: newBlockId(), kind: 'free', doc: null, fromAI: false, elements: [] };
}

/** A new From-bank resource block referencing `resourceId`. */
export function newResourceBlock(
  resourceId: string,
  uploaderName: string | null,
): WorksheetResourceBlock {
  return { id: newBlockId(), kind: 'resource', resourceId, uploaderName };
}

// ── Floating elements (block-owned, block-relative) ────────────────────────

/** A new transparent, border-less text box at the given block-relative position. */
export function newTextBox(x: number, y: number, z: number): FloatingTextBox {
  return { id: newBlockId(), kind: 'textbox', x, y, w: 280, h: 120, z, doc: null, border: false, fill: 'transparent' };
}

/** A new floating image element. */
export function newFloatingImage(
  src: string,
  alt: string | null,
  geom: { x: number; y: number; w: number; h: number },
  z: number,
): FloatingImage {
  return { id: newBlockId(), kind: 'image', src, alt, z, ...geom };
}

/** The next z to assign a freshly inserted element within a block. */
export function nextZ(elements: FloatingElement[]): number {
  return elements.reduce((max, el) => Math.max(max, el.z), 0) + 1;
}

/** Restack `id` within a block's element list (bring forward / send backward). */
export function restackElements(
  elements: FloatingElement[],
  id: string,
  dir: 'forward' | 'backward',
): FloatingElement[] {
  if (elements.length === 0) return elements;
  const zs = elements.map((e) => e.z);
  const z = dir === 'forward' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
  return elements.map((e) => (e.id === id ? { ...e, z } : e));
}

/**
 * Clamp an element's geometry to its block's content box [0..boxW]×[0..boxH]
 * (with a minimum size). This is the single guard that keeps every element inside
 * its block, both on screen and in print.
 */
export function clampGeom(
  geom: { x: number; y: number; w: number; h: number },
  box: { w: number; h: number },
  min: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(min.w, Math.min(geom.w, box.w));
  const h = Math.max(min.h, Math.min(geom.h, box.h));
  const x = Math.max(0, Math.min(geom.x, box.w - w));
  const y = Math.max(0, Math.min(geom.y, box.h - h));
  return { x, y, w, h };
}
