import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  IMPERSONATION_ROLE_COOKIE,
  STASH_COOKIE,
  getAllowedUids,
  impersonationEnabled,
  isTestRole,
  roleToCredentials,
  stashCookieOptions,
  type ImpersonationStash,
} from '@/lib/test-impersonation';

/**
 * Dev/preview-only impersonation endpoint. POST a `{ role }` to view-as one of
 * the three pre-configured test users, or `{ action: 'return' }` to restore your
 * own account. SECURITY-SENSITIVE: it establishes real Supabase sessions, so
 * every gate in `impersonationEnabled()` + the admin allowlist must hold or it
 * refuses.
 *
 * The client only ever sends a role KEY; the server maps it to that role's
 * credentials from server-only env. An arbitrary user id or credential from the
 * client is never honoured. The test passwords are server-only and never leave
 * the server (not in any response, log line, or client bundle).
 *
 * Session mechanism (matches this repo's @supabase/ssr cookie setup):
 *   - switch: sign in as the test user with `signInWithPassword({email, password})`
 *     on the cookie-bound anon client. Supabase issues a genuine, correctly-signed
 *     session and the client writes its auth cookies; RLS then resolves to that
 *     user. We do NOT self-sign a token (the project signs with ECC/ES256, which
 *     we cannot reproduce — self-signed HS256 tokens are rejected as `bad_jwt`).
 *   - return: the real session's tokens are stashed (httpOnly) before the first
 *     swap and restored with `setSession`, then the stash is cleared. The real
 *     session's tokens are genuine, so restoration works.
 *
 * Failures return `{ ok: false, stage, message }` with an appropriate status so
 * the bar can show exactly which step failed and why. `message` is a short,
 * human-readable reason — NEVER a password, the service-role key, or cookie
 * contents (the Supabase auth error TEXT is safe and is surfaced). Every failure
 * is also logged via `console.error('[test-impersonate]', stage, message)`.
 */

/** The step that failed, surfaced to the caller and the logs. */
type Stage =
  | 'gate' // disabled / wrong env / not allowed in prod
  | 'auth' // no current session / caller not in allowlist / sign-in failed
  | 'config' // a required env var is missing or empty
  | 'resolve_user' // invalid or missing role
  | 'restore'; // restoring the stashed real session failed

/**
 * Build a non-leaking, stage-tagged error response and log it at Error level.
 * `message` must already be secret-free (a fixed string, an env var NAME, or an
 * `Error.message` from Supabase — none of which carry a password/secret).
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
      cookieStore.delete(IMPERSONATION_ROLE_COOKIE);
      return NextResponse.json({ ok: true, impersonating: false });
    }

    // ── Switch role: validate the requested role ─────────────────────────────
    stage = 'resolve_user';
    if (!isTestRole(body?.role)) {
      return fail('resolve_user', 'invalid or missing role', 400);
    }
    const role = body.role;

    // ── Config: resolve this role's credentials (names only, never values) ────
    stage = 'config';
    const creds = roleToCredentials(role);
    if (!creds.ok) {
      return fail('config', `${creds.missingVar} is not set`, 500);
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

    // ── Establish the impersonated session by signing in as the test user ─────
    // The cookie-bound anon client logs in with the test user's email+password;
    // Supabase issues a genuine, correctly-signed session and writes its auth
    // cookies, so RLS resolves to that user on subsequent requests. No token is
    // self-signed and no password is ever returned or logged.
    stage = 'auth';
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });
    if (signInError) {
      return fail('auth', reason(signInError, 'failed to sign in as the test user'), 401);
    }

    // Record which role is now being viewed so the shell can label the bar.
    cookieStore.set(IMPERSONATION_ROLE_COOKIE, role, stashCookieOptions());

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
