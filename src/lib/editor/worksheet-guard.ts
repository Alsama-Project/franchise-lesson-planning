// Persistence guard for the worksheet JSONB column.
//
// A worksheet image is only renderable if the node carries EITHER a `src` (an
// uploaded/resource image's signed URL) OR a `storagePath` (a generated image served
// through /api/worksheet-image). A node that has neither — including the wholesale
// `{ "type": "image" }` with no `attrs` object at all — renders as a broken/empty
// image and, once persisted, the image is gone.
//
// `editor.getJSON()` can never produce such a node (the schema always materialises
// `src`/`storagePath` to at least `null`), yet degraded nodes have reached the DB.
// The corruption therefore enters on a NON-editor path (a raw server write, or a
// serialisation step between getJSON and the write). This guard runs at the write
// boundary itself, so it catches the bad doc regardless of which upstream path
// produced it — and never lets a worksheet silently lose its images.
//
// Pure JSON in — no @tiptap, no DOM — so it runs in the server action and in tests.

type DocNode = {
  type?: unknown;
  attrs?: Record<string, unknown> | null;
  content?: unknown;
};

/** A degraded image node found in a worksheet, with a JSON sample for the log. */
export interface DegradedImage {
  /** Why it is degraded: no attrs object at all, or attrs with no usable source. */
  reason: 'no-attrs' | 'no-source';
  /** The offending node, serialised short, for a server log. */
  sample: string;
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Walk a worksheet value (any envelope shape) and return the FIRST image node that
 * would render nothing once saved, or null when every image is renderable. An image
 * is degraded when it has no `attrs` object, or its `attrs` carries neither a usable
 * `src` nor a usable `storagePath`.
 */
export function findDegradedImage(worksheet: unknown): DegradedImage | null {
  const seen = new WeakSet<object>();

  function walk(node: unknown): DegradedImage | null {
    if (!node || typeof node !== 'object') return null;
    if (seen.has(node as object)) return null;
    seen.add(node as object);

    const n = node as DocNode;
    if (n.type === 'image') {
      const attrs = n.attrs;
      if (!attrs || typeof attrs !== 'object') {
        return { reason: 'no-attrs', sample: safeSample(node) };
      }
      const hasSource = isNonEmptyString(attrs.src) || isNonEmptyString(attrs.storagePath);
      if (!hasSource) {
        return { reason: 'no-source', sample: safeSample(node) };
      }
    }

    // Recurse into every array/object child (envelope → doc → content → nodes → …).
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const hit = walk(item);
          if (hit) return hit;
        }
      } else if (value && typeof value === 'object') {
        const hit = walk(value);
        if (hit) return hit;
      }
    }
    return null;
  }

  return walk(worksheet);
}

/** A short, log-safe JSON sample of a node (attrs keys are the diagnostic signal). */
function safeSample(node: unknown): string {
  try {
    const s = JSON.stringify(node);
    return s.length > 300 ? `${s.slice(0, 299)}…` : s;
  } catch {
    return '[unserialisable node]';
  }
}
