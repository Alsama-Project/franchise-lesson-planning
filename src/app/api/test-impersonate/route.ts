import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  clearAuthCookies,
  clearStash,
  createSessionClient,
  getPersonaPassword,
  impersonationEnabled,
  isEligibleCaller,
  isStashedSessionResumable,
  readStash,
  writeSessionToAuthCookies,
  writeStash,
} from '@/lib/test-impersonation';
import { isToggleRole } from '@/lib/test-roles';

/**
 * Dev/preview-only impersonation endpoint. POST a `{ role: 'teacher' | 'coordinator' }`
 * to step into that role's fixed canonical persona, or `{ action: 'return' }` to
 * restore your own account. SECURITY-SENSITIVE: it establishes real Supabase
 * sessions, so the master switch (`impersonationEnabled()`) and the
 * caller-eligibility gate must hold or it refuses.
 *
 * The client only ever sends a toggle ROLE — never a uid or email. The server
 * resolves it through the security-definer RPC (`resolve_impersonation_persona`),
 * which re-applies the eligibility + anti-escalation gate (a non-admin caller
 * asking for `coordinator` gets NO ROW), and treats an empty result as a
 * caller-scope denial (403). The persona's uid, email, and the shared password
 * stay server-only and never leave the server (not in any response, log line, or
 * client bundle).
 *
 * Session mechanism (matches this repo's @supabase/ssr cookie setup):
 *   - switch: sign in as the persona with `signInWithPassword({email, password})`
 *     — email from the RPC, password from the server-only TEST_PERSONA_PASSWORD —
 *     on the cookie-bound anon client. Supabase issues a genuine, correctly-signed
 *     session and the client writes its auth cookies; RLS then resolves to that
 *     persona (so plans it creates/edits are owned by the persona, not the caller).
 *     We do NOT self-sign a token, and we do NOT mint sessions via the admin API.
 *   - return: the real session's tokens are stashed (httpOnly) before the first
 *     swap and restored by writing the auth cookies directly, then the stash is
 *     cleared. A valid stash is itself proof the session began from an eligible
 *     caller, so Return is authorized by the stash alone.
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
  | 'auth' // no current session / caller not eligible / sign-in failed
  | 'config' // a required env var is missing or empty
  | 'resolve_user' // invalid persona id / not permitted
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
    // Authorized by the STASH alone, never the current session: while
    // impersonating the cookie user is the persona, not the caller. The stash is
    // only ever written after the eligibility gate passed on the first switch, so
    // a VALID STASH is itself proof this session began from an eligible caller —
    // that is what authorizes the return. Re-checking eligibility here would
    // strand a tester whose eligibility comes from `can_impersonate` rather than
    // the env allowlist, so we deliberately do not.
    if (body?.action === 'return') {
      stage = 'restore';
      if (!stash) {
        return NextResponse.json({ ok: true, impersonating: false });
      }

      // If the stashed real session is still good, resume it by writing the auth
      // cookies directly — no setSession round-trip, so a refresh token that has
      // since been rotated/spent is never replayed (the cause of the prior
      // `refresh_token_already_used` 400).
      if (isStashedSessionResumable(stash.session)) {
        writeSessionToAuthCookies(cookieStore, stash.session);
        clearStash(cookieStore);
        return NextResponse.json({ ok: true, impersonating: false });
      }

      // The real session has since expired: there is nothing to safely resume.
      // Clear the impersonated session + stash and send the user through the
      // normal Entra login — a clean fallback, not an error.
      clearAuthCookies(cookieStore);
      clearStash(cookieStore);
      return NextResponse.json({ ok: true, impersonating: false, redirectTo: '/login' });
    }

    // ── Switch into a persona ─────────────────────────────────────────────────
    stage = 'auth';
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return fail('auth', 'no current session', 401);
    }
    // The real caller is the stashed identity when already impersonating, else the
    // current session. Resolve/validate the persona AS THE REAL CALLER: while
    // impersonating the live session is the persona, so use a client bound to the
    // stashed session; otherwise the current cookie session already is the caller.
    const realUid = stash?.uid ?? user.id;
    const privileged = stash ? createSessionClient(stash.session) : supabase;

    // Eligibility: can_impersonate OR real admin OR env-allowlist fallback.
    if (!(await isEligibleCaller(privileged, realUid))) {
      return fail('auth', 'caller is not eligible to impersonate', 404);
    }

    // ── Resolve the requested role → fixed persona (server-side, scope-enforced) ─
    // The client sends only a toggle role. `resolve_impersonation_persona` applies
    // the SAME eligibility + anti-escalation gate in the definer as the retired
    // picker RPC: a non-admin caller asking for `coordinator` gets NO ROW. An empty
    // result is therefore the caller-scope denial — surfaced here as a 403. This is
    // where caller-scope stays enforced server-side; the client id is never trusted.
    stage = 'resolve_user';
    const role = typeof body?.role === 'string' ? body.role : null;
    if (!role || !isToggleRole(role)) {
      return fail('resolve_user', 'missing or invalid role', 400);
    }
    const { data: resolved, error: resolveError } = await privileged.rpc(
      'resolve_impersonation_persona',
      { target_role: role },
    );
    if (resolveError) {
      return fail('resolve_user', reason(resolveError, 'failed to resolve persona'), 500);
    }
    const target = (Array.isArray(resolved) ? resolved[0] : null) as
      | { persona_id?: string; email?: string }
      | null;
    if (!target?.persona_id || !target?.email) {
      // No row = ineligible caller or out-of-scope role (e.g. a non-admin asking
      // for `coordinator`). This is the server-side caller-scope denial.
      return fail('resolve_user', 'role not permitted for this caller', 403);
    }

    // ── Config: the shared persona password (server-only, never a value) ──────
    stage = 'config';
    const password = getPersonaPassword();
    if (!password) {
      return fail('config', 'TEST_PERSONA_PASSWORD is not set', 500);
    }

    // Stash the real session ONCE, before the first swap, so subsequent switches
    // (persona → persona → …) don't overwrite it and "Return" still works.
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

    // ── Establish the impersonated session by signing in as the persona ───────
    // The cookie-bound anon client logs in with the persona's email + the shared
    // server-only password; Supabase issues a genuine, correctly-signed session
    // and writes its auth cookies, so RLS resolves to the persona on subsequent
    // requests. No token is self-signed and no password is ever returned or logged.
    stage = 'auth';
    // Diagnostic (secret-free): whether the anon client's envs are present. A
    // missing URL/key here is the likeliest cause of an empty/opaque sign-in error
    // (the request never reaches GoTrue). The persona email/password are omitted.
    console.error(
      '[test-impersonate] sign-in attempt',
      JSON.stringify({
        role,
        hasAnonUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
        hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      }),
    );
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: target.email,
      password,
    });
    if (signInError) {
      return fail('auth', reason(signInError, 'failed to sign in as the persona'), 401);
    }

    // Echo only the role back — never the resolved persona uid or email.
    return NextResponse.json({ ok: true, impersonating: true, role });
  } catch (err) {
    // Unexpected throw — tag it with the step in flight; message is secret-free.
    return fail(stage, reason(err, 'unexpected error'), 500);
  }
}
