import 'server-only';

import { cookies } from 'next/headers';
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

/** Shape stashed in {@link STASH_COOKIE}: the real user's id + session tokens. */
export interface ImpersonationStash {
  uid: string;
  access_token: string;
  refresh_token: string;
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
  const roleValue = cookieStore.get(IMPERSONATION_ROLE_COOKIE)?.value;
  return {
    active: true,
    impersonating,
    currentRole: impersonating && isTestRole(roleValue) ? roleValue : null,
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
