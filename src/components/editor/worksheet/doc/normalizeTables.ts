// On-load normalisation of table column widths for the document editor.
//
// Column resize is enabled, so a table's cells can carry `colwidth` attrs. Stale or
// migrated data may hold widths that are invalid (negative / non-numeric / absurd)
// or inconsistent (a column with different widths per row, or some rows sized and
// others not). With `table-layout: fixed` those produce the staircase we previously
// sledgehammered with `col { width:auto !important }`. Instead, this pure pass runs
// over the initial doc and RESETS any such table to even columns (strips colwidth),
// leaving legitimately-resized tables (valid + consistent widths) untouched.
//
// Pure JSON in/out — no @tiptap, no DOM — so it also runs in unit tests.

import type { WorksheetV3 } from '@/types/lesson';

type Node = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  [k: string]: unknown;
};

const MIN_W = 20;
const MAX_W = 2000;

/** A cell's single column width, or null. Returns `NaN` for an invalid value so the
 *  caller can flag the whole table for reset. */
function cellWidth(cell: Node): number | null | typeof NaN {
  const cw = cell.attrs?.colwidth;
  if (cw == null) return null;
  if (!Array.isArray(cw) || cw.length === 0) return NaN;
  // A single-colspan cell carries [w]; multi-span carries several. Any non-finite
  // or out-of-range entry makes the table invalid.
  const ok = cw.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= MIN_W && n <= MAX_W);
  return ok ? (cw[0] as number) : NaN;
}

/** True when a table's colwidths are valid AND consistent (so we keep them). */
function tableWidthsAreClean(table: Node): boolean {
  const rows = (table.content ?? []).filter((r) => r.type === 'tableRow');
  if (rows.length === 0) return true;
  let reference: (number | null)[] | null = null;
  for (const row of rows) {
    const cells = row.content ?? [];
    const widths: (number | null)[] = [];
    for (const cell of cells) {
      const w = cellWidth(cell);
      if (Number.isNaN(w)) return false; // invalid value anywhere → not clean
      widths.push(w as number | null);
    }
    if (reference === null) reference = widths;
    else if (widths.length !== reference.length || widths.some((w, i) => w !== reference![i])) {
      return false; // inconsistent across rows
    }
  }
  // Mixed null + numeric within a row is inconsistent (some columns sized, some not).
  if (reference && reference.some((w) => w == null) && reference.some((w) => w != null)) return false;
  return true;
}

/** Strip every cell's colwidth in a table (→ even columns). */
function stripTableWidths(table: Node): Node {
  const content = (table.content ?? []).map((row) =>
    row.type === 'tableRow'
      ? {
          ...row,
          content: (row.content ?? []).map((cell) =>
            cell.attrs && 'colwidth' in cell.attrs
              ? { ...cell, attrs: { ...cell.attrs, colwidth: null } }
              : cell,
          ),
        }
      : row,
  );
  return { ...table, content };
}

/** Recursively normalise every table in a node tree. Returns the (possibly new)
 *  node and whether anything changed. */
function walk(node: Node): { node: Node; changed: boolean } {
  let changed = false;
  let next = node;

  if (node.type === 'table' && !tableWidthsAreClean(node)) {
    next = stripTableWidths(node);
    changed = true;
  }

  if (Array.isArray(next.content)) {
    let childChanged = false;
    const content = next.content.map((child) => {
      const r = walk(child);
      if (r.changed) childChanged = true;
      return r.node;
    });
    if (childChanged) {
      next = { ...next, content };
      changed = true;
    }
  }

  return { node: next, changed };
}

/**
 * Reset any table with invalid/inconsistent column widths to even columns. Returns
 * the same doc reference when nothing needed fixing (so React memoisation and the
 * autosave dirty-check stay stable).
 */
export function normalizeTableColwidths(doc: WorksheetV3['doc']): WorksheetV3['doc'] {
  const { node, changed } = walk(doc as Node);
  return changed ? (node as WorksheetV3['doc']) : doc;
}
