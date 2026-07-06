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
  /**
   * Original workbook filename, when the caller has it (in-app upload / multipart
   * endpoint). Recorded on the run (`curriculum_sync_run.source_filename`, migration
   * 0054) for the Curriculum Gaps reconcile action bar; null for sources that supply none.
   */
  fileName?: string;
  /**
   * PUBLISH AS A NEW VERSION instead of reconciling the current one. This is a
   * distinct action, not a normal upload:
   *   • false / omitted (default) = RECONCILE the subject's active version — upsert
   *     into it, apply Guard 1 + Guard 2, archive unreferenced lost rows. A routine
   *     re-sync that edits the current curriculum.
   *   • true = create a NEW curriculum_version, write every parsed row under it, and
   *     atomically make it active (demoting the prior version to historical). The
   *     prior version's rows are NOT archived or mutated — they persist, and any plan
   *     stamped with the prior version keeps resolving them. The guards do NOT run
   *     (nothing is being dropped from the active set), so a full re-author never
   *     trips the circuit-breaker.
   */
  newVersion?: boolean;
}

interface CurriculumVersionRow {
  id: string;
  version_no: number;
}

export async function syncCurriculumWorkbook(
  supabase: SupabaseClient,
  args: SyncArgs,
): Promise<CurriculumSyncResult> {
  const { buffer, subjectCode, source, sheet, fileName, newVersion = false } = args;
  const runTimestamp = new Date().toISOString();

  // Open a sync run first so even a parse failure is recorded.
  const { data: runRow } = await supabase
    .from('curriculum_sync_run')
    .insert({
      subject_code: subjectCode,
      source,
      source_filename: fileName ?? null,
      started_at: runTimestamp,
      status: 'running',
    })
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

  const unresolved = lessonRows.filter((r) => !r.daily_outcome).length;

  // Resolve the subject's current active version (null for a brand-new subject).
  const { data: activeVersionRow, error: versionReadError } = await supabase
    .from('curriculum_version')
    .select('id, version_no')
    .eq('subject_code', subjectCode)
    .eq('is_active', true)
    .maybeSingle();
  if (versionReadError) {
    return fail(`Active-version read failed: ${versionReadError.message}`);
  }
  let activeVersion = activeVersionRow as CurriculumVersionRow | null;

  // Close the run as success with the given counts + optional warnings (shared by the
  // reconcile and publish-new-version paths).
  const succeed = async (opts: {
    rowsUpserted: number;
    rowsDeactivated: number;
    skippedReferencedKeys?: string[];
    newVersionNo?: number;
  }): Promise<CurriculumSyncResult> => {
    const skipped = opts.skippedReferencedKeys ?? [];
    if (runId) {
      await supabase
        .from('curriculum_sync_run')
        .update({
          status: 'success',
          rows_upserted: opts.rowsUpserted,
          rows_deactivated: opts.rowsDeactivated,
          unresolved,
          warnings:
            skipped.length > 0
              ? { skippedReferencedKeys: skipped, skippedReferencedCount: skipped.length }
              : null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }
    return {
      runId,
      subjectCode,
      rowsUpserted: opts.rowsUpserted,
      rowsDeactivated: opts.rowsDeactivated,
      unresolved,
      status: 'success',
      ...(skipped.length > 0 ? { skippedReferencedKeys: skipped } : {}),
      ...(opts.newVersionNo != null ? { newVersionNo: opts.newVersionNo } : {}),
    };
  };

  // ── PUBLISH NEW VERSION ────────────────────────────────────────────────────────
  // A distinct action from reconcile: write every parsed row under a fresh version and
  // make it active, leaving the prior version's rows untouched. No diff, no guards, no
  // archive — nothing is dropped from any version, so the circuit-breaker is N/A.
  if (newVersion) {
    // Next version number for the subject (max + 1, or 1 when none exist).
    const { data: maxRow, error: maxError } = await supabase
      .from('curriculum_version')
      .select('version_no')
      .eq('subject_code', subjectCode)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) {
      return fail(`Version lookup failed: ${maxError.message}`);
    }
    const nextVersionNo = ((maxRow as { version_no: number } | null)?.version_no ?? 0) + 1;

    // Create the new version INACTIVE first: if the row write below fails, the subject
    // keeps its current active version (the dangling empty version is harmless and the
    // action is re-runnable). It is promoted to active atomically at the end.
    const { data: createdVersion, error: createError } = await supabase
      .from('curriculum_version')
      .insert({ subject_code: subjectCode, version_no: nextVersionNo, is_active: false })
      .select('id, version_no')
      .maybeSingle();
    if (createError || !createdVersion) {
      return fail(`Could not create new version: ${createError?.message ?? 'no row returned'}`);
    }
    const newVersionId = (createdVersion as CurriculumVersionRow).id;

    // Write every parsed row under the new version. Plain insert — a fresh version has
    // no existing rows to conflict with; prior versions' rows are left as-is.
    const versionPayload = lessonRows.map((row) => ({
      ...row,
      is_active: true,
      source,
      synced_at: runTimestamp,
      curriculum_version_id: newVersionId,
    }));
    const { error: insertError } = await supabase.from('curriculum_lesson').insert(versionPayload);
    if (insertError) {
      return fail(`New-version row write failed: ${insertError.message}`);
    }

    // Atomically make the new version active, demoting the prior one to historical in
    // the SAME statement (never two active, never zero active mid-flip).
    const { error: activateError } = await supabase.rpc('curriculum_activate_version', {
      p_subject: subjectCode,
      p_version_id: newVersionId,
    });
    if (activateError) {
      return fail(`Version activation failed: ${activateError.message}`);
    }

    return succeed({ rowsUpserted: lessonRows.length, rowsDeactivated: 0, newVersionNo: nextVersionNo });
  }

  // ── RECONCILE the active version (default path) ────────────────────────────────
  // A fresh subject has no version yet: create version 1 (active) and reconcile into it
  // (nothing existing, so the guards are inert on the first sync).
  if (!activeVersion) {
    const { data: v1, error: v1Error } = await supabase
      .from('curriculum_version')
      .insert({ subject_code: subjectCode, version_no: 1, is_active: true })
      .select('id, version_no')
      .maybeSingle();
    if (v1Error || !v1) {
      return fail(`Could not initialise curriculum version: ${v1Error?.message ?? 'no row returned'}`);
    }
    activeVersion = v1 as CurriculumVersionRow;
  }
  const versionId = activeVersion.id;

  // ── Diff FIRST, before any write (WITHIN the active version) ────────────────────
  // The keys this parse produces vs. the active version's current active keys. `lost`
  // is what a plain reconcile would archive; both guards reason about it.
  const regeneratedKeys = new Set(lessonRows.map((r) => r.lesson_key));

  const { data: existingRows, error: existingError } = await supabase
    .from('curriculum_lesson')
    .select('lesson_key')
    .eq('curriculum_version_id', versionId)
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
    curriculum_version_id: versionId,
  }));

  const { error: upsertError } = await supabase
    .from('curriculum_lesson')
    .upsert(payload, { onConflict: 'curriculum_version_id,lesson_key' });
  if (upsertError) {
    return fail(`Upsert failed: ${upsertError.message}`);
  }

  // ── Guard 1: never archive a lost key a live plan still references ─────────────
  // ANY referencing row counts as live — deliberately including soft-deleted
  // (trashed) plans (migration 0048): a trashed plan can be restored, and a restored
  // plan must never point at an archived curriculum lesson. So this reference check
  // is intentionally NOT filtered on `deleted_at`.
  // A plan resolves through THIS version's rows when it is stamped with this version,
  // OR when it carries no version stamp (legacy row → falls back to the active version
  // at read time). A plan stamped to a DIFFERENT version reads its own version's rows,
  // so it does not pin this version's row — hence the version predicate.
  let skippedReferencedKeys: string[] = [];
  if (lostKeys.length > 0) {
    const { data: refRows, error: refError } = await supabase
      .from('lesson_plans')
      .select('curriculum_lesson_id')
      .or(`curriculum_version_id.eq.${versionId},curriculum_version_id.is.null`)
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
      .eq('curriculum_version_id', versionId)
      .eq('is_active', true)
      .in('lesson_key', keysToArchive)
      .select('id');
    if (reconcileError) {
      return fail(`Reconcile failed: ${reconcileError.message}`);
    }
    rowsDeactivated = (deactivated ?? []).length;
  }

  return succeed({
    rowsUpserted: lessonRows.length,
    rowsDeactivated,
    skippedReferencedKeys,
  });
}
