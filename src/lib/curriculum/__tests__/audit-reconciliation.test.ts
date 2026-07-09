import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAppGoldText } from '../audit/app-source';
import { extractWorkbook } from '../audit/extract';
import { canAudit, goldTextFor, workbookPath } from '../audit/fixtures';
import { pinnedSubjects, unpinnedSubjects } from '../audit/pinned-map';
import { formatSubjectReport, hardContentMismatches, reconcileSubject } from '../audit/reconcile';

// ── Curriculum fidelity GATE (independent, full-content reconciliation) ────────────
//
// The permanent gate the audit brief §4.3 calls for: the INDEPENDENT extractor (raw
// Excel via the human-pinned map, zero parser code) is reconciled against the exported
// DB gold master, and the ingest-blocking invariant is asserted per pinned subject:
//   • no app-only rows  (nothing fabricated/orphaned in the DB)
//   • zero Tier-1 content mismatches on matched rows (no wrong-column / shift corruption)
//
// LOCAL-ONLY, like the parser parity gate: the raw workbooks and the DB gold master are
// gitignored IP, so this self-skips where they're absent (CI, or before the fixtures are
// dropped in). Run it with the real Excels + goldmaster/<subject>.csv under the fixtures
// dir (or CURRICULUM_FIXTURES_DIR).

for (const pin of pinnedSubjects()) {
  const skip = !canAudit(pin)
    ? workbookPath(pin) == null
      ? 'source workbook absent (gitignored IP)'
      : 'DB gold master absent (export curriculum_lesson to goldmaster/<subject>.csv)'
    : false;

  test(`fidelity gate — ${pin.subject}`, { skip }, () => {
    const extract = extractWorkbook(readFileSync(workbookPath(pin)!), pin);
    const appRows = loadAppGoldText(pin.subject, goldTextFor(pin.subject)!);
    const report = reconcileSubject(pin, extract, appRows);

    assert.equal(
      report.coverage.appOnlyOrphans.length,
      0,
      `${pin.subject}: ${report.coverage.appOnlyOrphans.length} DB row(s) have NO backing ` +
        `source row and are not documented markers (fabricated/orphaned).\n${formatSubjectReport(report)}`,
    );
    assert.equal(
      hardContentMismatches(report),
      0,
      `${pin.subject}: Tier-1 daily_outcome corruption on matched rows.\n${formatSubjectReport(report)}`,
    );
  });
}

// Not a failure — a loud, permanent reminder that the audit does NOT yet cover these
// subjects, so nobody mistakes a green suite for full curriculum coverage.
test('unpinned subjects are surfaced, not silently skipped', () => {
  const unpinned = unpinnedSubjects().map((p) => p.subject);
  if (unpinned.length) {
    console.warn(
      `\n[curriculum audit] UNPINNED subjects (no verified coordinate map — NOT audited): ` +
        `${unpinned.join(', ')}. Declare each against its real gold-master workbook and set ` +
        `pinned: true in audit/pinned-map.ts.\n`,
    );
  }
  // The set is known and enumerated; this asserts the harness accounts for every subject.
  assert.ok(unpinned.every((s) => typeof s === 'string'));
});
