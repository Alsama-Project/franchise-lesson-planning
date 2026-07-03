import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from '@/lib/supabase/env';

/** Path prefixes reachable without authentication (the public auth surface).
 * `/access-removed` is the front-door block for a deactivated user: it must be
 * reachable while still holding a (soon-to-be-revoked) session AND after the
 * self-sign-out completes, and it must be exempt from the deactivation redirect
 * itself, so it lives on the public surface. */
const PUBLIC_PREFIXES = ['/login', '/auth', '/access-removed'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Whether the onboarding gate should evaluate for this request. Only top-level
 * page navigations (GET, non-API) are gated: redirecting an API call or a
 * server-action POST (e.g. autosave) to /onboarding would be wrong, and adding a
 * membership round-trip to those hot paths is needless. Assets are already
 * excluded by the matcher in `proxy.ts`.
 */
function shouldEvaluateGate(request: NextRequest): boolean {
  if (request.method !== 'GET') return false;
  return !request.nextUrl.pathname.startsWith('/api');
}

/**
 * Refresh the Supabase session on every request and protect all routes except
 * the public auth surface. Unauthenticated users hitting a protected route are
 * redirected to /login. Called from the root `proxy.ts` (Next 16's renamed
 * "middleware" convention).
 *
 * IMPORTANT: the response object returned here carries the refreshed auth
 * cookies; do not construct a separate response or the session will be dropped.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not run code between createServerClient and getUser() — it refreshes the
  // session and a gap here can cause hard-to-debug random sign-outs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  // Deactivation front-door block: a deactivated user is bounced to
  // /access-removed (which shows the "access removed" state and signs them out)
  // before anything else — ahead of the onboarding gate, since a deactivated
  // user's memberships are hidden by the helper predicate and would otherwise
  // misroute them to /onboarding. Only page navigations are checked (see
  // shouldEvaluateGate). `is_deactivated()` is a definer RPC keyed on auth.uid().
  // Fail-open: if the check errors we let the request through (the DB helpers +
  // self-provision guard still deny any real access), never trapping the user.
  if (user && shouldEvaluateGate(request) && !isPublicPath(request.nextUrl.pathname)) {
    const { data: deactivated } = await supabase.rpc('is_deactivated');
    if (deactivated === true) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/access-removed';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Onboarding gate: an authenticated user with no active space is sent to
  // /onboarding before any other app route; once they have a space, the gate lets
  // them through and /onboarding bounces back to the home grid. Only evaluated for
  // page navigations (see shouldEvaluateGate) and skipped on the public auth
  // surface, so it never loops or fires on data requests.
  if (user && shouldEvaluateGate(request) && !isPublicPath(request.nextUrl.pathname)) {
    const { pathname } = request.nextUrl;
    const onOnboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding/');

    const { count, error } = await supabase
      .from('subject_membership')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id);

    // If the membership read fails for any reason, don't trap the user behind the
    // gate — let the request through and let the page handle it.
    if (error) return supabaseResponse;
    let hasSpace = (count ?? 0) > 0;

    // An approved coordinator holds only a `coordinator_subject` row (school-
    // agnostic; no subject_membership), so counting memberships alone would loop
    // them back to /onboarding. Treat "has an active space" as membership OR
    // coordinator_subject. Checked ONLY when there's no membership, so the common
    // teacher path adds no round-trip. A pending coordinator has neither and
    // correctly stays on /onboarding (where the page shows the pending screen).
    if (!hasSpace) {
      const { count: coordCount, error: coordError } = await supabase
        .from('coordinator_subject')
        .select('profile_id', { count: 'exact', head: true })
        .eq('profile_id', user.id);
      if (coordError) return supabaseResponse; // fail-open, same as above
      if ((coordCount ?? 0) > 0) hasSpace = true;
    }

    // Admins are org-wide and hold no subject_membership by design, so the
    // membership count alone would misroute them into the (teacher) onboarding
    // flow — the exact failure hit when stepping into the admin test persona,
    // which has no membership. Treat an admin as gate-satisfied: they route into
    // the app and, like any onboarded user, get bounced off /onboarding back to
    // the home grid below. `is_admin()` is a definer RPC keyed on auth.uid();
    // checked ONLY when there's no space, so the common has-space path adds no
    // round-trip. Fail-open: an errored/absent result leaves hasSpace unchanged.
    if (!hasSpace) {
      const { data: isAdmin } = await supabase.rpc('is_admin');
      if (isAdmin === true) hasSpace = true;
    }

    if (!hasSpace && !onOnboarding) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/onboarding';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
    if (hasSpace && onOnboarding) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
