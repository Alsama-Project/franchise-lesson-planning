import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell/AppShell';
import { getHeaderProfile } from '@/lib/profile';
import { getMyMemberships } from '@/lib/auth';
import { getOnboardingData, getMyClasses } from '@/lib/onboarding';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { SettingsConsole } from '@/components/settings/SettingsConsole';
import {
  getActiveResourceGuideVersion,
  getActiveSmarttGuideVersion,
  getCentres,
  getConsoleAccess,
  getConsoleClasses,
  getSubjectMembers,
  getCurriculumStatus,
  getPendingCoordinatorRequests,
  getSubjects,
  getSubjectSpaceAxes,
  getTerms,
  getUsersAdmin,
  type AdminUser,
  type CentreRow,
  type ConsoleClassesData,
  type SubjectMember,
  type CurriculumSubjectStatus,
  type PendingCoordinatorRequest,
  type ResourceGuideVersion,
  type SmarttGuideVersion,
  type SubjectRow,
  type SubjectSpaceAxes,
  type TermRow,
} from '@/lib/console';

// Per-request: reflects the live session, memberships and org structure.
export const dynamic = 'force-dynamic';

/**
 * The settings console — a role-aware tabbed surface. Everyone gets the personal
 * "Profile" tab (the existing settings content). Admins additionally get Centres ·
 * Subjects · Classes · Members & roles · Curriculum; coordinators get Members &
 * roles (their spaces) + Curriculum (their subjects). This replaces the retired
 * standalone `/admin` route. Reached from the shell nav (admins/coordinators) and
 * the avatar menu (everyone).
 */
export default async function SettingsPage() {
  const { name, subtitle } = await getHeaderProfile();
  const t = await getTranslations('settings');
  const [access, data, memberships, myClasses] = await Promise.all([
    getConsoleAccess(),
    getOnboardingData(),
    getMyMemberships(),
    getMyClasses(),
  ]);

  // The Profile tab is the existing personal-settings form, unchanged.
  const profileTab = (
    <SettingsForm
      fullName={data.fullName}
      centres={data.centres}
      subjects={data.subjects}
      classes={data.classes}
      memberships={memberships.map((m) => ({
        id: m.id,
        schoolId: m.schoolId,
        subjectId: m.subjectId,
        schoolName: m.schoolName,
        subjectName: m.subjectName,
        role: m.role,
      }))}
      myClasses={myClasses}
    />
  );

  // Load the admin/coordinator datasets only for the roles that render them.
  let centres: CentreRow[] | undefined;
  let subjects: SubjectRow[] | undefined;
  let classesData: ConsoleClassesData | undefined;
  // `null` distinguishes a load failure (renders the tab's error state) from
  // "not loaded because not a coordinator" (`undefined`).
  let subjectMembers: SubjectMember[] | null | undefined;
  let curriculum: CurriculumSubjectStatus[] | undefined;
  let resourceGuide: ResourceGuideVersion | null | undefined;
  let smarttGuide: SmarttGuideVersion | null | undefined;
  let terms: TermRow[] | undefined;
  // `null` distinguishes a load failure (renders the tab's error state) from
  // "not loaded because not admin" (`undefined`).
  let users: AdminUser[] | null | undefined;
  // Grid axes for the Users-tab Edit-access matrix (active centres × subjects).
  let userAxes: SubjectSpaceAxes | undefined;
  // Pending coordinator-access requests for the Users-tab triage section.
  let pendingCoordinatorRequests: PendingCoordinatorRequest[] | undefined;

  if (access.isAdmin) {
    [centres, subjects, classesData, curriculum, resourceGuide, smarttGuide, terms, users, userAxes, pendingCoordinatorRequests] =
      await Promise.all([
        getCentres(),
        getSubjects(),
        getConsoleClasses(),
        getCurriculumStatus(),
        getActiveResourceGuideVersion(),
        getActiveSmarttGuideVersion(),
        getTerms(),
        getUsersAdmin().catch(() => null),
        getSubjectSpaceAxes(),
        getPendingCoordinatorRequests(),
      ]);
  } else if (access.isCoordinator) {
    const subjectIds = [...new Set(access.coordinatorSpaces.map((s) => s.subjectId))];
    [subjectMembers, curriculum] = await Promise.all([
      getSubjectMembers().catch(() => null),
      getCurriculumStatus(subjectIds),
    ]);
  }

  return (
    <AppShell name={name} subtitle={subtitle}>
      <div className="mx-auto max-w-[1080px]">
        <Link
          href="/"
          className="mb-[14px] inline-flex items-center gap-[6px] text-[12.5px] font-medium text-neutral-600 hover:text-text-muted"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t('backToPlanning')}
        </Link>

        <SettingsConsole
          access={access}
          profileTab={profileTab}
          centres={centres}
          subjects={subjects}
          classesData={classesData}
          subjectMembers={subjectMembers}
          curriculum={curriculum}
          resourceGuide={resourceGuide}
          smarttGuide={smarttGuide}
          terms={terms}
          users={users}
          userAxes={userAxes}
          pendingCoordinatorRequests={pendingCoordinatorRequests}
        />
      </div>
    </AppShell>
  );
}
