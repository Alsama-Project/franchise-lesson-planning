import { AppShell } from '@/components/app-shell/AppShell';
import { getHeaderProfile } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/**
 * Minimal `/admin` placeholder inside the shared shell. The admin console
 * (org structure + membership management) is a separate, design-first slice —
 * this is just the gated landing so the route exists and the nav link resolves.
 */
export default async function AdminPage() {
  const { name, subtitle } = await getHeaderProfile();

  return (
    <AppShell name={name} subtitle={subtitle}>
      <div className="mx-auto max-w-[680px] py-10">
        <h1 className="text-[22px] font-semibold text-neutral-900">Admin</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-neutral-600">
          Organisation administration. Managing centres, subjects, and the people
          in each shared space lives here — the console is a separate slice and is
          coming next.
        </p>
        <p className="mt-2 text-[13px] text-text-faint">
          You can see this page because your account has the <code>admin</code> role.
        </p>
      </div>
    </AppShell>
  );
}
