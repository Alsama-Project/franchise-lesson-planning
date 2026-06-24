// Dev harness: dry-run the curriculum parser against a local .xlsx and pretty-print
// the ImportReport (column map, unmapped headers, missing fields, sample records).
// Nothing is written. Use this to validate header mappings on the real subject files
// BEFORE anything goes near the live import endpoint.
//
//   npm run ingest:curriculum -- <path-to.xlsx> [--subject <code>] [--sheet "<name>"]
//
// Examples:
//   npm run ingest:curriculum -- ~/Downloads/English\ Curriculum.xlsx --subject english
//   npm run ingest:curriculum -- ~/Downloads/Professionalism.xlsx --sheet "V4"
//
// Runs directly on Node's TypeScript type-stripping (Node ≥ 22.6) — no build step.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseCurriculumWorkbook } from '../src/lib/curriculum/parse';

function parseArgs(argv: string[]): { file?: string; subject?: string; sheet?: string } {
  const out: { file?: string; subject?: string; sheet?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--subject') out.subject = argv[++i];
    else if (a === '--sheet') out.sheet = argv[++i];
    else if (!a.startsWith('--') && !out.file) out.file = a;
  }
  return out;
}

function hr(label: string): void {
  console.log(`\n\x1b[1m── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}\x1b[0m`);
}

async function main(): Promise<void> {
  const { file, subject, sheet } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('Usage: npm run ingest:curriculum -- <path-to.xlsx> [--subject <code>] [--sheet "<name>"]');
    process.exit(1);
  }
  const subjectCode = subject ?? basename(file).split(/[ .]/)[0].toLowerCase();

  const buf = await readFile(file);
  const { report, records, lessonRows, skippedLessonRows } = parseCurriculumWorkbook(
    buf,
    subjectCode,
    { sheet, fileName: basename(file) },
  );

  hr('Summary');
  console.log({
    file: report.fileName,
    subjectCode,
    selectedSheet: report.selectedSheet,
    candidateSheets: report.candidateSheets,
    headerRow: report.headerRow,
    grain: report.grain,
    needsReview: report.needsReview,
    records: records.length,
    lessonRows: lessonRows.length,
    skippedLessonRows,
  });

  hr('Column map');
  console.table(report.columnMap);

  hr('Unmapped headers (NEW / RENAMED columns to check)');
  console.table(report.unmappedHeaders.length ? report.unmappedHeaders : [{ header: '(none)', column: '' }]);

  hr('Missing expected fields');
  console.log(report.missingFields.length ? report.missingFields : '(none)');

  hr('Warnings');
  if (report.warnings.length) report.warnings.forEach((w) => console.log(' •', w));
  else console.log('(none)');

  hr('Sample records (first 5)');
  console.dir(report.sampleRecords, { depth: null, maxArrayLength: 5 });
}

main().catch((err) => {
  console.error('\x1b[31mParse failed:\x1b[0m', err instanceof Error ? err.message : err);
  process.exit(1);
});
