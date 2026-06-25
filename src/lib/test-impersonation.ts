import 'server-only';

import { cookies } from 'next/headers';
import {
  DEFAULT_COOKIE_OPTIONS,
  combineChunks,
  createChunks,
  isChunkLike,
  stringToBase64URL,
} from '@supabase/ssr';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isTestRole, type TestRole } from '@/lib/test-roles';

export { TEST_ROLES, isTestRole, type TestRole } from '@/lib/test-roles';

/**
 * Dev/preview-only test-user impersonation — gates, the role→credentials map, and
 * the server-side "should the bar render?" check. Shared by the impersonate route
 * (`src/app/api/test-impersonate/route.ts`) and the authed shell.
 *
 * This is SECURITY-SENSITIVE: passing the gates lets a real admin sign in as one
 * of three pre-configured test users so they can see each role's true, RLS-scoped
 * UX. The session is a genuine, Supabase-issued one (the route logs in with the
 * test user's email+password); we never self-sign a token. Every gate below must
 * hold; none is optional.
 *
 * `server-only` guarantees this module can never be bundled for the browser, so
 * the env that maps roles to real credentials never leaks. No NEXT_PUBLIC_* here.
 */

/** httpOnly cookie holding the real admin's stashed session (for "Return"). */
export const STASH_COOKIE = 'test-impersonation-stash';

/**
 * httpOnly cookie recording which role is currently being viewed. With genuine
 * sign-in there is no self-minted token to read a role off of, so the route
 * records it here on each switch and clears it on "Return"; the shell reads it to
 * label the bar.
 */
export const IMPERSONATION_ROLE_COOKIE = 'test-impersonation-role';

/**
 * Shape stashed in {@link STASH_COOKIE}: the real user's id + their ENTIRE
 * Supabase session (access + refresh + expiry + user). We stash the whole
 * session so "Return" can resume it by writing the auth cookies directly — with
 * no `setSession` round-trip that would re-validate or rotate a refresh token
 * that may already have been spent by the time the user returns.
 */
export interface ImpersonationStash {
  uid: string;
  session: Session;
}

/** next/headers cookie store (writable inside Route Handlers). */
type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * The cookie name `@supabase/ssr` stores the session under. supabase-js derives
 * the default storage key from the project URL as `sb-<ref>-auth-token`; we
 * mirror that here so a direct write lands where the SSR client will read it.
 */
export function authTokenCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL; cannot derive the auth cookie name.');
  }
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

/**
 * Whether a stashed session's access token is still good enough to resume
 * without a refresh. `expires_at` is in seconds; a small skew avoids handing
 * back a token that is about to expire. A missing/absent expiry is treated as
 * unusable (force the clean login fallback rather than a guess).
 */
export function isStashedSessionResumable(session: Session): boolean {
  if (!session?.access_token || !session?.refresh_token) return false;
  const expiresAt = session.expires_at;
  if (typeof expiresAt !== 'number') return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt > nowSeconds + 10;
}

/**
 * Write a real session back into the SSR auth cookie(s) directly, in exactly the
 * format `@supabase/ssr` reads (base64url-prefixed value, chunked under the
 * storage key). No server round-trip, so a possibly-rotated refresh token is
 * never replayed. Any stale chunks from the prior (impersonated) session are
 * removed first.
 */
export function writeSessionToAuthCookies(cookieStore: CookieStore, session: Session): void {
  const key = authTokenCookieName();
  const encoded = `base64-${stringToBase64URL(JSON.stringify(session))}`;
  const chunks = createChunks(key, encoded);
  const nextNames = new Set(chunks.map((c) => c.name));

  // Drop any existing chunk cookies for this key that the new write won't cover.
  for (const { name } of cookieStore.getAll()) {
    if (isChunkLike(name, key) && !nextNames.has(name)) {
      cookieStore.delete(name);
    }
  }
  for (const { name, value } of chunks) {
    cookieStore.set(name, value, { ...DEFAULT_COOKIE_OPTIONS });
  }
}

/** Remove every auth-token chunk cookie — used when there is no resumable session. */
export function clearAuthCookies(cookieStore: CookieStore): void {
  const key = authTokenCookieName();
  for (const { name } of cookieStore.getAll()) {
    if (isChunkLike(name, key)) cookieStore.delete(name);
  }
}

/** Map each role key to the env vars holding its sign-in credentials. */
const ROLE_CREDENTIALS_ENV: Record<TestRole, { email: string; password: string }> = {
  teacher: { email: 'TEST_USER_TEACHER_EMAIL', password: 'TEST_USER_TEACHER_PASSWORD' },
  coordinator: { email: 'TEST_USER_COORDINATOR_EMAIL', password: 'TEST_USER_COORDINATOR_PASSWORD' },
  admin: { email: 'TEST_USER_ADMIN_EMAIL', password: 'TEST_USER_ADMIN_PASSWORD' },
};

/**
 * The master switch. The bar renders and the route acts ONLY when the explicit
 * `ENABLE_TEST_IMPERSONATION` flag is set. Absence of the flag is off.
 *
 * Production is refused by default: when `VERCEL_ENV === 'production'` the bar is
 * permitted ONLY if the separate, explicit `ALLOW_IMPERSONATION_IN_PRODUCTION`
 * flag is also `'true'`. This second flag exists so enabling impersonation in
 * production is a deliberate, easily-removable opt-in (testers-only deployment)
 * rather than a silent deletion of the guard — leave it unset for real users.
 * Outside production this flag is irrelevant; the master switch is all that's
 * needed.
 */
export function impersonationEnabled(): boolean {
  if (process.env.ENABLE_TEST_IMPERSONATION !== 'true') return false;
  if (
    process.env.VERCEL_ENV === 'production' &&
    process.env.ALLOW_IMPERSONATION_IN_PRODUCTION !== 'true'
  ) {
    return false;
  }
  return true;
}

/** Real-admin allowlist from `TEST_IMPERSONATION_ALLOWED_UIDS` (comma-separated). */
export function getAllowedUids(): string[] {
  return (process.env.TEST_IMPERSONATION_ALLOWED_UIDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve a role's sign-in credentials from server-only env. Returns the
 * credentials, or the NAME of the first missing/empty var (never a value) so the
 * caller can report `stage:'config'` without leaking a secret.
 */
export function roleToCredentials(
  role: TestRole,
): { ok: true; email: string; password: string } | { ok: false; missingVar: string } {
  const vars = ROLE_CREDENTIALS_ENV[role];
  const email = process.env[vars.email]?.trim();
  if (!email) return { ok: false, missingVar: vars.email };
  // Do NOT trim the password — a credential is taken verbatim.
  const password = process.env[vars.password];
  if (!password) return { ok: false, missingVar: vars.password };
  return { ok: true, email, password };
}

/** Cookie options for the stash — server-set, httpOnly, never readable by JS. */
export function stashCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Long enough for a testing session; "Return" clears it explicitly.
    maxAge: 60 * 60 * 8,
  };
}

/**
 * Persist the stash, CHUNKED, under {@link STASH_COOKIE}. The stash holds the
 * whole real session (incl. the Azure user object), which routinely exceeds the
 * ~4KB single-cookie limit — an oversized cookie is silently dropped by the
 * browser, which is what made the stash vanish mid-impersonation (bar gone, and
 * Return seeing only the test user). Chunking mirrors how `@supabase/ssr` stores
 * the auth cookie. Stale chunks from a prior stash are removed first.
 */
export function writeStash(cookieStore: CookieStore, stash: ImpersonationStash): void {
  const chunks = createChunks(STASH_COOKIE, JSON.stringify(stash));
  const nextNames = new Set(chunks.map((c) => c.name));
  for (const { name } of cookieStore.getAll()) {
    if (isChunkLike(name, STASH_COOKIE) && !nextNames.has(name)) cookieStore.delete(name);
  }
  for (const { name, value } of chunks) cookieStore.set(name, value, stashCookieOptions());
}

/** Read + reassemble the (possibly chunked) stash, validating its shape. */
export async function readStash(cookieStore: CookieStore): Promise<ImpersonationStash | null> {
  const raw = await combineChunks(STASH_COOKIE, (name) => cookieStore.get(name)?.value ?? null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationStash>;
    const session = parsed.session;
    if (
      typeof parsed.uid === 'string' &&
      session &&
      typeof session.access_token === 'string' &&
      typeof session.refresh_token === 'string'
    ) {
      return { uid: parsed.uid, session };
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove every stash chunk cookie. */
export function clearStash(cookieStore: CookieStore): void {
  for (const { name } of cookieStore.getAll()) {
    if (isChunkLike(name, STASH_COOKIE)) cookieStore.delete(name);
  }
}

export interface ImpersonationState {
  /** Whether the bar should render at all (all non-target gates passed). */
  active: boolean;
  /** Whether a real session is currently stashed (i.e. we are viewing-as). */
  impersonating: boolean;
  /** The role currently being viewed, when impersonating. */
  currentRole: TestRole | null;
}

const INACTIVE: ImpersonationState = {
  active: false,
  impersonating: false,
  currentRole: null,
};

/**
 * Server-side decision for the authed shell: should the test bar render, and if
 * so, whose role is being viewed? The real-admin identity — not the current
 * session — decides this, so the bar stays visible THROUGHOUT impersonation
 * (otherwise the only in-app way back disappears):
 *   - if a valid stash from an allowlisted admin exists, we are impersonating and
 *     the bar renders regardless of the (test-user) session's state;
 *   - otherwise the bar renders only when the current session IS an allowlisted
 *     admin (so they can start impersonating).
 */
export async function getImpersonationState(): Promise<ImpersonationState> {
  if (!impersonationEnabled()) return INACTIVE;

  const cookieStore = await cookies();
  const stash = await readStash(cookieStore);

  // Impersonating: authorize from the stashed real admin, not the cookie user.
  if (stash && getAllowedUids().includes(stash.uid)) {
    const roleValue = cookieStore.get(IMPERSONATION_ROLE_COOKIE)?.value;
    return {
      active: true,
      impersonating: true,
      currentRole: isTestRole(roleValue) ? roleValue : null,
    };
  }

  // Not impersonating: the bar shows only for an allowlisted real admin session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !getAllowedUids().includes(user.id)) return INACTIVE;

  return { active: true, impersonating: false, currentRole: null };
}
