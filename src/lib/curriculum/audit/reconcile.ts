import { applyOutcomeRule, type ExtractResult } from './extract';
import { tier0, tier1 } from './normalize';
import type { AppRow } from './app-source';
import type { PinnedMapping } from './pinned-map';

// ── Layered reconciliation (audit brief §2) ───────────────────────────────────────
//
// Run in order; the FIRST failing layer names the failure mode:
//   1. Coverage/structure  — key-set diff (source-only / app-only / matched).
//   2. Content (Tier-1)     — outcome text drift on matched rows = wrong-column / shift.
//   3. Set cross-check      — which source column the DB set ACTUALLY matches (mis-bind).
//   4. Whitespace-only      — Tier-0 fail / Tier-1 pass, reported separately, low priority.
//
// GATE invariant (what blocks an ingest): every DB row is backed by a source row OR is a
// documented structural marker (no fabricated/orphaned lessons) AND every matched row's
// `daily_outcome` is content-identical (Tier-1). The weekly_* field diffs are reported as
// INFORMATIONAL (merge-boundary-sensitive), not gated. Years with no source workbook are
// excluded from coverage on both sides (documented), not silently dropped. Source-only
// rows (in the workbook, not yet in the DB) are surfaced but not fatal on their own.

const SAMPLE_LIMIT = 5;

function truncate(s: string | null, n = 80): string {
  if (s == null) return '∅';
  const oneLine = s.replace(/\n/g, '⏎');
  return oneLine.length > n ? `${oneLine.slice(0, n)}…` : oneLine;
}

export interface ContentSample {
  keyStr: string;
  source: string | null;
  app: string | null;
}

export interface FieldContentDiff {
  field: string;
  /** Informational fields (weekly_*) are reported but do NOT block the gate. */
  informational: boolean;
  compared: number;
  mismatches: number;
  samples: ContentSample[];
}

export interface CandidateScore {
  label: string;
  jaccard: number;
  appCoverage: number;
  exactMatch: boolean;
}

export interface SubjectReport {
  subject: string;
  sheet: string;
  excludedYears: number[];
  coverage: {
    sourceRows: number;
    appRows: number;
    matched: number;
    sourceOnly: string[];
    /** DB rows with no source row, EXCLUDING documented markers — these block the gate. */
    appOnlyOrphans: string[];
    /** DB rows with no source row that are documented structural markers — excused. */
    appOnlyMarkers: string[];
  };
  content: FieldContentDiff[];
  setCrossCheck: {
    appSetSize: number;
    candidates: CandidateScore[];
    bestLabel: string | null;
    pinnedColumnIsBest: boolean;
  };
  whitespaceOnly: { count: number; samples: ContentSample[] };
  duplicateSourceKeys: { keyStr: string; sourceRows: number[] }[];
  skippedSourceRows: number;
  /** appOnlyOrphans==0 AND daily_outcome Tier-1 mismatches==0 — the ingest-blocking invariant. */
  gatePass: boolean;
  /** gatePass AND sourceOnly==0 — full zero-diff (source == app both directions). */
  strictPass: boolean;
}

/** Tier-1 mismatches on the HARD (gated) daily_outcome field only. */
export function hardContentMismatches(report: SubjectReport): number {
  return report.content.find((c) => !c.informational)?.mismatches ?? 0;
}

/** Tier-1 mismatches across every diffed field (hard + informational). */
export function totalContentMismatches(report: SubjectReport): number {
  return report.content.reduce((sum, c) => sum + c.mismatches, 0);
}

function diffField(
  field: string,
  informational: boolean,
  matched: string[],
  sourceOf: (k: string) => string | null,
  appOf: (k: string) => string | null,
): FieldContentDiff {
  const samples: ContentSample[] = [];
  let mismatches = 0;
  for (const k of matched) {
    const s = tier1(sourceOf(k));
    const a = tier1(appOf(k));
    if (s !== a) {
      mismatches++;
      if (samples.length < SAMPLE_LIMIT) samples.push({ keyStr: k, source: s, app: a });
    }
  }
  return { field, informational, compared: matched.length, mismatches, samples };
}

/**
 * Reconcile one subject's independent extraction against its app (DB gold-master) rows.
 * Pure — no I/O, no parser imports — so it is fully unit-testable on synthetic inputs.
 */
export function reconcileSubject(
  pin: PinnedMapping,
  extract: ExtractResult,
  appRows: AppRow[],
): SubjectReport {
  const excluded = new Set(pin.excludeYears ?? []);
  const srcRows = extract.rows.filter((r) => !excluded.has(r.key.year));
  const appAll = appRows.filter((r) => !excluded.has(r.key.year));

  const srcByKey = new Map(srcRows.map((r) => [r.keyStr, r] as const));
  const appByKey = new Map(appAll.map((r) => [r.keyStr, r] as const));

  // ── Layer 1: coverage ──
  const srcKeys = new Set(srcByKey.keys());
  const appKeys = new Set(appByKey.keys());
  const matched = [...srcKeys].filter((k) => appKeys.has(k)).sort();
  const sourceOnly = [...srcKeys].filter((k) => !appKeys.has(k)).sort();
  const appOnly = [...appKeys].filter((k) => !srcKeys.has(k)).sort();
  const appOnlyMarkers: string[] = [];
  const appOnlyOrphans: string[] = [];
  for (const k of appOnly) {
    const row = appByKey.get(k)!;
    (pin.isMarker?.(row) ? appOnlyMarkers : appOnlyOrphans).push(k);
  }

  // ── Layer 2: content (Tier-1) on matched rows — daily_outcome HARD, weekly_* informational ──
  const content: FieldContentDiff[] = [
    diffField(
      'daily_outcome',
      false,
      matched,
      (k) => srcByKey.get(k)?.outcome ?? null,
      (k) => appByKey.get(k)?.dailyOutcome ?? null,
    ),
  ];
  for (const [dbField, sourceCol] of Object.entries(pin.fields ?? {})) {
    if (!sourceCol) continue;
    content.push(
      diffField(
        dbField,
        true,
        matched,
        (k) => srcByKey.get(k)?.values[sourceCol] ?? null,
        (k) => appByKey.get(k)?.fields[dbField] ?? null,
      ),
    );
  }

  // ── Layer 3: set cross-check ──
  const appSet = new Set(
    appAll.map((r) => tier1(r.dailyOutcome)).filter((v): v is string => v != null),
  );
  const pinnedLabel = pin.candidates.find(
    (c) => JSON.stringify(c.rule) === JSON.stringify(pin.outcome),
  )?.label;
  const candidates: CandidateScore[] = pin.candidates.map((cand) => {
    const candSet = new Set(
      srcRows
        .map((r) => tier1(applyOutcomeRule(cand.rule, (col) => r.values[col] ?? null)))
        .filter((v): v is string => v != null),
    );
    let inter = 0;
    for (const v of appSet) if (candSet.has(v)) inter++;
    const union = appSet.size + candSet.size - inter;
    return {
      label: cand.label,
      jaccard: union === 0 ? 1 : inter / union,
      appCoverage: appSet.size === 0 ? 1 : inter / appSet.size,
      exactMatch: appSet.size === candSet.size && inter === appSet.size,
    };
  });
  const ranked = [...candidates].sort((a, b) => b.jaccard - a.jaccard);
  const bestLabel = ranked[0]?.label ?? null;

  // ── Layer 4: whitespace-only (Tier-0 fail / Tier-1 pass) on daily_outcome ──
  const wsSamples: ContentSample[] = [];
  let wsCount = 0;
  for (const k of matched) {
    const s = srcByKey.get(k)?.outcome ?? null;
    const a = appByKey.get(k)?.dailyOutcome ?? null;
    if (tier1(s) === tier1(a) && tier0(s) !== tier0(a)) {
      wsCount++;
      if (wsSamples.length < SAMPLE_LIMIT)
        wsSamples.push({ keyStr: k, source: truncate(s), app: truncate(a) });
    }
  }

  const dailyMismatches = content[0].mismatches;
  const gatePass = appOnlyOrphans.length === 0 && dailyMismatches === 0;

  return {
    subject: pin.subject,
    sheet: pin.sheet,
    excludedYears: [...excluded].sort(),
    coverage: {
      sourceRows: srcKeys.size,
      appRows: appKeys.size,
      matched: matched.length,
      sourceOnly,
      appOnlyOrphans,
      appOnlyMarkers,
    },
    content,
    setCrossCheck: {
      appSetSize: appSet.size,
      candidates,
      bestLabel,
      pinnedColumnIsBest: pinnedLabel != null && bestLabel === pinnedLabel,
    },
    whitespaceOnly: { count: wsCount, samples: wsSamples },
    duplicateSourceKeys: extract.duplicateKeys,
    skippedSourceRows: extract.skipped,
    gatePass,
    strictPass: gatePass && sourceOnly.length === 0,
  };
}

/** Render a human-readable subject report (used by the CLI and on gate failure). */
export function formatSubjectReport(r: SubjectReport): string {
  const L: string[] = [];
  const cov = r.coverage;
  const excl = r.excludedYears.length ? ` excl-years=[${r.excludedYears.join(',')}]` : '';
  L.push(
    `${r.subject.padEnd(15)} [${r.sheet}]  source=${cov.sourceRows} app=${cov.appRows} ` +
      `matched=${cov.matched} source-only=${cov.sourceOnly.length} ` +
      `app-only(orphan=${cov.appOnlyOrphans.length}, marker=${cov.appOnlyMarkers.length})${excl}`,
  );
  if (cov.appOnlyOrphans.length)
    L.push(`  ⚠ orphan app-only (blocks gate): ${cov.appOnlyOrphans.slice(0, 8).join(', ')}`);
  if (cov.appOnlyMarkers.length)
    L.push(`  · marker app-only (excused): ${cov.appOnlyMarkers.slice(0, 6).join(', ')}`);
  if (cov.sourceOnly.length)
    L.push(`  · source-only (un-imported): ${cov.sourceOnly.slice(0, 6).join(', ')}`);
  for (const c of r.content) {
    const tag = c.mismatches === 0 ? '✓' : c.informational ? '·' : '✗';
    const label = c.informational ? `${c.field} (informational)` : c.field;
    L.push(`  ${tag} ${label}: ${c.mismatches}/${c.compared} Tier-1 mismatch`);
    if (!c.informational)
      for (const s of c.samples)
        L.push(`      ${s.keyStr}\n        source: ${truncate(s.source)}\n        app:    ${truncate(s.app)}`);
  }
  L.push(`  set cross-check (app daily_outcome set, |${r.setCrossCheck.appSetSize}|):`);
  for (const c of r.setCrossCheck.candidates)
    L.push(
      `      ${c.exactMatch ? '=' : ' '} ${c.label.padEnd(30)} jaccard=${c.jaccard.toFixed(3)} appCoverage=${c.appCoverage.toFixed(3)}`,
    );
  if (!r.setCrossCheck.pinnedColumnIsBest && r.setCrossCheck.bestLabel)
    L.push(`  ⚠ DB set best matches "${r.setCrossCheck.bestLabel}", NOT the pinned outcome column`);
  if (r.whitespaceOnly.count) L.push(`  · whitespace-only (Tier-0 noise): ${r.whitespaceOnly.count}`);
  if (r.duplicateSourceKeys.length)
    L.push(`  ⚠ duplicate source keys: ${r.duplicateSourceKeys.length}`);
  L.push(`  → ${r.gatePass ? 'GATE PASS' : 'GATE FAIL'}${r.strictPass ? ' (strict zero-diff)' : ''}`);
  return L.join('\n');
}
