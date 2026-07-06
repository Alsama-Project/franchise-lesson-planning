// Pure text diff for tracked-change (suggesting-mode) rendering. A `text` suggestion
// stores the field's original text (`from`) and the proposed text (`to`); we render
// the change as four segments — the shared leading text (`pre`), the removed middle
// (`del`), the inserted middle (`ins`), and the shared trailing text (`post`) — so a
// small edit reads as a strike-through + insertion rather than replacing the whole
// field. This is the prose equivalent of the dur/enum `from → to` pills.
//
// Segmentation is by common prefix + common suffix, each CLAMPED so they can never
// overlap on the shorter string (the classic `"aa" → "aaa"` break): the suffix scan
// starts only after the matched prefix and is bounded by the shorter remaining span.
// A whole-field replacement with no shared affixes yields `del` = all old, `ins` =
// all new. Empty `from`/`to` and identical inputs are handled (identical → all empty).

export interface DiffSegments {
  /** Shared leading text, rendered plain. */
  pre: string;
  /** Removed text (present in `from`, not `to`), rendered struck. */
  del: string;
  /** Inserted text (present in `to`, not `from`), rendered as the insertion. */
  ins: string;
  /** Shared trailing text, rendered plain. */
  post: string;
}

export function textDiffSegments(from: string, to: string): DiffSegments {
  const a = from ?? '';
  const b = to ?? '';
  const n = a.length;
  const m = b.length;

  // Common prefix, capped at the shorter string's length.
  let p = 0;
  const maxP = Math.min(n, m);
  while (p < maxP && a[p] === b[p]) p++;

  // Common suffix, starting AFTER the matched prefix and capped so pre + suffix
  // cannot overlap on either string.
  let s = 0;
  const maxS = Math.min(n - p, m - p);
  while (s < maxS && a[n - 1 - s] === b[m - 1 - s]) s++;

  return {
    pre: a.slice(0, p),
    del: a.slice(p, n - s),
    ins: b.slice(p, m - s),
    post: a.slice(n - s), // identical to b.slice(m - s)
  };
}
