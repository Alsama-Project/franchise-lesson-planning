import 'server-only';

import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import { createClient } from '@/lib/supabase/server';
import { TEST_ROLES, type TestRole } from '@/lib/test-roles';

export { TEST_ROLES, isTestRole, type TestRole } from '@/lib/test-roles';

/**
 * Dev/preview-only test-user impersonation — gates, the role→UID map, and the
 * server-side "should the bar render?" check. Shared by the impersonate route
 * (`src/app/api/test-impersonate/route.ts`) and the authed shell.
 *
 * This is SECURITY-SENSITIVE: passing the gates lets a real admin mint a real
 * Supabase session for one of three pre-configured users so they can see each
 * role's true, RLS-scoped UX. Every gate below must hold; none is optional.
 *
 * `server-only` guarantees this module can never be bundled for the browser, so
 * the env that maps roles to real UIDs never leaks. No NEXT_PUBLIC_* here.
 */

/** httpOnly cookie holding the real admin's stashed session (for "Return"). */
export const STASH_COOKIE = 'test-impersonation-stash';

/** Shape stashed in {@link STASH_COOKIE}: the real user's id + session tokens. */
export interface ImpersonationStash {
  uid: string;
  access_token: string;
  refresh_token: string;
}

/** Map each role key to the env var holding its pre-configured target UID. */
const ROLE_UID_ENV: Record<TestRole, string> = {
  teacher: 'TEST_USER_TEACHER_ID',
  coordinator: 'TEST_USER_COORDINATOR_ID',
  admin: 'TEST_USER_ADMIN_ID',
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

/** Resolve a role key to its pre-configured target UID, or null if unconfigured. */
export function roleToUid(role: TestRole): string | null {
  const value = process.env[ROLE_UID_ENV[role]];
  return value && value.trim() ? value.trim() : null;
}

/** Reverse the map: which role key (if any) a UID corresponds to. */
export function uidToRole(uid: string): TestRole | null {
  for (const role of TEST_ROLES) {
    if (roleToUid(role) === uid) return role;
  }
  return null;
}

/** How long a minted impersonation token is valid: 8h, so testers aren't bounced mid-session. */
const IMPERSONATION_TOKEN_TTL_SECONDS = 60 * 60 * 8;

/**
 * Mint a Supabase-compatible HS256 access token for the target test user, signed
 * with the project's server-only `SUPABASE_JWT_SECRET`. This replaces the old
 * magic-link/OTP mint: it has no dependency on the target having a confirmed
 * email identity or on the email provider being enabled — GoTrue accepts any JWT
 * it can verify with its own secret, resolving `auth.uid()`/RLS to `sub`.
 *
 * The token is intentionally NOT refreshable (a self-signed access token has no
 * server-side refresh record). That is fine for a testing tool: when it expires
 * after {@link IMPERSONATION_TOKEN_TTL_SECONDS} the tester just clicks a role
 * again. The secret is read here, in this `server-only` module, and never leaves
 * the server.
 */
export async function mintImpersonationAccessToken(params: {
  uid: string;
  email?: string;
}): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error('Missing SUPABASE_JWT_SECRET (server-only); cannot mint impersonation token.');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL; cannot derive auth issuer.');
  }

  const issuer = `${url.replace(/\/+$/, '')}/auth/v1`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expSeconds = nowSeconds + IMPERSONATION_TOKEN_TTL_SECONDS;

  return new SignJWT({
    role: 'authenticated',
    ...(params.email ? { email: params.email } : {}),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(params.uid)
    .setAudience('authenticated')
    .setIssuer(issuer)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(expSeconds)
    .sign(new TextEncoder().encode(secret));
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
 * so, whose role is being viewed? Mirrors the route's gates so the bar never
 * appears for anyone who could not actually use it:
 *   - the feature is enabled and non-production, and
 *   - the REAL signed-in user (the stashed identity when already impersonating,
 *     otherwise the current session) is on the admin allowlist.
 */
export async function getImpersonationState(): Promise<ImpersonationState> {
  if (!impersonationEnabled()) return INACTIVE;

  const cookieStore = await cookies();
  const stashUid = readStashUid(cookieStore.get(STASH_COOKIE)?.value);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return INACTIVE;

  // While impersonating, the cookie user is the target; the real admin is the
  // stashed identity. Gate on the real admin either way.
  const realUid = stashUid ?? user.id;
  if (!getAllowedUids().includes(realUid)) return INACTIVE;

  const impersonating = stashUid !== null;
  return {
    active: true,
    impersonating,
    currentRole: impersonating ? uidToRole(user.id) : null,
  };
}

function readStashUid(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationStash>;
    return typeof parsed.uid === 'string' ? parsed.uid : null;
  } catch {
    return null;
  }
}
