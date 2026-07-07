import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell/AppShell';
import { CurriculumInsights } from '@/components/curriculum/CurriculumInsights';
import { getExplorerShell } from '@/lib/curriculum-browse';
import {
  getHoursByLinguisticSkill,
  getInsightsAggregates,
  getTopicsData,
} from '@/lib/curriculum/composition';
import { getConsoleAccess } from '@/lib/console';
import { getHeaderProfile } from '@/lib/profile';

// Per-request: reflects the live session, role and the selected subject/year (URL params,
// so the view is linkable).
export const dynamic = 'force-dynamic';

type SearchParams = {
  subject?: string;
  year?: string;
};

/**
 * Curriculum → Insights — read-only analytics over one subject's scheme of work.
 *
 * ADMIN ONLY. The gate is the existing `getConsoleAccess()` role check (the same one the
 * Settings console uses); we key on `access.isAdmin` alone. A non-admin (coordinator or
 * teacher) is redirected to `/` and never renders this route; the dropdown entry link is
 * gated on the same admin signal, so they never see it either.
 */
export default async function CurriculumInsightsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await getConsoleAccess();
  if (!access.isAdmin) redirect('/');

  const { subject, year } = await searchParams;
  const yearNum = year ? Number(year) : undefined;

  const [{ name, subtitle }, shell] = await Promise.all([
    getHeaderProfile(),
    getExplorerShell({
      subject: subject || undefined,
      year: Number.isFinite(yearNum) ? yearNum : undefined,
    }),
  ]);

  // No curriculum synced at all → a quiet page-level empty state.
  if (!shell) {
    const t = await getTranslations('insights');
    return (
      <AppShell name={name} subtitle={subtitle}>
        <div className="mx-auto max-w-[1160px] rounded-[18px] border border-dashed border-border-strong bg-surface-subtle px-[24px] py-[48px] text-center">
          <p className="text-[14px] text-text-muted">{t('noCurriculum')}</p>
        </div>
      </AppShell>
    );
  }

  // Chart 1 ← hoursPerMonth (calendar count); charts 2/3/4 ← focus_area/theme (live).
  // `linguisticSkills` backs the ENGLISH fallback of card 2 (no focus_area, ~178 themes →
  // group by the ~5 linguistic skills instead); it fails safe to [] for subjects/DBs where
  // the 0055 aggregate has no data. All are DB-side GROUP BY aggregates (0050/0051/0055
  // RPCs), never a capped bulk read.
  const [aggregates, topics, linguisticSkills] = await Promise.all([
    getInsightsAggregates(shell.subjectCode),
    getTopicsData(shell.subjectCode),
    getHoursByLinguisticSkill(shell.subjectCode),
  ]);

  return (
    <AppShell name={name} subtitle={subtitle}>
      <CurriculumInsights
        subjects={shell.subjects.map((s) => ({ code: s.code, name: s.name }))}
        subjectCode={shell.subjectCode}
        subjectName={shell.subjectName}
        years={shell.years}
        year={shell.year}
        hoursPerMonth={aggregates.hoursPerMonth}
        topics={topics}
        linguisticSkills={linguisticSkills}
      />
    </AppShell>
  );
}
