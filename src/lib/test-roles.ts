/**
 * Client-safe role keys for the test-user impersonation toggle. These are just
 * the two public toggle roles (no UIDs, no emails, no env, no secrets), so this
 * module is safe to import from the browser bar component. The server-only gates
 * and the role→persona resolution live in the DB (`resolve_impersonation_persona`,
 * migration 0039) and `@/lib/test-impersonation`.
 */

/** The two toggle roles. The client only ever sends one of these on switch. */
export const TOGGLE_ROLES = ['teacher', 'coordinator'] as const;
export type ToggleRole = (typeof TOGGLE_ROLES)[number];

export function isToggleRole(value: unknown): value is ToggleRole {
  return typeof value === 'string' && (TOGGLE_ROLES as readonly string[]).includes(value);
}
