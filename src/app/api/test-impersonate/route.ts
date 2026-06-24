import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  STASH_COOKIE,
  getAllowedUids,
  impersonationEnabled,
  isTestRole,
  mintImpersonationAccessToken,
  roleToUid,
  stashCookieOptions,
  type ImpersonationStash,
} from '@/lib/test-impersonation';

/**
 * Dev/preview-only impersonation endpoint. POST a `{ role }` to view-as one of
 * the three pre-configured test users, or `{ action: 'return' }` to restore your
 * own account. SECURITY-SENSITIVE: it mints real Supabase sessions, so every
 * gate in `impersonationEnabled()` + the admin allowlist must hold or it refuses.
 *
 * The client only ever sends a role KEY; the server maps it to a UID from
 * server-only env. An arbitrary user id from the client is never honoured. The
 * JWT secret used to mint the target's token is server-only and never leaves the
 * server.
 *
 * Session mechanism (matches this repo's @supabase/ssr cookie setup):
 *   - mint: sign a Supabase-compatible HS256 access token for the target with
 *     the project's `SUPABASE_JWT_SECRET`, then write it via the cookie-bound
 *     `setSession({access_token, refresh_token})`. This has no dependency on the
 *     target having a confirmed email identity or an enabled email provider
 *     (the old magic-link/OTP flow did, which 500'd on the SQL-seeded users).
 *   - return: the real session's tokens are stashed (httpOnly) before the first
 *     swap and restored with `setSession`, then the stash is cleared.
 *
 * Failures return `{ ok: false, stage, message }` with an appropriate status so
 * the bar can show exactly which step failed and why. `message` is a short,
 * human-readable reason — NEVER the JWT secret, the signed token, the
 * service-role key, or cookie contents. Every failure is also logged via
 * `console.error('[test-impersonate]', stage, message)` (same redaction).
 */

/** The step that failed, surfaced to the caller and the logs. */
type Stage =
  | 'gate' // disabled / wrong env / not allowed in prod
  | 'auth' // no current session / caller not in allowlist
  | 'config' // a required env var is missing or empty
  | 'resolve_user' // role→UID map miss (the target user could not be resolved)
  | 'sign' // JWT signing threw
  | 'set_session' // establishing/writing the impersonated session failed
  | 'restore'; // restoring the stashed real session failed

/**
 * Build a non-leaking, stage-tagged error response and log it at Error level.
 * `message` must already be secret-free (a fixed string, an env var NAME, or an
 * `Error.message` from Supabase/jose — none of which carry the secret/token).
 */
function fail(stage: Stage, message: string, status: number) {
  console.error('[test-impersonate]', stage, message);
  return NextResponse.json({ ok: false, stage, message }, { status });
}

/** `Error.message` if it's an Error, else a stage-appropriate fallback. */
function reason(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export async function POST(request: NextRequest) {
  // Tracks the step in flight so the outer catch can tag unexpected throws.
  let stage: Stage = 'gate';
  try {
    // ── Gate ───────────────────────────────────────────────────────────────
    if (!impersonationEnabled()) {
      return fail('gate', 'impersonation is not enabled in this environment', 404);
    }

    // ── Auth: current session ────────────────────────────────────────────────
    stage = 'auth';
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return fail('auth', 'no current session', 401);
    }

    const cookieStore = await cookies();
    const stash = readStash(cookieStore.get(STASH_COOKIE)?.value);

    // The REAL signed-in admin must be on the allowlist. While already
    // impersonating, the real admin is the stashed identity, not the cookie user.
    const realUid = stash?.uid ?? user.id;
    if (!getAllowedUids().includes(realUid)) {
      return fail('auth', 'caller is not on the impersonation allowlist', 404);
    }

    const body = (await request.json().catch(() => null)) as
      | { role?: unknown; action?: unknown }
      | null;

    // ── Return to my account ────────────────────────────────────────────────
    if (body?.action === 'return') {
      stage = 'restore';
      if (!stash) {
        return NextResponse.json({ ok: true, impersonating: false });
      }
      // setSession restores the real session (and refreshes it if the stashed
      // access token has since expired), writing the auth cookies back.
      const { error } = await supabase.auth.setSession({
        access_token: stash.access_token,
        refresh_token: stash.refresh_token,
      });
      if (error) {
        return fail('restore', reason(error, 'failed to restore the real session'), 500);
      }
      cookieStore.delete(STASH_COOKIE);
      return NextResponse.json({ ok: true, impersonating: false });
    }

    // ── Switch role: resolve the target ──────────────────────────────────────
    stage = 'resolve_user';
    if (!isTestRole(body?.role)) {
      return fail('resolve_user', 'invalid or missing role', 400);
    }
    const role = body.role;
    // The target is one of exactly three server-configured UIDs.
    const targetUid = roleToUid(role);
    if (!targetUid) {
      return fail('resolve_user', `role "${role}" is not configured`, 400);
    }

    // ── Config: validate required env up-front (names only, never values) ─────
    stage = 'config';
    if (!process.env.SUPABASE_JWT_SECRET?.trim()) {
      return fail('config', 'SUPABASE_JWT_SECRET is not set', 500);
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
      return fail('config', 'NEXT_PUBLIC_SUPABASE_URL is not set', 500);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return fail('config', 'SUPABASE_SERVICE_ROLE_KEY is not set', 500);
    }

    // Stash the real session ONCE, before the first swap, so subsequent switches
    // (teacher → coordinator → …) don't overwrite it and "Return" still works.
    if (!stash) {
      stage = 'auth';
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        return fail('auth', 'no active session to stash', 401);
      }
      const toStash: ImpersonationStash = {
        uid: user.id,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      };
      cookieStore.set(STASH_COOKIE, JSON.stringify(toStash), stashCookieOptions());
    }

    // Best-effort email lookup to populate the token's email claim. This is
    // optional — `sub` is what RLS resolves on — so a failed/unavailable lookup
    // does NOT abort the mint; we just log it and sign without the email claim.
    stage = 'resolve_user';
    let targetEmail: string | undefined;
    try {
      const admin = createAdminClient();
      const { data: target } = await admin.auth.admin.getUserById(targetUid);
      targetEmail = target?.user?.email ?? undefined;
    } catch (err) {
      console.error('[test-impersonate]', 'resolve_user', reason(err, 'admin user lookup failed'));
    }

    // ── Sign the impersonated access token (server-only secret) ───────────────
    stage = 'sign';
    let accessToken: string;
    try {
      accessToken = await mintImpersonationAccessToken({ uid: targetUid, email: targetEmail });
    } catch (err) {
      return fail('sign', reason(err, 'failed to sign the impersonation token'), 500);
    }

    // ── Establish the impersonated session via the cookie-bound client ────────
    // Same setSession path the Return flow uses. The refresh_token is a
    // non-refreshable placeholder: a self-signed access token has no server-side
    // refresh record, so when it expires the tester just clicks a role again.
    stage = 'set_session';
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: 'impersonation-no-refresh',
    });
    if (sessionError) {
      return fail('set_session', reason(sessionError, 'failed to establish the session'), 500);
    }

    return NextResponse.json({ ok: true, impersonating: true, role });
  } catch (err) {
    // Unexpected throw — tag it with the step in flight; message is secret-free.
    return fail(stage, reason(err, 'unexpected error'), 500);
  }
}

function readStash(raw: string | undefined): ImpersonationStash | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationStash>;
    if (
      typeof parsed.uid === 'string' &&
      typeof parsed.access_token === 'string' &&
      typeof parsed.refresh_token === 'string'
    ) {
      return { uid: parsed.uid, access_token: parsed.access_token, refresh_token: parsed.refresh_token };
    }
    return null;
  } catch {
    return null;
  }
}
