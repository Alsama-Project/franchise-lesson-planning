import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { syncCurriculumWorkbook } from '@/lib/curriculum/sync';
import type { CurriculumSyncResult, CurriculumSyncSource } from '@/lib/curriculum/types';

// ── Curriculum import (server entry) ─────────────────────────────────────────────
//
// Thin server wrapper around the shared `syncCurriculumWorkbook` core: it supplies
// the service-role client (the curriculum tables have no write RLS policy). No cache
// invalidation is needed — curriculum reads are now scoped, per-request DB queries
// (see curriculumUtils), so a sync is visible on the next request with nothing to
// bust. The parse → upsert → reconcile → record-run logic lives in `sync.ts` so the
// ops script can reuse it without pulling in `server-only`.

interface ImportArgs {
  buffer: Buffer | ArrayBuffer;
  subjectCode: string;
  source: CurriculumSyncSource;
  /** Original workbook filename, when known — recorded on the run for the reconcile UI. */
  fileName?: string;
  /** Publish as a new curriculum version instead of reconciling the active one. */
  newVersion?: boolean;
}

export async function importCurriculumWorkbook(
  args: ImportArgs,
): Promise<CurriculumSyncResult> {
  const supabase = createAdminClient();
  return syncCurriculumWorkbook(supabase, args);
}
