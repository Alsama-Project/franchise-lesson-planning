import 'server-only';

import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCurriculumWorkbook } from '@/lib/curriculum/parse';
import { CURRICULUM_CACHE_TAG } from '@/lib/curriculumUtils';
import type { CurriculumSyncResult, CurriculumSyncSource } from '@/lib/curriculum/types';

// ── Curriculum import (parse → upsert → reconcile → record run) ──────────────────
//
// One workbook is one subject. All writes go through the service-role client (the
// `curriculum_lesson` / `curriculum_sync_run` tables have no write RLS policy). The
// reconcile step is a watermark: every row touched this run gets synced_at = the run
// timestamp; any active row of this subject left behind (older synced_at) is flipped
// is_active=false, so deletions in the source propagate without dropping history.

interface ImportArgs {
  buffer: Buffer | ArrayBuffer;
  subjectCode: string;
  source: CurriculumSyncSource;
}

export async function importCurriculumWorkbook(
  args: ImportArgs,
): Promise<CurriculumSyncResult> {
  const { buffer, subjectCode, source } = args;
  const supabase = createAdminClient();
  const runTimestamp = new Date().toISOString();

  // Open a sync run first so even a parse failure is recorded.
  const { data: runRow } = await supabase
    .from('curriculum_sync_run')
    .insert({ subject_code: subjectCode, source, started_at: runTimestamp, status: 'running' })
    .select('id')
    .maybeSingle();
  const runId = (runRow as { id: string } | null)?.id ?? null;

  const fail = async (message: string): Promise<CurriculumSyncResult> => {
    if (runId) {
      await supabase
        .from('curriculum_sync_run')
        .update({ status: 'error', error: message, finished_at: new Date().toISOString() })
        .eq('id', runId);
    }
    return {
      runId,
      subjectCode,
      rowsUpserted: 0,
      rowsDeactivated: 0,
      unresolved: 0,
      status: 'error',
      error: message,
    };
  };

  let lessonRows;
  try {
    // The parser returns the full canonical model + a report; here we write the subset
    // that satisfies the current curriculum_lesson 5-tuple key. Weekly-grain /
    // non-instructional records are surfaced in the report and skipped on write
    // (`skippedLessonRows`) until the schema migration adds source_key + nullable nav.
    ({ lessonRows } = parseCurriculumWorkbook(buffer, subjectCode));
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to parse workbook.');
  }

  if (lessonRows.length === 0) {
    return fail('No curriculum rows were found in the workbook.');
  }

  // Upsert on the natural key, stamping every touched row with the run watermark.
  const payload = lessonRows.map((row) => ({
    ...row,
    is_active: true,
    source,
    synced_at: runTimestamp,
  }));

  const { error: upsertError } = await supabase
    .from('curriculum_lesson')
    .upsert(payload, { onConflict: 'subject_code,year,month,week,period' });
  if (upsertError) {
    return fail(`Upsert failed: ${upsertError.message}`);
  }

  // Reconcile: deactivate any still-active row of this subject not touched this run.
  const { data: deactivated, error: reconcileError } = await supabase
    .from('curriculum_lesson')
    .update({ is_active: false })
    .eq('subject_code', subjectCode)
    .eq('is_active', true)
    .lt('synced_at', runTimestamp)
    .select('id');
  if (reconcileError) {
    return fail(`Reconcile failed: ${reconcileError.message}`);
  }

  const rowsUpserted = lessonRows.length;
  const rowsDeactivated = (deactivated ?? []).length;
  const unresolved = lessonRows.filter((r) => !r.daily_outcome).length;

  if (runId) {
    await supabase
      .from('curriculum_sync_run')
      .update({
        status: 'success',
        rows_upserted: rowsUpserted,
        rows_deactivated: rowsDeactivated,
        unresolved,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
  }

  // New data is live — drop the cached reference reads immediately.
  revalidateTag(CURRICULUM_CACHE_TAG, { expire: 0 });

  return {
    runId,
    subjectCode,
    rowsUpserted,
    rowsDeactivated,
    unresolved,
    status: 'success',
  };
}
