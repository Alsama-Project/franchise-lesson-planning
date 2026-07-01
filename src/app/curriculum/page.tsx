import { AppShell } from '@/components/app-shell/AppShell';
import { CurriculumBrowse } from '@/components/curriculum/CurriculumBrowse';
import { getCurriculumBrowseData } from '@/lib/curriculum-browse';
import { getHeaderProfile } from '@/lib/profile';

// Rendered per-request so the shell reflects the live session and the selected
// Subject / Year / Week / View (driven by URL search params, so the view is
// linkable).
export const dynamic = 'force-dynamic';

type SearchParams = {
  subject?: string;
  year?: string;
  month?: string;
  week?: string;
  view?: string;
};

/**
 * Curriculum browse — a read-only, single-week "zoomed-in" view of the curriculum
 * table, navigated by Subject → Year → Week. All content is curriculum-provided
 * (cream/locked); the only action is "Plan this lesson", which carries a slot into
 * the existing create-from-curriculum flow. The proxy redirects signed-out users.
 */
export default async function CurriculumPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { subject, year, month, week, view } = await searchParams;
  const yearNum = year ? Number(year) : undefined;
  const weekNum = week ? Number(week) : undefined;
  const resolvedView = view === 'monthly' ? 'monthly' : 'weekly';

  const [{ name, subtitle }, data] = await Promise.all([
    getHeaderProfile(),
    getCurriculumBrowseData({
      subject: subject || undefined,
      year: Number.isFinite(yearNum) ? yearNum : undefined,
      month: month || undefined,
      week: Number.isFinite(weekNum) ? weekNum : undefined,
    }),
  ]);

  return (
    <AppShell name={name} subtitle={subtitle}>
      <CurriculumBrowse data={data} view={resolvedView} />
    </AppShell>
  );
}
