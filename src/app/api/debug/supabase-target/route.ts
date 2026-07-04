import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';

// TEMPORARY DIAGNOSTIC — remove once the Supabase project mismatch is resolved.
// The deployed app's own service-role query returns only 3 subjects / 1000 rows while
// the Supabase SQL editor shows 7 / 6071 — i.e. the app is bound to a different (stale)
// project than where the uploads/SQL landed. This route reports, at RUNTIME, exactly
// which project the deployed app resolves to, so it can be compared against the expected
// project ref and across Preview vs Production. Non-secret only: the URL host and the
// project `ref` claim decoded from the key JWTs (never the keys/signatures themselves).
// Admin-only. GET /api/debug/supabase-target
export const dynamic = 'force-dynamic';

/** Project ref from a Supabase key JWT's payload (`ref` claim). Non-secret. Returns
 *  null for the newer non-JWT `sb_publishable_*` / `sb_secret_*` key formats. */
function jwtRef(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      ref?: unknown;
      role?: unknown;
    };
    return typeof payload.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
}

/** `<ref>.supabase.co` → `<ref>`; null if the URL is absent/malformed. */
function urlRef(url: string | undefined): { host: string | null; ref: string | null } {
  if (!url) return { host: null, ref: null };
  try {
    const host = new URL(url).host;
    return { host, ref: host.split('.')[0] || null };
  } catch {
    return { host: null, ref: null };
  }
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const publicUrl = urlRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonRef = jwtRef(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRef = jwtRef(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const refs = [publicUrl.ref, anonRef, serviceRef].filter(Boolean) as string[];
  const allAgree = refs.length > 0 && refs.every((r) => r === refs[0]);

  return NextResponse.json({
    ts: new Date().toISOString(),
    vercelEnv: process.env.VERCEL_ENV ?? null, // 'production' | 'preview' | 'development'
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    // The single URL the whole app resolves to (browser + SSR + service-role admin).
    nextPublicSupabaseUrlHost: publicUrl.host,
    projectRef: {
      fromUrl: publicUrl.ref,
      fromAnonKey: anonRef, // null if a non-JWT publishable key is in use
      fromServiceKey: serviceRef, // null if a non-JWT secret key is in use
      allAgree, // false ⇒ URL and keys point at different projects (split config)
    },
    serviceKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}
