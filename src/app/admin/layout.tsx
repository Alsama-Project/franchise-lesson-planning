import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth';

// Admin is org-wide and per-request; never cache the gate.
export const dynamic = 'force-dynamic';

/**
 * Gate for the `/admin` route group. `requireAdmin` redirects non-admins (and the
 * signed-out) to `/`, so every page under `/admin` is admin-only. The proxy
 * already guarantees an authenticated session before this runs.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
