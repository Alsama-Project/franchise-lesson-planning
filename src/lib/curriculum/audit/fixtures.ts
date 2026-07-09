import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PinnedMapping } from './pinned-map';

// ── Fixture resolution (raw source Excels + DB gold master) ───────────────────────
//
// The audit runs against the RAW source workbooks and the exported DB gold master —
// never the committed, derived parity fixtures (those are text-free and can be green
// while the app is wrong). All of it is gitignored IP, so everything self-skips when
// absent (CI, or before a human drops the files in). Override the directory with
// CURRICULUM_FIXTURES_DIR to keep the IP outside the working tree.

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

export function fixturesDir(): string {
  return process.env.CURRICULUM_FIXTURES_DIR ?? resolve(REPO_ROOT, 'test/fixtures/curriculum');
}

/**
 * Resolve a subject's source workbook: the real gold-master filename first, then the
 * parity-harness `<subject>.xlsx` fallback. Null when neither is present.
 */
export function workbookPath(pin: PinnedMapping): string | null {
  const dir = fixturesDir();
  for (const name of [pin.file, pin.fallbackFile]) {
    const p = resolve(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Per-subject DB gold master (`goldmaster/<subject>.csv`). */
export function goldPath(subject: string): string {
  return resolve(fixturesDir(), 'goldmaster', `${subject}.csv`);
}

/** A single COMBINED export of all subjects (`goldmaster.csv`) — what Track A produces. */
export function combinedGoldPath(): string {
  return resolve(fixturesDir(), 'goldmaster.csv');
}

/**
 * Resolve a subject's gold-master CSV text: the per-subject file first, else the combined
 * export (`loadAppGoldText` filters it by subject_code). Null when neither is present.
 */
export function goldTextFor(subject: string): string | null {
  const per = goldPath(subject);
  if (existsSync(per)) return readFileSync(per, 'utf8');
  const combined = combinedGoldPath();
  if (existsSync(combined)) return readFileSync(combined, 'utf8');
  return null;
}

export function hasGold(subject: string): boolean {
  return existsSync(goldPath(subject)) || existsSync(combinedGoldPath());
}

/** True when a subject can actually be audited here (source workbook + DB gold both present). */
export function canAudit(pin: PinnedMapping): boolean {
  return workbookPath(pin) != null && hasGold(pin.subject);
}
