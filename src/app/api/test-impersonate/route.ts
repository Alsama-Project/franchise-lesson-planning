import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  IMPERSONATION_ROLE_COOKIE,
  clearAuthCookies,
  clearStash,
  getAllowedUids,
  impersonationEnabled,
  isStashedSessionResumable,
  isTestRole,
  readStash,
  roleToCredentials,
  stashCookieOptions,
  writeSessionToAuthCookies,
  writeStash,
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

/**
 * Render an unknown error as a secret-free, human-readable string. Supabase
 * `AuthError`s carry `status`/`code` and sometimes an opaque `message` (e.g. the
 * literal `"{}"` when GoTrue returns an empty body — i.e. the call failed before
 * a real API response). Pull name/status/code alongside the message so the
 * surfaced reason is never just `"{}"` or `"[object Object]"`. None of these
 * fields carry a password or secret.
 */
function reason(err: unknown, fallback: string): string {
  if (err == null) return fallback;
  if (typeof err === 'string') return err.trim() || fallback;
  if (typeof err === 'object') {
    const e = err as { name?: unknown; message?: unknown; status?: unknown; code?: unknown };
    const parts: string[] = [];
    if (typeof e.name === 'string' && e.name) parts.push(e.name);
    const meta: string[] = [];
    if (e.status != null && e.status !== '') meta.push(`status ${String(e.status)}`);
    if (typeof e.code === 'string' && e.code) meta.push(`code ${e.code}`);
    if (meta.length) parts.push(`[${meta.join(', ')}]`);
    const msg = typeof e.message === 'string' ? e.message.trim() : '';
    if (msg && msg !== '{}') parts.push(msg);
    return parts.join(' ').trim() || fallback;
  }
  return String(err).trim() || fallback;
}

export async function POST(request: NextRequest) {
  // Tracks the step in flight so the outer catch can tag unexpected throws.
  let stage: Stage = 'gate';
  try {
    // ── Gate ───────────────────────────────────────────────────────────────
    if (!impersonationEnabled()) {
      return fail('gate', 'impersonation is not enabled in this environment', 404);
    }

    const cookieStore = await cookies();
    const stash = await readStash(cookieStore);

    const body = (await request.json().catch(() => null)) as
      | { role?: unknown; action?: unknown }
      | null;

    // ── Return to my account ────────────────────────────────────────────────
    // Authorized from the STASH alone, never the current session: while
    // impersonating, the cookie user is the test user (not on the allowlist). The
    // stash is only ever written after an allowlisted admin passed the gate on
    // switch, so a valid stash from an allowlisted admin IS proof this session
    // began as that admin — that is what authorizes the return.
    if (body?.action === 'return') {
      stage = 'restore';
      if (!stash) {
        return NextResponse.json({ ok: true, impersonating: false });
      }
      if (!getAllowedUids().includes(stash.uid)) {
        return fail('auth', 'caller is not on the impersonation allowlist', 404);
      }

      // If the stashed real session is still good, resume it by writing the auth
      // cookies directly — no setSession round-trip, so a refresh token that has
      // since been rotated/spent is never replayed (the cause of the prior
      // `refresh_token_already_used` 400).
      if (isStashedSessionResumable(stash.session)) {
        writeSessionToAuthCookies(cookieStore, stash.session);
        clearStash(cookieStore);
        cookieStore.delete(IMPERSONATION_ROLE_COOKIE);
        return NextResponse.json({ ok: true, impersonating: false });
      }

      // The real session has since expired: there is nothing to safely resume.
      // Clear the impersonated session + stash and send the user through the
      // normal Entra login — a clean fallback, not an error.
      clearAuthCookies(cookieStore);
      clearStash(cookieStore);
      cookieStore.delete(IMPERSONATION_ROLE_COOKIE);
      return NextResponse.json({ ok: true, impersonating: false, redirectTo: '/login' });
    }

    // ── Switch into a role: requires the current REAL admin session ──────────
    stage = 'auth';
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return fail('auth', 'no current session', 401);
    }
    // The real admin is the stashed identity when already impersonating, else the
    // current session.
    const realUid = stash?.uid ?? user.id;
    if (!getAllowedUids().includes(realUid)) {
      return fail('auth', 'caller is not on the impersonation allowlist', 404);
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
      // Stash the WHOLE session (incl. expiry + user), CHUNKED, so Return can
      // resume it by writing cookies directly, with no refresh-token replay.
      writeStash(cookieStore, { uid: user.id, session });
    }

    // ── Establish the impersonated session by signing in as the test user ─────
    // The cookie-bound anon client logs in with the test user's email+password;
    // Supabase issues a genuine, correctly-signed session and writes its auth
    // cookies, so RLS resolves to that user on subsequent requests. No token is
    // self-signed and no password is ever returned or logged.
    stage = 'auth';
    // Diagnostic (secret-free): the resolved email + whether the anon client's
    // envs are present. A missing URL/key here is the likeliest cause of an
    // empty/opaque sign-in error (the request never reaches GoTrue).
    console.error(
      '[test-impersonate] sign-in attempt',
      JSON.stringify({
        role,
        email: creds.email,
        hasAnonUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
        hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      }),
    );
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
