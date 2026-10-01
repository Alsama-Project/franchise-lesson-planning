import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/sign-in-policy";

/**
 * OAuth callback. Microsoft redirects here with a `code`; we exchange it for a
 * session via the @supabase/ssr server client (PKCE — it reads the verifier
 * cookie set when the flow started), then land the user on the authed shell.
 *
 * Public route (see src/lib/supabase/proxy.ts). On any failure we send the user
 * back to /login rather than into a protected page with no session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only honour same-origin relative paths to avoid an open-redirect.
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // Safety net: the handle_new_user trigger creates the profiles row on first
  // sign-in, but if full_name didn't make it (older row, missing claim), backfill
  // it from the signed-in identity. RLS lets a user update only their own row.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Second line behind the Microsoft tenant pinning (Supabase dashboard): when
  // ALLOWED_EMAIL_DOMAINS is set, refuse any other account and say why.
  if (user && !isAllowedEmail(user.email, process.env.ALLOWED_EMAIL_DOMAINS)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  if (user) {
    const identityName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null;

    if (identityName) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && !profile.full_name) {
        await supabase
          .from("profiles")
          .update({ full_name: identityName })
          .eq("id", user.id);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
