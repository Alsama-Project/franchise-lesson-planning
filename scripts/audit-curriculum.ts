// ── Curriculum fidelity audit — report + manual gate ─────────────────────────────
//
// Runs the INDEPENDENT reconciliation (raw Excel extraction via the human-pinned map
// vs the exported DB gold master) for every verified subject, prints the layered
// report, and exits non-zero if any auditable subject fails the ingest-blocking gate
// (app-only == 0 AND zero Tier-1 content mismatches). Shares no code with the parser.
//
//   npm run audit:curriculum
//
// Everything self-skips when the raw workbooks / gold master are absent (they are
// gitignored IP). Point at out-of-tree IP with CURRICULUM_FIXTURES_DIR.
import { readFileSync } from 'node:fs';
import { loadAppGoldText } from '../src/lib/curriculum/audit/app-source';
import { extractWorkbook } from '../src/lib/curriculum/audit/extract';
import { canAudit, fixturesDir, goldTextFor, workbookPath } from '../src/lib/curriculum/audit/fixtures';
import { pinnedSubjects, unpinnedSubjects } from '../src/lib/curriculum/audit/pinned-map';
import { formatSubjectReport, reconcileSubject } from '../src/lib/curriculum/audit/reconcile';

console.log(`── curriculum fidelity audit ──  fixtures: ${fixturesDir()}\n`);

const pinned = pinnedSubjects();
const auditable = pinned.filter(canAudit);

if (auditable.length === 0) {
  console.log('No auditable subject (raw workbook + DB gold master both present).');
  console.log('Drop the real Excels + goldmaster/<subject>.csv under the fixtures dir, or set');
  console.log('CURRICULUM_FIXTURES_DIR, then re-run. Nothing to gate — exiting 0.\n');
}

let anyFail = false;
for (const pin of pinned) {
  if (!canAudit(pin)) {
    const why = workbookPath(pin) == null ? 'workbook absent' : 'gold master absent';
    console.log(`${pin.subject.padEnd(15)} — skipped (${why})`);
    continue;
  }
  const buf = readFileSync(workbookPath(pin)!);
  const extract = extractWorkbook(buf, pin);
  const appRows = loadAppGoldText(pin.subject, goldTextFor(pin.subject)!);
  const report = reconcileSubject(pin, extract, appRows);
  console.log(formatSubjectReport(report));
  console.log('');
  anyFail ||= !report.gatePass;
}

const unpinned = unpinnedSubjects();
if (unpinned.length) {
  console.log('── UNPINNED (a human must declare coordinates vs the real workbook) ──');
  for (const p of unpinned) console.log(`  ${p.subject}`);
  console.log('');
}

if (auditable.length > 0) {
  console.log(anyFail ? '✗ AUDIT GATE FAILED' : '✓ audit gate passed for all auditable subjects');
  process.exit(anyFail ? 1 : 0);
}
