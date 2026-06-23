import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { WeeklyOverview } from '@/components/weekly-overview/WeeklyOverview';
import { getWeeklyOverview } from '@/lib/weekly-overview';
import { getCreatableClasses } from '@/lib/create-lesson';
import { currentMonday, resolveWeekStart } from '@/lib/week';

// Rendered per-request so it reflects the live session and selected week.
export const dynamic = 'force-dynamic';

type SearchParams = { week?: string; view?: string };

/**
 * The authenticated home screen — the Weekly Overview inside the app shell. The
 * selected week and view are driven by URL search params (`?week=YYYY-MM-DD`,
 * `?view=calendar|status`) so the page is server-rendered and linkable. The
 * proxy redirects signed-out users to /login, so reaching here means a session.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { week, view: viewParam } = await searchParams;

  const weekStart = resolveWeekStart(week);
  const view = viewParam === 'status' ? 'status' : 'calendar';
  const thisMonday = currentMonday();

  // The week's plans and the creatable-class list (for the "+ Lesson" dialog) are
  // independent reads — fetch them together.
  const [data, groups] = await Promise.all([
    getWeeklyOverview(weekStart),
    getCreatableClasses(),
  ]);

  return (
    <AppShell name={data.teacherName} subtitle={data.context ?? undefined}>
      <WeeklyOverview data={data} view={view} thisMonday={thisMonday} groups={groups} />

      {/* Temporary dev aid: a quiet link to your auth uid, still needed to run
          the supabase/admin provisioning + sample-plan seed. Remove once
          provisioning moves into the app. */}
      <p className="mt-6 text-[12px] text-text-faint">
        Setup helper:{' '}
        <Link href="/whoami" className="underline underline-offset-2 hover:text-text-muted">
          view your user id
        </Link>
      </p>
    </AppShell>
  );
}
