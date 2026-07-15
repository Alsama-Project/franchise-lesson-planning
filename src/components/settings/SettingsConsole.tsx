'use client';

import { type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import type {
  AdminUser,
  CentreRow,
  ConsoleAccess,
  ConsoleClassesData,
  ConsoleTab,
  SubjectMember,
  CurriculumSubjectStatus,
  PendingCoordinatorRequest,
  ResourceGuideVersion,
  SmarttGuideVersion,
  SubjectRow,
  SubjectSpaceAxes,
  TermRow,
} from '@/lib/console';
import { CentresTab } from './console/CentresTab';
import { SubjectsTab } from './console/SubjectsTab';
import { ClassesTab } from './console/ClassesTab';
import { TermCalendarTab } from './console/TermCalendarTab';
import { CoordinatorMembersTab } from './console/MembersTab';
import { CurriculumTab } from './console/CurriculumTab';
import { AiGuideTab } from './console/AiGuideTab';
import { SmarttGuideTab } from './console/SmarttGuideTab';
import { UsersTab } from './console/UsersTab';
import { LanguageSetting } from './LanguageSetting';

export interface SettingsConsoleProps {
  access: ConsoleAccess;
  /** The existing personal-settings content, rendered as the Profile tab. */
  profileTab: ReactNode;
  centres?: CentreRow[];
  subjects?: SubjectRow[];
  classesData?: ConsoleClassesData;
  /** `null` = load failed (error state); `undefined` = not loaded (non-coordinator). */
  subjectMembers?: SubjectMember[] | null;
  curriculum?: CurriculumSubjectStatus[];
  resourceGuide?: ResourceGuideVersion | null;
  smarttGuide?: SmarttGuideVersion | null;
  terms?: TermRow[];
  /** `null` = load failed (error state); `undefined` = not loaded (non-admin). */
  users?: AdminUser[] | null;
  /** Subject-space grid axes for the Users-tab Edit-access matrix (admin only). */
  userAxes?: SubjectSpaceAxes;
  /** Pending coordinator-access requests for the Users-tab triage (admin only). */
  pendingCoordinatorRequests?: PendingCoordinatorRequest[];
}

export function SettingsConsole(props: SettingsConsoleProps) {
  const { access } = props;
  const t = useTranslations('settings');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The active tab lives in the URL (`?tab=`) so it survives re-render, refresh
  // and back/forward. An absent, unknown, or not-permitted value falls back to the
  // role-derived default — we never render a tab the user's access excludes.
  const paramTab = searchParams.get('tab');
  const tab: ConsoleTab =
    paramTab && (access.tabs as string[]).includes(paramTab)
      ? (paramTab as ConsoleTab)
      : access.defaultTab;

  function setTab(tabId: ConsoleTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#DCD2C4] bg-white">
      {/* Header strip */}
      <div className="border-b border-[#F0EAE1] bg-white px-[22px] py-[16px]">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-[#2A2422]">{t('title')}</h1>
        <p className="mt-px text-[12.5px] text-[#A79E94]">
          {access.isAdmin
            ? t('subtitle.admin')
            : access.isCoordinator
              ? t('subtitle.coordinator')
              : t('subtitle.teacher')}
        </p>
      </div>

      {/* Tab row */}
      <div className="flex flex-wrap items-end gap-x-1 gap-y-1 border-b border-[#F0EAE1] px-[14px] pt-[12px] pb-1">
        {access.tabs.map((tabId) => {
          const active = tabId === tab;
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-t-[9px] px-[14px] py-[9px] text-[13px] font-semibold transition-colors',
                active ? 'bg-[#E4F0ED] text-[#186155]' : 'text-[#7A7068] hover:bg-[#FBF8F3]',
              )}
            >
              {t(`tabs.${tabId}`)}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div className="bg-white px-[22px] py-[22px]">
        {tab === 'profile' ? (
          <div className="mx-auto max-w-[720px]">
            {props.profileTab}
            <LanguageSetting />
          </div>
        ) : null}
        {tab === 'centres' && props.centres ? <CentresTab centres={props.centres} /> : null}
        {tab === 'subjects' && props.subjects ? <SubjectsTab subjects={props.subjects} /> : null}
        {tab === 'classes' && props.classesData ? <ClassesTab data={props.classesData} /> : null}
        {tab === 'calendar' && access.isAdmin ? <TermCalendarTab terms={props.terms ?? []} /> : null}
        {tab === 'members' && access.isCoordinator ? (
          <CoordinatorMembersTab
            members={props.subjectMembers ?? null}
            currentUserId={access.profileId}
          />
        ) : null}
        {tab === 'curriculum' && props.curriculum ? (
          <CurriculumTab statuses={props.curriculum} isAdmin={access.isAdmin} />
        ) : null}
        {tab === 'ai_guide' && access.isAdmin ? (
          <AiGuideTab active={props.resourceGuide ?? null} />
        ) : null}
        {tab === 'smartt_guide' && access.isAdmin ? (
          <SmarttGuideTab active={props.smarttGuide ?? null} />
        ) : null}
        {tab === 'users' && access.isAdmin ? (
          <UsersTab
            users={props.users ?? null}
            currentUserId={access.profileId}
            axes={props.userAxes ?? { centres: [], subjects: [] }}
            pendingRequests={props.pendingCoordinatorRequests ?? []}
          />
        ) : null}
      </div>
    </div>
  );
}
