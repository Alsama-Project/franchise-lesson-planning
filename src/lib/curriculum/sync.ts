import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCurriculumWorkbook } from './parse';
import type { CurriculumSyncResult, CurriculumSyncSource } from './types';

// ── Curriculum sync core (parse → diff-gate → upsert → reconcile → record run) ───
//
// One workbook is one subject. This module is deliberately free of `server-only`,
// `next/cache`, and the admin-client factory so it can run from BOTH the Next app
// (via import.ts, which supplies the service-role client and revalidates the cache)
// and the dev/ops script (which supplies its own service-role client). The caller
// owns client creation and any cache revalidation; this only touches the database.
//
// Writes go through whatever client the caller passes — in practice the service-role
// client, because `curriculum_lesson` / `curriculum_sync_run` have no write RLS
// policy.
//
// SAFETY — both guards live HERE so the endpoint (n8n + in-app upload) and the ops
// script inherit identical, override-free protection. Behaviour never branches by
// source. A `lesson_plans.curriculum_lesson_id` is a plain text column (no FK — see
// migration 0003), and every curriculum read filters `is_active = true`, so flipping
// a still-referenced row to inactive silently orphans a live plan (its daily outcome,
// LOs and resources resolve to null, with no DB error). The reconcile therefore never
// blindly archives what the parse dropped:
//
//   diff first (lost = existing active keys − regenerated keys)
//     → Guard 2: if |lost| / |existing| exceeds MAX_ARCHIVE_RATIO, ABORT before any
//       write (a structural break / parser regression, not a legit edit)
//     → else upsert new+changed rows
//     → Guard 1: archive only the lost keys NOT referenced by a live lesson plan;
//       leave referenced ones ACTIVE and record them for operator review
//     → record the run; the caller (import.ts) revalidates the cache on success.

/**
 * Guard 2 threshold. A legitimate curriculum edit touches single-digit rows; a
 * structural break (renamed month cell, header shift that flips grain to weekly, a
 * parser regression) drops hundreds at once. Every subject holds 200+ active rows,
 * so 10% ≈ 20+ lost keys to trip — comfortably above any real edit, yet far below a
 * mass drop. Evaluated on the LOST set only: landing hundreds of NEW keys is fine;
 * dropping hundreds is the alarm.
 */
export const MAX_ARCHIVE_RATIO = 0.1;

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

  // Close the run as errored/aborted, recording an optional `warnings` payload for
  // the operator console. `aborted` marks a circuit-breaker stop (nothing written)
  // vs. an unexpected failure.
  const fail = async (
    message: string,
    opts: { aborted?: boolean; warnings?: unknown } = {},
  ): Promise<CurriculumSyncResult> => {
    if (runId) {
      await supabase
        .from('curriculum_sync_run')
        .update({
          status: 'error',
          error: message,
          warnings: opts.warnings ?? null,
          finished_at: new Date().toISOString(),
        })
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
      ...(opts.aborted ? { aborted: true } : {}),
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

  // ── Diff FIRST, before any write ──────────────────────────────────────────────
  // The keys this parse produces vs. the subject's current active keys. `lost` is
  // what a plain reconcile would archive; both guards reason about it.
  const regeneratedKeys = new Set(lessonRows.map((r) => r.lesson_key));

  const { data: existingRows, error: existingError } = await supabase
    .from('curriculum_lesson')
    .select('lesson_key')
    .eq('subject_code', subjectCode)
    .eq('is_active', true);
  if (existingError) {
    return fail(`Existing-key read failed: ${existingError.message}`);
  }
  const existingKeys = new Set(
    (existingRows ?? []).map((r) => (r as { lesson_key: string }).lesson_key),
  );
  const lostKeys = [...existingKeys].filter((k) => !regeneratedKeys.has(k));

  // ── Guard 2: magnitude circuit-breaker ────────────────────────────────────────
  // Only meaningful once a baseline exists (a fresh subject has nothing to drop).
  if (existingKeys.size > 0) {
    const ratio = lostKeys.length / existingKeys.size;
    if (ratio > MAX_ARCHIVE_RATIO) {
      const counts = {
        active: existingKeys.size,
        regenerated: regeneratedKeys.size,
        lost: lostKeys.length,
        ratio: Number(ratio.toFixed(4)),
        threshold: MAX_ARCHIVE_RATIO,
      };
      return fail(
        `Circuit-breaker: parse would archive ${lostKeys.length}/${existingKeys.size} active ` +
          `${subjectCode} rows (${(ratio * 100).toFixed(1)}% > ${(MAX_ARCHIVE_RATIO * 100).toFixed(0)}% ` +
          `limit). Aborted before writing — likely a structural break or parser regression.`,
        { aborted: true, warnings: { circuitBreaker: { aborted: true, ...counts } } },
      );
    }
  }

  // ── Upsert new + changed rows on the stable lesson_key ────────────────────────
  // (NOT the 5-tuple — `period` is nullable now, so weekly-grain / non-instructional
  // rows have no period to key on.) `synced_at` is stamped for provenance.
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

  // ── Guard 1: never archive a lost key a live plan still references ─────────────
  // lesson_plans has no soft-delete (its `status` enum is a workflow state, not an
  // archive flag — migrations 0001/0003), so ANY referencing row counts as live.
  let skippedReferencedKeys: string[] = [];
  if (lostKeys.length > 0) {
    const { data: refRows, error: refError } = await supabase
      .from('lesson_plans')
      .select('curriculum_lesson_id')
      .in('curriculum_lesson_id', lostKeys);
    if (refError) {
      return fail(`Reference check failed: ${refError.message}`);
    }
    skippedReferencedKeys = [
      ...new Set(
        (refRows ?? []).map((r) => (r as { curriculum_lesson_id: string }).curriculum_lesson_id),
      ),
    ];
  }
  const skip = new Set(skippedReferencedKeys);
  const keysToArchive = lostKeys.filter((k) => !skip.has(k));

  // Archive exactly the unreferenced lost keys (explicit set, derived from the
  // pre-write snapshot — no watermark needed, and referenced rows stay active).
  let rowsDeactivated = 0;
  if (keysToArchive.length > 0) {
    const { data: deactivated, error: reconcileError } = await supabase
      .from('curriculum_lesson')
      .update({ is_active: false })
      .eq('subject_code', subjectCode)
      .eq('is_active', true)
      .in('lesson_key', keysToArchive)
      .select('id');
    if (reconcileError) {
      return fail(`Reconcile failed: ${reconcileError.message}`);
    }
    rowsDeactivated = (deactivated ?? []).length;
  }

  const rowsUpserted = lessonRows.length;
  const unresolved = lessonRows.filter((r) => !r.daily_outcome).length;

  if (runId) {
    await supabase
      .from('curriculum_sync_run')
      .update({
        status: 'success',
        rows_upserted: rowsUpserted,
        rows_deactivated: rowsDeactivated,
        unresolved,
        warnings:
          skippedReferencedKeys.length > 0
            ? { skippedReferencedKeys, skippedReferencedCount: skippedReferencedKeys.length }
            : null,
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
    ...(skippedReferencedKeys.length > 0 ? { skippedReferencedKeys } : {}),
  };
}
