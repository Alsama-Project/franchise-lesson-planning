// Normalising and mutating the student-worksheet body.
//
// `lesson_plans.worksheet` is an unenforced JSONB column, so every read goes
// through `parseWorksheet`, which accepts both the current versioned envelope
// ({ version: 2, blocks: [...] }) and the legacy v1 shape (a bare tiptap
// document) and always returns a well-formed `Worksheet`. The small block
// helpers below keep the editor's reducer-style updates in one place.

import type {
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
      return { version: 2, blocks };
    }
    // Legacy v1: a single tiptap document stored directly in the column.
    if (isTiptapDoc(obj)) {
      const block: WorksheetFreeBlock = {
        id: newBlockId(),
        kind: 'free',
        doc: obj,
        fromAI: false,
      };
      return { version: 2, blocks: [block] };
    }
  }
  return emptyWorksheet();
}

/** True when the worksheet has no exercises (drives the empty state). */
export function isWorksheetEmpty(ws: Worksheet): boolean {
  return ws.blocks.length === 0;
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
