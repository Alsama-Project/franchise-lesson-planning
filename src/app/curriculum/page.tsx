import { AppShell } from '@/components/app-shell/AppShell';
import { CurriculumBrowse } from '@/components/curriculum/CurriculumBrowse';
import { ExplorerTabs, type ExplorerTab } from '@/components/curriculum/ExplorerTabs';
import { LogicTree } from '@/components/curriculum/LogicTree';
import { Topics } from '@/components/curriculum/Topics';
import { SearchSlot } from '@/components/curriculum/SearchSlot';
import { getCurriculumBrowseData, getExplorerShell } from '@/lib/curriculum-browse';
import {
  getCompositionTree,
  getCurriculumSubjectCapabilities,
  getTopicsData,
  type SubjectCapabilities,
} from '@/lib/curriculum/composition';
import { getHeaderProfile } from '@/lib/profile';
import { getConsoleAccess } from '@/lib/console';

// Rendered per-request so the shell reflects the live session and the selected
// Tab / Subject / Year / Week / View (driven by URL search params, so the view is
// linkable).
export const dynamic = 'force-dynamic';

type SearchParams = {
  tab?: string;
  subject?: string;
  year?: string;
  month?: string;
  week?: string;
  view?: string;
};

const TABS: ExplorerTab[] = ['calendar', 'tree', 'topics', 'search'];

/**
 * Curriculum Explorer — a read-only browser over the curriculum with four tabs:
 * Calendar (the existing single-week/monthly viewer), Logic tree (the outcome
 * composition, gated on taxonomy), Topics (focus-area/theme spiral), and a Search slot
 * owned by a separate slice. All content is curriculum-provided (cream/locked); the
 * only action is "Plan this lesson", which hands a calendar-keyed slot to the existing
 * create flow. The proxy redirects signed-out users.
 */
export default async function CurriculumPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { tab, subject, year, month, week, view } = await searchParams;
  const yearNum = year ? Number(year) : undefined;
  const weekNum = week ? Number(week) : undefined;
  const resolvedView = view === 'monthly' ? 'monthly' : 'weekly';
  const activeTab: ExplorerTab = TABS.includes(tab as ExplorerTab) ? (tab as ExplorerTab) : 'calendar';

  const [{ name, subtitle }, shell, access] = await Promise.all([
    getHeaderProfile(),
    getExplorerShell({
      subject: subject || undefined,
      year: Number.isFinite(yearNum) ? yearNum : undefined,
    }),
    getConsoleAccess(),
  ]);
  // Coordinator/admin only — surfaces the trailing "Insights" link in the tab bar.
  const showInsights = access.isAdmin || access.isCoordinator;

  // No curriculum synced at all → the Calendar viewer's own empty state.
  if (!shell) {
    const data = await getCurriculumBrowseData({ subject: subject || undefined });
    return (
      <AppShell name={name} subtitle={subtitle}>
        <CurriculumBrowse data={data} view={resolvedView} />
      </AppShell>
    );
  }

  const capabilities = await getCurriculumSubjectCapabilities(shell.subjectCode);

  return (
    <AppShell name={name} subtitle={subtitle}>
      <ExplorerTabs
        tab={activeTab}
        subjectCode={shell.subjectCode}
        subjectName={shell.subjectName}
        year={shell.year}
        logicTreeEnabled={capabilities.logicTreeEnabled}
        showInsights={showInsights}
      >
        <TabBody
          tab={activeTab}
          shell={shell}
          capabilities={capabilities}
          searchParams={{
            subject: subject || undefined,
            year: Number.isFinite(yearNum) ? yearNum : undefined,
            month: month || undefined,
            week: Number.isFinite(weekNum) ? weekNum : undefined,
            view: resolvedView,
          }}
        />
      </ExplorerTabs>
    </AppShell>
  );
}

async function TabBody({
  tab,
  shell,
  capabilities,
  searchParams,
}: {
  tab: ExplorerTab;
  shell: NonNullable<Awaited<ReturnType<typeof getExplorerShell>>>;
  capabilities: SubjectCapabilities;
  searchParams: {
    subject?: string;
    year?: number;
    month?: string;
    week?: number;
    view: 'weekly' | 'monthly';
  };
}) {
  const subjects = shell.subjects.map((s) => ({ code: s.code, name: s.name }));

  if (tab === 'tree') {
    // Enforce the coverage gate in the BODY too (not just the tab link): a below-
    // threshold subject like IT still has *some* well-formed rows, so we must not
    // render its sparse tree. Skip the read entirely when disabled.
    const enabled = capabilities.logicTreeEnabled;
    const tree = enabled
      ? await getCompositionTree(shell.subjectCode, shell.year)
      : { subject: shell.subjectCode, subjectOutcome: null, years: [] };
    return (
      <LogicTree
        tree={tree}
        enabled={enabled}
        unmappedCount={capabilities.totalRows - capabilities.wellFormedRows}
        totalRows={capabilities.totalRows}
        subjects={subjects}
        subjectName={shell.subjectName}
        years={shell.years}
        year={shell.year}
      />
    );
  }

  if (tab === 'topics') {
    const data = await getTopicsData(shell.subjectCode);
    return (
      <Topics
        data={data}
        subjects={subjects}
        subjectName={shell.subjectName}
        year={shell.year}
      />
    );
  }

  if (tab === 'search') {
    return <SearchSlot subjectName={shell.subjectName} />;
  }

  // Calendar — the existing viewer, re-fetched with its own (subject/year/month/week).
  const data = await getCurriculumBrowseData({
    subject: searchParams.subject,
    year: searchParams.year,
    month: searchParams.month,
    week: searchParams.week,
  });
  return <CurriculumBrowse data={data} view={searchParams.view} embedded />;
}
