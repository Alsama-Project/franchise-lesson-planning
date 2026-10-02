import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. It BYPASSES Row Level Security, so it must never
 * be used to serve user-scoped data in a user request (see AGENTS.md). Its only
 * legitimate uses here are:
 *
 *   1. Curriculum WRITES — the import endpoint upserts/reconciles `curriculum_lesson`
 *      and records `curriculum_sync_run`. The brief specifies writes go through the
 *      service role (there is no write RLS policy on these tables).
 *
 *   3. Worksheet-image cache WRITES — `worksheet_image` rows are shared by every
 *      teacher, so no signed-in user may insert them; the image route inserts the row
 *      for an image the server itself just generated (src/app/api/worksheet/image).
 *
 *   2. Cached curriculum READS — `curriculum_lesson` is global reference data that
 *      is identical for every authenticated user. The read path is wrapped in
 *      `unstable_cache`, whose cache scope cannot access the cookie-bound auth'd
 *      client. A service-role read of non-user-scoped reference data leaks nothing
 *      a signed-in user could not already select under the `curr_read` policy.
 *
 * The `server-only` import guarantees this module can never be bundled for the
 * browser. The key is read lazily so the app still builds without it set.
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. The ' +
        'service-role client is required for curriculum import and cached reads.',
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
