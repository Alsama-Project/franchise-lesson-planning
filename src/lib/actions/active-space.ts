"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Why a space switch failed, so the switcher can show a specific reason instead of
 * a blanket "try again":
 *   - `no-session`  — no authenticated caller was resolved (see the impersonation
 *     note below); the RPC would run as `anon` and be rejected, so we stop first.
 *   - `not-a-member` — the caller does not hold the target (centre, subject)
 *     membership (the RPC's ownership gate, errcode 42501).
 *   - `failed`      — any other RPC error.
 */
export type SwitchFailure = "no-session" | "not-a-member" | "failed";

export type SetActiveSpaceResult = { ok: true } | { ok: false; reason: SwitchFailure };

/**
 * Set the caller's active subject space to a (centre, subject) they belong to.
 *
 * Writes through the `set_primary_space` SECURITY DEFINER RPC (migration 0042):
 * `subject_membership` has no self-UPDATE RLS policy, so a direct `.update()` of
 * `is_primary` would be blocked — the RPC asserts ownership (keyed on `auth.uid()`)
 * and flips the primary flag atomically, returning the resolved active-space row.
 *
 * Identity is resolved the SAME way every read surface does (`getMyMembershipsFull`,
 * `getImpersonationState`, the proxy): read the user FIRST, then touch the DB. That
 * `getUser()` validates and settles the cookie-bound session on this client, so the
 * RPC below carries the caller's JWT and its `auth.uid()` gate resolves. Under
 * impersonation the live session is the persona, and this is exactly what makes the
 * board and chip resolve as that persona.
 *
 * The old code went straight to `.rpc()` with no prior `getUser()`. On a cold
 * `@supabase/ssr` server client (`autoRefreshToken: false`), the RPC's access-token
 * lookup goes through `getSession()`, which for a token inside the 90s expiry margin
 * attempts an on-demand refresh. Under impersonation the proxy has already refreshed
 * and rotated the refresh token on the same request, so that second refresh runs
 * against a spent token, fails, and yields a null session — the RPC then goes out as
 * `anon`, `auth.uid()` is null, the ownership gate raises 42501, and the switch
 * silently returned `{ ok: false }`. Reading the user first avoids that racy cold
 * refresh, so the RPC runs as the (impersonated) caller.
 */
export async function setActiveSpace(
  schoolId: string,
  subjectId: string,
): Promise<SetActiveSpaceResult> {
  const supabase = await createClient();

  // Resolve identity first — same as every read surface. No user → don't call the
  // RPC (it would run as anon and be rejected); report it specifically instead.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, reason: "no-session" };
  }

  const { data, error } = await supabase.rpc("set_primary_space", {
    target_school: schoolId,
    target_subject: subjectId,
  });

  if (error) {
    // 42501 is the RPC's explicit ownership gate ("Not a member of this space").
    return { ok: false, reason: error.code === "42501" ? "not-a-member" : "failed" };
  }

  // `set_primary_space` RETURNS the resolved active-space row on success. An empty
  // result with no error would mean the write matched no membership — treat that as
  // a real failure, not a false success.
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    return { ok: false, reason: "not-a-member" };
  }

  // Every subject-defaulting surface reads the active space server-side, so
  // revalidate at the layout level to refresh the chip, board, and curriculum.
  revalidatePath("/", "layout");
  return { ok: true };
}
