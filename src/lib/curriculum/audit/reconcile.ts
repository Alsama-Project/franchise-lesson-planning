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
// GATE invariant (what blocks an ingest): every DB row is backed by a source row
// (app-only == 0, no fabricated/orphaned lessons) AND every matched row's outcome is
// content-identical (Tier-1 mismatches == 0). Source-only rows (in the workbook, not
// yet in the DB) are surfaced but not fatal on their own — a newer workbook legitimately
// carries un-imported new curriculum (same rationale as the parser parity gate's
// non-fatal "extra"). Run against the exact ingest source, source-only is ~zero too.

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
  compared: number;
  mismatches: number;
  samples: ContentSample[];
}

export interface CandidateScore {
  label: string;
  /** |appSet ∩ candSet| / |appSet ∪ candSet| — overall set agreement. */
  jaccard: number;
  /** |appSet ∩ candSet| / |appSet| — how much of the DB set this column explains. */
  appCoverage: number;
  exactMatch: boolean;
}

export interface SubjectReport {
  subject: string;
  sheet: string;
  coverage: {
    sourceRows: number;
    appRows: number;
    matched: number;
    sourceOnly: string[];
    appOnly: string[];
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
  /** appOnly==0 AND all Tier-1 content mismatches==0 — the ingest-blocking invariant. */
  gatePass: boolean;
  /** gatePass AND sourceOnly==0 — full zero-diff (source == app both directions). */
  strictPass: boolean;
}

/** Total Tier-1 content mismatches across daily_outcome and every diffed extra field. */
export function totalContentMismatches(report: SubjectReport): number {
  return report.content.reduce((sum, c) => sum + c.mismatches, 0);
}

function diffField(
  field: string,
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
  return { field, compared: matched.length, mismatches, samples };
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
  const srcByKey = new Map(extract.rows.map((r) => [r.keyStr, r] as const));
  const appByKey = new Map(appRows.map((r) => [r.keyStr, r] as const));

  // ── Layer 1: coverage ──
  const srcKeys = new Set(srcByKey.keys());
  const appKeys = new Set(appByKey.keys());
  const matched = [...srcKeys].filter((k) => appKeys.has(k)).sort();
  const sourceOnly = [...srcKeys].filter((k) => !appKeys.has(k)).sort();
  const appOnly = [...appKeys].filter((k) => !srcKeys.has(k)).sort();

  // ── Layer 2: content (Tier-1) on matched rows ──
  const content: FieldContentDiff[] = [
    diffField(
      'daily_outcome',
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
        matched,
        (k) => srcByKey.get(k)?.values[sourceCol] ?? null,
        (k) => appByKey.get(k)?.fields[dbField] ?? null,
      ),
    );
  }

  // ── Layer 3: set cross-check (which source column did the DB set actually match?) ──
  const appSet = new Set(
    appRows.map((r) => tier1(r.dailyOutcome)).filter((v): v is string => v != null),
  );
  const pinnedLabel = pin.candidates.find(
    (c) =>
      JSON.stringify(c.rule) === JSON.stringify(pin.outcome),
  )?.label;
  const candidates: CandidateScore[] = pin.candidates.map((cand) => {
    const candSet = new Set(
      extract.rows
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
      if (wsSamples.length < SAMPLE_LIMIT) wsSamples.push({ keyStr: k, source: truncate(s), app: truncate(a) });
    }
  }

  const contentMismatches = content.reduce((sum, c) => sum + c.mismatches, 0);
  const gatePass = appOnly.length === 0 && contentMismatches === 0;

  return {
    subject: pin.subject,
    sheet: pin.sheet,
    coverage: {
      sourceRows: srcKeys.size,
      appRows: appKeys.size,
      matched: matched.length,
      sourceOnly,
      appOnly,
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
  L.push(
    `${r.subject.padEnd(15)} [${r.sheet}]  source=${cov.sourceRows} app=${cov.appRows} ` +
      `matched=${cov.matched} source-only=${cov.sourceOnly.length} app-only=${cov.appOnly.length}`,
  );
  if (cov.appOnly.length)
    L.push(`  ⚠ app-only (fabricated/orphaned): ${cov.appOnly.slice(0, 8).join(', ')}`);
  if (cov.sourceOnly.length)
    L.push(`  · source-only (un-imported new content): ${cov.sourceOnly.slice(0, 8).join(', ')}`);
  for (const c of r.content) {
    const tag = c.mismatches === 0 ? '✓' : '✗';
    L.push(`  ${tag} ${c.field}: ${c.mismatches}/${c.compared} Tier-1 mismatch`);
    for (const s of c.samples) L.push(`      ${s.keyStr}\n        source: ${truncate(s.source)}\n        app:    ${truncate(s.app)}`);
  }
  L.push(`  set cross-check (app daily_outcome set, |${r.setCrossCheck.appSetSize}|):`);
  for (const c of r.setCrossCheck.candidates)
    L.push(
      `      ${c.exactMatch ? '=' : ' '} ${c.label.padEnd(32)} jaccard=${c.jaccard.toFixed(3)} appCoverage=${c.appCoverage.toFixed(3)}`,
    );
  if (!r.setCrossCheck.pinnedColumnIsBest && r.setCrossCheck.bestLabel)
    L.push(`  ⚠ DB set best matches "${r.setCrossCheck.bestLabel}", NOT the pinned outcome column`);
  if (r.whitespaceOnly.count)
    L.push(`  · whitespace-only (Tier-0 noise): ${r.whitespaceOnly.count}`);
  if (r.duplicateSourceKeys.length)
    L.push(`  ⚠ duplicate source keys: ${r.duplicateSourceKeys.length}`);
  L.push(`  → ${r.gatePass ? 'GATE PASS' : 'GATE FAIL'}${r.strictPass ? ' (strict zero-diff)' : ''}`);
  return L.join('\n');
}
