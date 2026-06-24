// Dev/ops harness for the curriculum ingest. Two modes:
//
//   DRY-RUN (default): parse a local .xlsx and pretty-print the ImportReport
//     (column map, unmapped headers, missing fields, sample records). Writes nothing.
//
//   WRITE (--write): run the real import (parse → upsert on lesson_key → reconcile →
//     record a sync run) through the service-role client. BEFORE writing it runs the
//     lesson_key SAFETY GATE: it generates a lesson_key for every parsed row and
//     compares to the subject's existing active lesson_keys in the DB. If any existing
//     key would be LOST (which would orphan live lesson plans linked to it), it ABORTS
//     and prints the diff. Brand-new keys (a fresh subject, weekly-grain, or
//     non-instructional rows) are reported but allowed.
//
//   npm run ingest:curriculum -- <path-to.xlsx> [--subject <code>] [--sheet "<name>"] [--write] [--force]
//
// Examples:
//   npm run ingest:curriculum -- ~/Downloads/English\ Curriculum.xlsx --subject english
//   npm run ingest:curriculum -- ~/Downloads/Professionalism.xlsx --sheet "V4"
//   npm run ingest:curriculum -- ~/Downloads/English\ Curriculum.xlsx --subject english --write
//
// --write needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from the
// environment, or from .env.local in the project root if present).
//
// Runs directly on Node's TypeScript type-stripping (Node ≥ 22.6) — no build step.

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseCurriculumWorkbook } from '../src/lib/curriculum/parse';
import { syncCurriculumWorkbook } from '../src/lib/curriculum/sync';

interface Args {
  file?: string;
  subject?: string;
  sheet?: string;
  write: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { write: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--subject') out.subject = argv[++i];
    else if (a === '--sheet') out.sheet = argv[++i];
    else if (a === '--write') out.write = true;
    else if (a === '--force') out.force = true;
    else if (!a.startsWith('--') && !out.file) out.file = a;
  }
  return out;
}

function hr(label: string): void {
  console.log(`\n\x1b[1m── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}\x1b[0m`);
}

/** Best-effort: load KEY=VALUE pairs from .env.local into process.env (no overwrite). */
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

function makeAdminClient(): SupabaseClient {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '--write needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env.local).',
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The lesson_key safety gate. Returns true if it is safe to write. */
async function lessonKeyGate(
  supabase: SupabaseClient,
  subjectCode: string,
  generatedKeys: string[],
  force: boolean,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('curriculum_lesson')
    .select('lesson_key')
    .eq('subject_code', subjectCode)
    .eq('is_active', true);
  if (error) throw new Error(`Gate read failed: ${error.message}`);

  const existing = new Set((data ?? []).map((r) => (r as { lesson_key: string }).lesson_key));
  const generated = new Set(generatedKeys);

  const lost = [...existing].filter((k) => !generated.has(k)); // in DB, NOT regenerated
  const added = [...generated].filter((k) => !existing.has(k)); // new keys this import
  const matched = [...existing].filter((k) => generated.has(k)).length;

  hr('lesson_key safety gate');
  console.log({
    subjectCode,
    existingActive: existing.size,
    generated: generated.size,
    matched,
    lost: lost.length,
    added: added.length,
  });

  if (existing.size === 0) {
    console.log('No existing active rows for this subject — nothing to orphan; safe to write.');
    return true;
  }

  if (lost.length > 0) {
    console.error(
      `\n\x1b[31mDANGER:\x1b[0m ${lost.length} existing lesson_key(s) would be LOST (their live` +
        ` lesson plans would be orphaned). Sample:`,
    );
    console.error(lost.slice(0, 20));
    if (!force) {
      console.error('\nAborting. Re-run with --force only if you are certain this is intended.');
      return false;
    }
    console.error('\n--force set — proceeding despite lost keys.');
  }

  if (added.length > 0) {
    console.log(`\n${added.length} new lesson_key(s) will be inserted. Sample:`);
    console.log(added.slice(0, 20));
  }

  if (lost.length === 0) {
    console.log('\nEvery existing lesson_key is reproduced — no live plan is orphaned. Safe to write.');
  }
  return true;
}

async function main(): Promise<void> {
  const { file, subject, sheet, write, force } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error(
      'Usage: npm run ingest:curriculum -- <path-to.xlsx> [--subject <code>] [--sheet "<name>"] [--write] [--force]',
    );
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

  if (!write) {
    hr('Dry run');
    console.log('No data written. Re-run with --write to import (after confirming the mappings).');
    return;
  }

  // ── Write path: gate, then sync ──
  const supabase = makeAdminClient();
  const safe = await lessonKeyGate(
    supabase,
    subjectCode,
    lessonRows.map((r) => r.lesson_key),
    force,
  );
  if (!safe) process.exit(2);

  hr('Importing');
  const result = await syncCurriculumWorkbook(supabase, {
    buffer: buf,
    subjectCode,
    source: 'upload',
    sheet,
  });
  console.log(result);
  if (result.status === 'error') process.exit(3);
  console.log('\n\x1b[32mDone.\x1b[0m');
}

main().catch((err) => {
  console.error('\x1b[31mIngest failed:\x1b[0m', err instanceof Error ? err.message : err);
  process.exit(1);
});
