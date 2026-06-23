import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from '@/lib/supabase/env';

/** Path prefixes reachable without authentication (the public auth surface). */
const PUBLIC_PREFIXES = ['/login', '/auth'];

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

  // Onboarding gate: an authenticated user with no subject_membership rows is
  // sent to /onboarding before any other app route; once they have a space, the
  // gate lets them through and /onboarding bounces back to the home grid. Only
  // evaluated for page navigations (see shouldEvaluateGate) and skipped on the
  // public auth surface, so it never loops or fires on data requests.
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
    const hasSpace = (count ?? 0) > 0;

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
