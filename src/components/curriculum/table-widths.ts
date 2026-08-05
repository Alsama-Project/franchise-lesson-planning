// Proportional column-width model for the weekly period table (CurriculumBrowse).
//
// The old model nominated ONE visible column (`FLEX_PRIORITY`) to be `w-auto` and
// absorb every pixel of slack while every other column stayed pinned at a fixed
// `w-[Npx]`. Reordering that list only moved the damage: whichever column won the
// slack sprawled, and its neighbours starved (a URL wrapping one character per line
// in a ~110px Resources column; Arabic Topic squeezed to one word per line). No
// ordering of a single-winner list can balance the row.
//
// This replaces it with proportional WEIGHTS. Every width-bearing column carries a
// weight; the visible weighted columns split the table's non-period pool in
// proportion to their weights. `Period` is excluded from the pool and stays a fixed
// px column. Widths are emitted as `calc((100% - <period>) * fraction)` so the pool
// is split exactly (period px + Σ fractions·pool = 100% of the table — no overflow),
// and the caller pairs each column with a `min-width` floor (so a narrow viewport
// scrolls rather than starving a column) under `table-fixed`.

/** The period table's columns, in display order. */
export type ColKey = 'period' | 'outcome' | 'skill' | 'topic' | 'resources';
export const COL_ORDER: ColKey[] = ['period', 'outcome', 'skill', 'topic', 'resources'];

/**
 * Layout weights for the width-bearing columns (everything except `period`, which is
 * a fixed px column excluded from the weighted pool). Learning outcome is the prose
 * column and reads widest; Skill / Topic / Resources share the rest evenly. Tune only
 * if a real render disagrees.
 */
const COL_WEIGHT: Record<Exclude<ColKey, 'period'>, number> = {
  outcome: 4,
  topic: 2,
  skill: 2,
  resources: 2,
};

/** Ceiling: no weighted column may take more than this fraction of the pool. Keeps a
 *  lone / heavily-weighted column from sprawling — with an ~80px period reserved this
 *  is comfortably under "~50% of the whole table". */
const CEILING_FRACTION = 0.5;

/** Fixed width of the `period` column, reserved out of the pool before splitting. Kept
 *  in sync with the `w-[80px]` class the caller puts on the period cell. */
export const PERIOD_WIDTH_PX = 80;
export const PERIOD_COL_CLASS = 'w-[80px]';

/** Floor applied (as a CSS `min-width`) to every weighted column, so a narrow table
 *  scrolls instead of collapsing a column to an unreadable sliver. */
export const WEIGHTED_MIN_WIDTH_CLASS = 'min-w-[120px]';

export interface WeightedWidths {
  /** Fraction (0..1) of the non-period pool for each visible weighted column. */
  fraction: Partial<Record<ColKey, number>>;
  /** Leftover pool fraction rendered as an inert trailing spacer — non-zero ONLY when a
   *  single weighted column survives and is capped at the ceiling, so it hits the
   *  ceiling rather than filling the whole pool. 0 otherwise. */
  spacerFraction: number;
}

const EPSILON = 1e-9;

/**
 * Split the non-period pool across the visible weighted columns in proportion to their
 * weights, clamped to the ceiling. Excess from a capped column is redistributed to the
 * still-uncapped columns (iterated to a fixed point). With two or more weighted columns
 * the fractions always sum to 1 (no spacer); a single capped column leaves the ceiling's
 * remainder as `spacerFraction`.
 */
export function weightedWidths(visible: ColKey[]): WeightedWidths {
  const weighted = visible.filter((k): k is Exclude<ColKey, 'period'> => k !== 'period');
  if (weighted.length === 0) return { fraction: {}, spacerFraction: 0 };

  const totalWeight = weighted.reduce((sum, k) => sum + COL_WEIGHT[k], 0);
  const share = new Map<ColKey, number>(
    weighted.map((k) => [k, COL_WEIGHT[k] / totalWeight]),
  );

  const capped = new Set<ColKey>();
  // Water-fill: cap any over-ceiling column, hand its excess to the uncapped ones by
  // their current share, and repeat until nothing exceeds the ceiling. Bounded by the
  // column count (each pass caps at least one column, or terminates).
  for (let pass = 0; pass <= weighted.length; pass += 1) {
    let excess = 0;
    for (const k of weighted) {
      const v = share.get(k)!;
      if (!capped.has(k) && v > CEILING_FRACTION + EPSILON) {
        excess += v - CEILING_FRACTION;
        share.set(k, CEILING_FRACTION);
        capped.add(k);
      }
    }
    if (excess <= EPSILON) break;

    const uncapped = weighted.filter((k) => !capped.has(k));
    if (uncapped.length === 0) {
      // Every weighted column is capped — reachable only for a single survivor. The
      // ceiling's remainder becomes the trailing spacer.
      return { fraction: Object.fromEntries(share) as WeightedWidths['fraction'], spacerFraction: excess };
    }
    const uncappedTotal = uncapped.reduce((sum, k) => sum + share.get(k)!, 0);
    for (const k of uncapped) {
      share.set(k, share.get(k)! + excess * (share.get(k)! / uncappedTotal));
    }
  }

  return { fraction: Object.fromEntries(share) as WeightedWidths['fraction'], spacerFraction: 0 };
}

/** The CSS width for a weighted column: its fraction of the pool left after the fixed
 *  period column. Exact by construction, so the columns tile the table with no overflow. */
export function poolWidth(fraction: number): string {
  return `calc((100% - ${PERIOD_WIDTH_PX}px) * ${fraction})`;
}
