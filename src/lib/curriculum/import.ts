import 'server-only';

import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncCurriculumWorkbook } from '@/lib/curriculum/sync';
import { CURRICULUM_CACHE_TAG } from '@/lib/curriculumUtils';
import type { CurriculumSyncResult, CurriculumSyncSource } from '@/lib/curriculum/types';

// ── Curriculum import (server entry) ─────────────────────────────────────────────
//
// Thin server wrapper around the shared `syncCurriculumWorkbook` core: it supplies
// the service-role client (the curriculum tables have no write RLS policy) and, on
// success, drops the cached reference reads so new data is live without a redeploy.
// The parse → upsert → reconcile → record-run logic lives in `sync.ts` so the ops
// script can reuse it without pulling in `server-only` / `next/cache`.

interface ImportArgs {
  buffer: Buffer | ArrayBuffer;
  subjectCode: string;
  source: CurriculumSyncSource;
}

export async function importCurriculumWorkbook(
  args: ImportArgs,
): Promise<CurriculumSyncResult> {
  const supabase = createAdminClient();
  const result = await syncCurriculumWorkbook(supabase, args);

  if (result.status === 'success') {
    // New data is live — drop the cached reference reads immediately.
    revalidateTag(CURRICULUM_CACHE_TAG, { expire: 0 });
  }

  return result;
}
