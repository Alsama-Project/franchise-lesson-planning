import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCurriculumWorkbook } from './parse';
import type { CurriculumSyncResult, CurriculumSyncSource } from './types';

// ── Curriculum sync core (parse → upsert → reconcile → record run) ───────────────
//
// One workbook is one subject. This module is deliberately free of `server-only`,
// `next/cache`, and the admin-client factory so it can run from BOTH the Next app
// (via import.ts, which supplies the service-role client and revalidates the cache)
// and the dev/ops script (which supplies its own service-role client). The caller
// owns client creation and any cache revalidation; this only touches the database.
//
// Writes go through whatever client the caller passes — in practice the service-role
// client, because `curriculum_lesson` / `curriculum_sync_run` have no write RLS
// policy. The reconcile step is a watermark: every row touched this run gets
// synced_at = the run timestamp; any active row of this subject left behind (older
// synced_at) is flipped is_active=false, so source deletions propagate without
// dropping history.

export interface SyncArgs {
  buffer: Buffer | ArrayBuffer;
  subjectCode: string;
  source: CurriculumSyncSource;
  /** Optional explicit sheet name (mirrors the parser/script `--sheet`). */
  sheet?: string;
}

export async function syncCurriculumWorkbook(
  supabase: SupabaseClient,
  args: SyncArgs,
): Promise<CurriculumSyncResult> {
  const { buffer, subjectCode, source, sheet } = args;
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
    ({ lessonRows } = parseCurriculumWorkbook(buffer, subjectCode, { sheet }));
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to parse workbook.');
  }

  if (lessonRows.length === 0) {
    return fail('No curriculum rows were found in the workbook.');
  }

  // Upsert on the stable lesson_key (NOT the 5-tuple — `period` is nullable now, so
  // weekly-grain / non-instructional rows have no period to key on), stamping every
  // touched row with the run watermark.
  const payload = lessonRows.map((row) => ({
    ...row,
    is_active: true,
    source,
    synced_at: runTimestamp,
  }));

  const { error: upsertError } = await supabase
    .from('curriculum_lesson')
    .upsert(payload, { onConflict: 'lesson_key' });
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

  return {
    runId,
    subjectCode,
    rowsUpserted,
    rowsDeactivated,
    unresolved,
    status: 'success',
  };
}
