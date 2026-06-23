import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { getHeaderProfile } from '@/lib/profile';
import { getMyMemberships } from '@/lib/auth';
import { getOnboardingData, getMyClasses } from '@/lib/onboarding';
import { SettingsForm } from '@/components/settings/SettingsForm';

// Per-request: reflects the live session, memberships and classes.
export const dynamic = 'force-dynamic';

/**
 * Account settings — name, centre, the user's subject spaces and classes. Reached
 * from the shell's avatar menu. Not gated (any signed-in member can open it).
 */
export default async function SettingsPage() {
  const { name, subtitle } = await getHeaderProfile();
  const [data, memberships, myClasses] = await Promise.all([
    getOnboardingData(),
    getMyMemberships(),
    getMyClasses(),
  ]);

  return (
    <AppShell name={name} subtitle={subtitle}>
      <div className="mx-auto max-w-[720px]">
        <Link
          href="/"
          className="mb-[14px] inline-flex items-center gap-[6px] text-[12.5px] font-medium text-neutral-600 hover:text-text-muted"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to planning
        </Link>
        <h1 className="mb-[26px] text-[25px] font-semibold tracking-[-0.01em]">Settings</h1>

        <SettingsForm
          fullName={data.fullName}
          centres={data.centres}
          subjects={data.subjects}
          classes={data.classes}
          teacherCounts={data.teacherCounts}
          classCounts={data.classCounts}
          memberships={memberships.map((m) => ({
            id: m.id,
            schoolId: m.schoolId,
            subjectId: m.subjectId,
            schoolName: m.schoolName,
            subjectName: m.subjectName,
          }))}
          myClasses={myClasses}
        />
      </div>
    </AppShell>
  );
}
