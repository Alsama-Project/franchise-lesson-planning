// Global roles, and the rule for trusting a stored admin role. Kept free of Next.js /
// Supabase imports so it is unit-tested directly.

/** Global role on `profiles.role`. Coordinator-ness now lives in coordinator_subject. */
export type AppRole = 'teacher' | 'coordinator' | 'admin';

/**
 * A stored `admin` role only counts while the database's `is_admin()` agrees. That
 * check also returns false for a deactivated account, so switching an admin off takes
 * effect on their next request instead of when their session runs out.
 */
export function effectiveRole(stored: AppRole, dbIsAdmin: boolean): AppRole {
  return stored === 'admin' && !dbIsAdmin ? 'teacher' : stored;
}
