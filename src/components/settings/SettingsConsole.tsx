'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type {
  AdminMembersData,
  CentreRow,
  ConsoleAccess,
  ConsoleClassesData,
  ConsoleTab,
  CoordSpaceMembers,
  CurriculumSubjectStatus,
  SubjectRow,
} from '@/lib/console';
import { CentresTab } from './console/CentresTab';
import { SubjectsTab } from './console/SubjectsTab';
import { ClassesTab } from './console/ClassesTab';
import { AdminMembersTab, CoordinatorMembersTab } from './console/MembersTab';
import { CurriculumTab } from './console/CurriculumTab';

const TAB_LABELS: Record<ConsoleTab, string> = {
  profile: 'Profile',
  centres: 'Centres',
  subjects: 'Subjects',
  classes: 'Classes',
  members: 'Members & roles',
  curriculum: 'Curriculum',
};

export interface SettingsConsoleProps {
  access: ConsoleAccess;
  /** The existing personal-settings content, rendered as the Profile tab. */
  profileTab: ReactNode;
  centres?: CentreRow[];
  subjects?: SubjectRow[];
  classesData?: ConsoleClassesData;
  adminMembers?: AdminMembersData;
  coordSpaces?: CoordSpaceMembers[];
  curriculum?: CurriculumSubjectStatus[];
}

export function SettingsConsole(props: SettingsConsoleProps) {
  const { access } = props;
  const [tab, setTab] = useState<ConsoleTab>(access.defaultTab);

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#DCD2C4] bg-white">
      {/* Header strip */}
      <div className="border-b border-[#F0EAE1] bg-white px-[22px] py-[16px]">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-[#2A2422]">Settings</h1>
        <p className="mt-px text-[12.5px] text-[#A79E94]">
          {access.isAdmin
            ? 'Organisation administration · your profile'
            : access.isCoordinator
              ? 'Your coordinator spaces · your profile'
              : 'Your profile'}
        </p>
      </div>

      {/* Tab row */}
      <div className="flex flex-wrap gap-1 border-b border-[#F0EAE1] px-[14px] pt-[12px]">
        {access.tabs.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-t-[9px] px-[14px] py-[9px] text-[13px] font-semibold transition-colors',
                active ? 'bg-[#E4F0ED] text-[#186155]' : 'text-[#7A7068] hover:bg-[#FBF8F3]',
              )}
            >
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div className="bg-white px-[22px] py-[22px]">
        {tab === 'profile' ? <div className="mx-auto max-w-[720px]">{props.profileTab}</div> : null}
        {tab === 'centres' && props.centres ? <CentresTab centres={props.centres} /> : null}
        {tab === 'subjects' && props.subjects ? <SubjectsTab subjects={props.subjects} /> : null}
        {tab === 'classes' && props.classesData ? <ClassesTab data={props.classesData} /> : null}
        {tab === 'members' ? (
          access.isAdmin && props.adminMembers ? (
            <AdminMembersTab data={props.adminMembers} />
          ) : props.coordSpaces ? (
            <CoordinatorMembersTab spaces={props.coordSpaces} />
          ) : null
        ) : null}
        {tab === 'curriculum' && props.curriculum ? (
          <CurriculumTab statuses={props.curriculum} />
        ) : null}
      </div>
    </div>
  );
}
