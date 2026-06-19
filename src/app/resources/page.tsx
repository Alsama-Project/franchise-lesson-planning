import { AppShell } from '@/components/app-shell/AppShell';
import { PlaceholderScreen } from '@/components/app-shell/PlaceholderScreen';
import { getHeaderProfile } from '@/lib/profile';

// Rendered per-request so the shell reflects the live session.
export const dynamic = 'force-dynamic';

/**
 * Resource Bank route. The full tag-driven browse + upload screen is out of scope
 * for this slice — for now it's a placeholder so the shell and the Resources nav
 * pill render and route correctly.
 */
export default async function ResourcesPage() {
  const { name, subtitle } = await getHeaderProfile();

  return (
    <AppShell name={name} subtitle={subtitle}>
      <PlaceholderScreen title="Resources">
        The Resource Bank — browse pre-approved resources by tag, and upload your
        own — is coming next. The data layer is already in place.
      </PlaceholderScreen>
    </AppShell>
  );
}
