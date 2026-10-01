// Who may sign in, beyond the Microsoft tenant pinning set in the Supabase dashboard.
// Pure, so it is unit-tested directly (src/lib/__tests__/sign-in-policy.test.ts).

/**
 * True when `email` is allowed by ALLOWED_EMAIL_DOMAINS (comma-separated, e.g.
 * "alsama.org,alsama-project.org"). When the list is unset or empty, this check
 * allows everyone — pinning Microsoft sign-in to Alsama's tenant is the main control;
 * this is a second line behind it.
 */
export function isAllowedEmail(email: string | null | undefined, allowedDomains: string | undefined): boolean {
  const domains = (allowedDomains ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return true;
  const domain = email?.split('@')[1]?.toLowerCase();
  return !!domain && domains.includes(domain);
}

/** The `login.error.*` message for a `?error=` code the auth callback sends back. */
export function signInErrorKey(code: string | undefined): 'notAllowed' | 'failed' | null {
  if (!code) return null;
  return code === 'not_allowed' ? 'notAllowed' : 'failed';
}
