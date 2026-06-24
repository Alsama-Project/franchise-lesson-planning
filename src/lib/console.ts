import 'server-only';

// Data layer for the role-aware settings console (Centres · Subjects · Classes ·
// Members & roles · Curriculum). Everything goes through the auth'd, cookie-bound
// Supabase client, so RLS scopes every read; the service-role key is never used
// here. The permission boundary is the (centre, subject) space modelled by
// `subject_membership` — see src/lib/auth.ts.
//
// RLS NOTE (admin Members): there is no admin-wide `profiles` SELECT policy in
// the current schema (only `profiles_select_own` + `profiles_select_comember`),
// so an admin can only read the display name of people they share a space with,
// and profiles with zero memberships ("No access") are not visible at all. These
// reads therefore degrade gracefully (names fall back to a placeholder) and the
// "No access" list is best-effort. Adding `profiles_admin_select` would close the
// gap, but RLS changes are out of scope for this slice.

import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, getMyMemberships, type MembershipRole } from '@/lib/auth';

// ── Role / access resolution ────────────────────────────────────────────────

export type ConsoleTab =
  | 'profile'
  | 'centres'
  | 'subjects'
  | 'classes'
  | 'members'
  | 'curriculum';

export interface CoordinatorSpace {
  schoolId: string;
  subjectId: string;
  schoolName: string | null;
  subjectName: string | null;
}

export interface ConsoleAccess {
  profileId: string | null;
  isAdmin: boolean;
  isCoordinator: boolean;
  coordinatorSpaces: CoordinatorSpace[];
  /** Tabs to render, in order. */
  tabs: ConsoleTab[];
  /** Landing tab for this role. */
  defaultTab: ConsoleTab;
}

/**
 * Resolve which console tabs the signed-in user gets and where they land.
 * Admin → Centres · Subjects · Classes · Members · Curriculum (+ Profile first).
 * Coordinator (non-admin, ≥1 coordinator membership) → Members · Curriculum.
 * Everyone has Profile. Teacher → Profile only.
 */
export async function getConsoleAccess(): Promise<ConsoleAccess> {
  const [profile, memberships] = await Promise.all([getCurrentProfile(), getMyMemberships()]);
  const isAdmin = profile?.role === 'admin';

  const coordinatorSpaces: CoordinatorSpace[] = memberships
    .filter((m) => m.role === 'coordinator')
    .map((m) => ({
      schoolId: m.schoolId,
      subjectId: m.subjectId,
      schoolName: m.schoolName,
      subjectName: m.subjectName,
    }));
  const isCoordinator = !isAdmin && coordinatorSpaces.length > 0;

  const tabs: ConsoleTab[] = ['profile'];
  let defaultTab: ConsoleTab = 'profile';
  if (isAdmin) {
    tabs.push('centres', 'subjects', 'classes', 'members', 'curriculum');
    defaultTab = 'centres';
  } else if (isCoordinator) {
    tabs.push('members', 'curriculum');
    defaultTab = 'members';
  }

  return {
    profileId: profile?.id ?? null,
    isAdmin,
    isCoordinator,
    coordinatorSpaces,
    tabs,
    defaultTab,
  };
}

const spaceKey = (schoolId: string, subjectId: string) => `${schoolId}:${subjectId}`;

// ── Centres ───────────────────────────────────────────────────────────────────

export interface CentreRow {
  id: string;
  name: string;
  region: string | null;
  archivedAt: string | null;
  /** Count of non-archived classes referencing this centre. */
  activeClassCount: number;
}

export async function getCentres(): Promise<CentreRow[]> {
  const supabase = await createClient();
  const [{ data: schools }, { data: classes }] = await Promise.all([
    supabase.from('schools').select('id, name, region, archived_at').order('name'),
    supabase.from('classes').select('school_id, archived_at'),
  ]);

  const schoolRows = (schools ?? []) as Array<{
    id: string;
    name: string;
    region: string | null;
    archived_at: string | null;
  }>;
  const classRows = (classes ?? []) as Array<{ school_id: string; archived_at: string | null }>;

  const activeBySchool = new Map<string, number>();
  for (const c of classRows) {
    if (c.archived_at) continue;
    activeBySchool.set(c.school_id, (activeBySchool.get(c.school_id) ?? 0) + 1);
  }

  return schoolRows.map((s) => ({
    id: s.id,
    name: s.name,
    region: s.region,
    archivedAt: s.archived_at,
    activeClassCount: activeBySchool.get(s.id) ?? 0,
  }));
}

// ── Subjects ──────────────────────────────────────────────────────────────────

export interface SubjectRow {
  id: string;
  name: string;
  code: string;
  archivedAt: string | null;
  activeClassCount: number;
}

export async function getSubjects(): Promise<SubjectRow[]> {
  const supabase = await createClient();
  const [{ data: subjects }, { data: classes }] = await Promise.all([
    supabase.from('subjects').select('id, name, code, archived_at').order('name'),
    supabase.from('classes').select('subject_id, archived_at'),
  ]);

  const subjectRows = (subjects ?? []) as Array<{
    id: string;
    name: string;
    code: string;
    archived_at: string | null;
  }>;
  const classRows = (classes ?? []) as Array<{ subject_id: string; archived_at: string | null }>;

  const activeBySubject = new Map<string, number>();
  for (const c of classRows) {
    if (c.archived_at) continue;
    activeBySubject.set(c.subject_id, (activeBySubject.get(c.subject_id) ?? 0) + 1);
  }

  return subjectRows.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    archivedAt: s.archived_at,
    activeClassCount: activeBySubject.get(s.id) ?? 0,
  }));
}

// ── Classes ─────────────────────────────────────────────────────────────────

export interface ConsoleClassRow {
  id: string;
  schoolId: string;
  subjectId: string;
  schoolName: string | null;
  subjectName: string | null;
  year: number;
  groupLabel: string;
  archivedAt: string | null;
  /** subject_membership count in this class's (centre, subject) space. */
  memberCount: number;
  /** lesson_plans referencing this class (the archive warning count). */
  activePlanCount: number;
}

export interface ConsoleClassesData {
  classes: ConsoleClassRow[];
  centres: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string; code: string }>;
  years: number[];
}

export async function getConsoleClasses(): Promise<ConsoleClassesData> {
  const supabase = await createClient();
  const [{ data: classes }, { data: members }, { data: plans }, { data: schools }, { data: subjects }] =
    await Promise.all([
      supabase
        .from('classes')
        .select('id, school_id, subject_id, year, group_label, archived_at, schools ( name ), subjects ( name )')
        .order('year'),
      supabase.from('subject_membership').select('school_id, subject_id'),
      supabase.from('lesson_plans').select('class_id'),
      supabase.from('schools').select('id, name').is('archived_at', null).order('name'),
      supabase.from('subjects').select('id, name, code').is('archived_at', null).order('name'),
    ]);

  const classRows = (classes ?? []) as unknown as Array<{
    id: string;
    school_id: string;
    subject_id: string;
    year: number;
    group_label: string;
    archived_at: string | null;
    schools: { name: string } | null;
    subjects: { name: string } | null;
  }>;
  const memberRows = (members ?? []) as Array<{ school_id: string; subject_id: string }>;
  const planRows = (plans ?? []) as Array<{ class_id: string }>;

  const membersBySpace = new Map<string, number>();
  for (const m of memberRows) {
    const k = spaceKey(m.school_id, m.subject_id);
    membersBySpace.set(k, (membersBySpace.get(k) ?? 0) + 1);
  }
  const plansByClass = new Map<string, number>();
  for (const p of planRows) {
    plansByClass.set(p.class_id, (plansByClass.get(p.class_id) ?? 0) + 1);
  }

  const years = [...new Set(classRows.map((c) => c.year))].sort((a, b) => a - b);

  return {
    classes: classRows.map((c) => ({
      id: c.id,
      schoolId: c.school_id,
      subjectId: c.subject_id,
      schoolName: c.schools?.name ?? null,
      subjectName: c.subjects?.name ?? null,
      year: c.year,
      groupLabel: c.group_label,
      archivedAt: c.archived_at,
      memberCount: membersBySpace.get(spaceKey(c.school_id, c.subject_id)) ?? 0,
      activePlanCount: plansByClass.get(c.id) ?? 0,
    })),
    centres: (schools ?? []) as Array<{ id: string; name: string }>,
    subjects: (subjects ?? []) as Array<{ id: string; name: string; code: string }>,
    years,
  };
}

// ── Members & roles (admin) ───────────────────────────────────────────────────

export interface PersonMembership {
  membershipId: string;
  schoolId: string;
  subjectId: string;
  schoolName: string | null;
  subjectName: string | null;
  role: MembershipRole;
  /** Home class ("Year 1 · A") for this person in this space, when visible. */
  homeClass: string | null;
}

export interface Person {
  profileId: string;
  name: string;
  /** Empty → "No access" (no subject_membership rows). */
  memberships: PersonMembership[];
}

export interface AdminMembersData {
  people: Person[];
  centres: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
}

/** Resolve a `teacher_id:school_id:subject_id` → "Year N · Group" home-class map
 *  from the `class_teachers` rows the caller can see (RLS: own only, mostly). */
function buildHomeClassMap(
  links: Array<{
    teacher_id: string;
    classes: { school_id: string; subject_id: string; year: number; group_label: string } | null;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const l of links) {
    if (!l.classes) continue;
    const k = `${l.teacher_id}:${l.classes.school_id}:${l.classes.subject_id}`;
    if (!map.has(k)) map.set(k, `Year ${l.classes.year} · ${l.classes.group_label}`);
  }
  return map;
}

export async function getAdminMembers(): Promise<AdminMembersData> {
  const supabase = await createClient();
  const [{ data: memberships }, { data: profiles }, { data: ct }, { data: schools }, { data: subjects }] =
    await Promise.all([
      supabase
        .from('subject_membership')
        .select('id, profile_id, school_id, subject_id, role, schools ( name ), subjects ( name )'),
      supabase.from('profiles').select('id, full_name'),
      supabase
        .from('class_teachers')
        .select('teacher_id, classes ( school_id, subject_id, year, group_label )'),
      supabase.from('schools').select('id, name').is('archived_at', null).order('name'),
      supabase.from('subjects').select('id, name').is('archived_at', null).order('name'),
    ]);

  const membershipRows = (memberships ?? []) as unknown as Array<{
    id: string;
    profile_id: string;
    school_id: string;
    subject_id: string;
    role: MembershipRole;
    schools: { name: string } | null;
    subjects: { name: string } | null;
  }>;
  const profileRows = (profiles ?? []) as Array<{ id: string; full_name: string | null }>;
  const homeClasses = buildHomeClassMap(
    (ct ?? []) as unknown as Parameters<typeof buildHomeClassMap>[0],
  );

  const nameById = new Map<string, string>();
  for (const p of profileRows) nameById.set(p.id, p.full_name ?? 'Unnamed');

  // Group memberships by person.
  const byPerson = new Map<string, Person>();
  // Seed people from any profile we can read so zero-membership rows surface
  // (limited by RLS — see file note).
  for (const p of profileRows) {
    byPerson.set(p.id, { profileId: p.id, name: p.full_name ?? 'Unnamed', memberships: [] });
  }
  for (const m of membershipRows) {
    let person = byPerson.get(m.profile_id);
    if (!person) {
      person = { profileId: m.profile_id, name: nameById.get(m.profile_id) ?? 'Unnamed', memberships: [] };
      byPerson.set(m.profile_id, person);
    }
    person.memberships.push({
      membershipId: m.id,
      schoolId: m.school_id,
      subjectId: m.subject_id,
      schoolName: m.schools?.name ?? null,
      subjectName: m.subjects?.name ?? null,
      role: m.role,
      homeClass: homeClasses.get(`${m.profile_id}:${m.school_id}:${m.subject_id}`) ?? null,
    });
  }

  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    people,
    centres: (schools ?? []) as Array<{ id: string; name: string }>,
    subjects: (subjects ?? []) as Array<{ id: string; name: string }>,
  };
}

// ── Members & roles (coordinator) ──────────────────────────────────────────────

export interface CoordSpaceMember {
  membershipId: string;
  profileId: string;
  name: string;
  role: MembershipRole;
  homeClass: string | null;
  isSelf: boolean;
}

export interface CoordSpaceMembers {
  schoolId: string;
  subjectId: string;
  schoolName: string | null;
  subjectName: string | null;
  members: CoordSpaceMember[];
}

export async function getCoordinatorMembers(): Promise<CoordSpaceMembers[]> {
  const { coordinatorSpaces, profileId } = await getConsoleAccess();
  if (coordinatorSpaces.length === 0) return [];

  const supabase = await createClient();
  const [{ data: memberships }, { data: profiles }, { data: ct }] = await Promise.all([
    supabase.from('subject_membership').select('id, profile_id, school_id, subject_id, role'),
    supabase.from('profiles').select('id, full_name'),
    supabase
      .from('class_teachers')
      .select('teacher_id, classes ( school_id, subject_id, year, group_label )'),
  ]);

  const membershipRows = (memberships ?? []) as Array<{
    id: string;
    profile_id: string;
    school_id: string;
    subject_id: string;
    role: MembershipRole;
  }>;
  const nameById = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
    nameById.set(p.id, p.full_name ?? 'Unnamed');
  }
  const homeClasses = buildHomeClassMap(
    (ct ?? []) as unknown as Parameters<typeof buildHomeClassMap>[0],
  );

  return coordinatorSpaces.map((space) => ({
    schoolId: space.schoolId,
    subjectId: space.subjectId,
    schoolName: space.schoolName,
    subjectName: space.subjectName,
    members: membershipRows
      .filter((m) => m.school_id === space.schoolId && m.subject_id === space.subjectId)
      .map((m) => ({
        membershipId: m.id,
        profileId: m.profile_id,
        name: nameById.get(m.profile_id) ?? 'Unnamed',
        role: m.role,
        homeClass: homeClasses.get(`${m.profile_id}:${m.school_id}:${m.subject_id}`) ?? null,
        isSelf: m.profile_id === profileId,
      }))
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name)),
  }));
}

// ── Curriculum status ─────────────────────────────────────────────────────────

export interface CurriculumSyncSummary {
  status: string;
  rowsUpserted: number | null;
  rowsDeactivated: number | null;
  unresolved: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface CurriculumSubjectStatus {
  subjectId: string;
  name: string;
  code: string;
  latestRun: CurriculumSyncSummary | null;
  /**
   * `finished_at` of the most recent *successful* run, if any. Used by the error
   * state's "Last good sync was {relative}." line — the latest run may itself be
   * the failure, so the standing `latestRun` can't answer "when did it last work".
   */
  lastGoodAt: string | null;
}

/**
 * Latest sync run per subject. `subjectIds` scopes the list (coordinator → their
 * own subjects); omitted → all non-archived subjects (admin).
 */
export async function getCurriculumStatus(
  subjectIds?: string[],
): Promise<CurriculumSubjectStatus[]> {
  const supabase = await createClient();
  const [{ data: subjects }, { data: runs }] = await Promise.all([
    supabase.from('subjects').select('id, name, code').is('archived_at', null).order('name'),
    supabase
      .from('curriculum_sync_run')
      .select('subject_code, status, rows_upserted, rows_deactivated, unresolved, started_at, finished_at, error')
      .order('started_at', { ascending: false }),
  ]);

  let subjectRows = (subjects ?? []) as Array<{ id: string; name: string; code: string }>;
  if (subjectIds) {
    const allow = new Set(subjectIds);
    subjectRows = subjectRows.filter((s) => allow.has(s.id));
  }

  const runRows = (runs ?? []) as Array<{
    subject_code: string | null;
    status: string;
    rows_upserted: number | null;
    rows_deactivated: number | null;
    unresolved: number | null;
    started_at: string | null;
    finished_at: string | null;
    error: string | null;
  }>;

  // Rows are newest-first, so the first per code is the latest, and the first
  // `success` per code is the last good sync.
  const latestByCode = new Map<string, (typeof runRows)[number]>();
  const lastGoodByCode = new Map<string, (typeof runRows)[number]>();
  for (const r of runRows) {
    if (!r.subject_code) continue;
    if (!latestByCode.has(r.subject_code)) latestByCode.set(r.subject_code, r);
    if (r.status === 'success' && !lastGoodByCode.has(r.subject_code)) {
      lastGoodByCode.set(r.subject_code, r);
    }
  }

  return subjectRows.map((s) => {
    const run = latestByCode.get(s.code);
    const lastGood = lastGoodByCode.get(s.code);
    return {
      subjectId: s.id,
      name: s.name,
      code: s.code,
      latestRun: run
        ? {
            status: run.status,
            rowsUpserted: run.rows_upserted,
            rowsDeactivated: run.rows_deactivated,
            unresolved: run.unresolved,
            startedAt: run.started_at,
            finishedAt: run.finished_at,
            error: run.error,
          }
        : null,
      lastGoodAt: lastGood?.finished_at ?? null,
    };
  });
}
