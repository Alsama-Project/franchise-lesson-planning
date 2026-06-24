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
  return { version: 2, blocks: [], elements: [] };
}

/** True for a value that looks like a tiptap document node. */
function isTiptapDoc(value: unknown): value is WorksheetDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'doc'
  );
}

/** Narrow an unknown array element to a valid WorksheetBlock, or null. */
function asBlock(value: unknown): WorksheetBlock | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.kind === 'free') {
    const doc = isTiptapDoc(v.doc) ? v.doc : null;
    return {
      id: typeof v.id === 'string' ? v.id : newBlockId(),
      kind: 'free',
      doc,
      fromAI: v.fromAI === true,
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
    if (obj.version === 2 && Array.isArray(obj.blocks)) {
      const blocks = obj.blocks.map(asBlock).filter((b): b is WorksheetBlock => b !== null);
      const elements = Array.isArray(obj.elements)
        ? obj.elements.map(asElement).filter((e): e is FloatingElement => e !== null)
        : [];
      return { version: 2, blocks, elements };
    }
    // Legacy v1: a single tiptap document stored directly in the column.
    if (isTiptapDoc(obj)) {
      const block: WorksheetFreeBlock = {
        id: newBlockId(),
        kind: 'free',
        doc: obj,
        fromAI: false,
      };
      return { version: 2, blocks: [block], elements: [] };
    }
  }
  return emptyWorksheet();
}

/** True when the worksheet has no exercises and no floating elements. */
export function isWorksheetEmpty(ws: Worksheet): boolean {
  return ws.blocks.length === 0 && ws.elements.length === 0;
}

/** Append a block, returning a new worksheet. */
export function appendBlock(ws: Worksheet, block: WorksheetBlock): Worksheet {
  return { ...ws, blocks: [...ws.blocks, block] };
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
  const copy: WorksheetBlock = { ...ws.blocks[index], id: newBlockId() };
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
  return { id: newBlockId(), kind: 'free', doc: null, fromAI: false };
}

/** A new From-bank resource block referencing `resourceId`. */
export function newResourceBlock(
  resourceId: string,
  uploaderName: string | null,
): WorksheetResourceBlock {
  return { id: newBlockId(), kind: 'resource', resourceId, uploaderName };
}

// ── Floating elements (page-relative overlay) ──────────────────────────────

/** Highest z among current elements (0 when none) — new elements go on top. */
function topZ(ws: Worksheet): number {
  return ws.elements.reduce((max, el) => Math.max(max, el.z), 0);
}

/** A new transparent, border-less text box at the given body-relative position. */
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

/** Append a floating element on top of the stack. */
export function addElement(ws: Worksheet, el: FloatingElement): Worksheet {
  return { ...ws, elements: [...ws.elements, el] };
}

/** Replace the element with `id` via an updater. */
export function updateElement(
  ws: Worksheet,
  id: string,
  update: (el: FloatingElement) => FloatingElement,
): Worksheet {
  return { ...ws, elements: ws.elements.map((e) => (e.id === id ? update(e) : e)) };
}

/** Remove the element with `id`. */
export function removeElement(ws: Worksheet, id: string): Worksheet {
  return { ...ws, elements: ws.elements.filter((e) => e.id !== id) };
}

/** Restack `id` to the front (bring forward) or back (send backward). */
export function restackElement(ws: Worksheet, id: string, dir: 'forward' | 'backward'): Worksheet {
  const target = ws.elements.find((e) => e.id === id);
  if (!target) return ws;
  const zs = ws.elements.map((e) => e.z);
  const nextZ = dir === 'forward' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
  return updateElement(ws, id, (e) => ({ ...e, z: nextZ }));
}

/**
 * Clamp an element's geometry to the printable body content box [0..boxW]×[0..boxH]
 * (with a minimum size). This is the single guard that keeps every element on the
 * page and out of the locked chrome, both on screen and in print.
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

/** The next z to assign a freshly inserted element. */
export function nextZ(ws: Worksheet): number {
  return topZ(ws) + 1;
}
