import { AppShell } from '@/components/app-shell/AppShell';
import { PlaceholderScreen } from '@/components/app-shell/PlaceholderScreen';
import { getHeaderProfile } from '@/lib/profile';

// Rendered per-request so the shell reflects the live session.
export const dynamic = 'force-dynamic';

/**
 * Curriculum route — a placeholder stub. It's in the nav but not designed in this
 * pass; this keeps the shell and the Curriculum nav pill rendering and routing.
 */
export default async function CurriculumPage() {
  const { name, subtitle } = await getHeaderProfile();

  return (
    <AppShell name={name} subtitle={subtitle}>
      <PlaceholderScreen title="Curriculum">
        The Curriculum view isn&apos;t designed yet. It&apos;ll show the scheme of
        work behind each week&apos;s lessons here.
      </PlaceholderScreen>
    </AppShell>
  );
}
