import 'server-only';

// Data layer for the role-aware settings console (Centres · Subjects · Classes ·
// Members & roles · Curriculum). Everything goes through the auth'd, cookie-bound
// Supabase client, so RLS scopes every read; the service-role key is never used
// here. The permission boundary is the (centre, subject) space modelled by
// `subject_membership` — see src/lib/auth.ts.
//
// ROSTER NOTE (admin Members): the admin roster is read through the
// `admin_list_users()` SECURITY DEFINER RPC (0023, extended in 0036), NOT a direct
// `profiles` read. Direct reads are RLS-bound to own-row + co-members, so a user
// the admin shares no (centre, subject) space with — e.g. a zero-membership
// newcomer or a test-bar candidate — would be invisible. The RPC is hard-gated on
// `is_admin()` and returns EVERY user (incl. those with no membership, as an empty
// set), plus each user's global `role` and `can_impersonate` flag. Home-class
// ("Year N") is still derived from the auth'd `class_teachers` read, which stays
// RLS-bound (own-mostly) exactly as before — the roster source changed, that
// derivation did not.

import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, getMyMemberships, type AppRole, type MembershipRole } from '@/lib/auth';

// ── Role / access resolution ────────────────────────────────────────────────

export type ConsoleTab =
  | 'profile'
  | 'centres'
  | 'subjects'
  | 'classes'
  | 'calendar'
  | 'members'
  | 'curriculum'
  | 'ai_guide'
  | 'smartt_guide'
  | 'users';

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
 * Admin → Centres · Subjects · Classes · Members · Curriculum · AI resource guide
 * · SMARTT objective guide · Users (+ Profile first).
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
    tabs.push('centres', 'subjects', 'classes', 'calendar', 'members', 'curriculum', 'ai_guide', 'smartt_guide', 'users');
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
        .select('id, school_id, subject_id, year, archived_at, schools ( name ), subjects ( name )')
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
  /** Home class ("Year 1") for this person in this space, when visible. */
  homeClass: string | null;
}

export interface Person {
  profileId: string;
  name: string;
  /** Global role on `profiles.role`. Admins are always test-bar eligible. */
  role: AppRole;
  /**
   * Whether this user may USE the test bar (`profiles.can_impersonate`). Note
   * real admins are eligible regardless (eligibility is `can_impersonate` OR
   * admin), so the toggle renders as implied-on for them.
   */
  canImpersonate: boolean;
  /** Empty → "No access" (no subject_membership rows). */
  memberships: PersonMembership[];
}

export interface AdminMembersData {
  people: Person[];
  centres: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
}

/** Resolve a `teacher_id:school_id:subject_id` → "Year N" home-class map
 *  from the `class_teachers` rows the caller can see (RLS: own only, mostly). */
function buildHomeClassMap(
  links: Array<{
    teacher_id: string;
    classes: { school_id: string; subject_id: string; year: number } | null;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const l of links) {
    if (!l.classes) continue;
    const k = `${l.teacher_id}:${l.classes.school_id}:${l.classes.subject_id}`;
    if (!map.has(k)) map.set(k, `Year ${l.classes.year}`);
  }
  return map;
}

/** One membership entry inside `admin_list_users`' aggregated `memberships` jsonb. */
interface RosterMembership {
  membership_id: string;
  school_id: string;
  school_name: string | null;
  subject_id: string;
  subject_name: string | null;
  role: MembershipRole;
}

/** A row of the `admin_list_users()` RPC (0023, extended in 0036). */
interface RosterRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole | null;
  can_impersonate: boolean | null;
  memberships: RosterMembership[] | null;
}

export async function getAdminMembers(): Promise<AdminMembersData> {
  const supabase = await createClient();
  // The roster comes from the admin-gated definer RPC so EVERY user is present
  // (incl. zero-membership newcomers and cross-space testers the RLS-bound
  // `profiles` read could never see). Home-class + the modal's centre/subject
  // pickers still read reference/`class_teachers` data via the auth'd client.
  const [{ data: roster }, { data: ct }, { data: schools }, { data: subjects }] = await Promise.all([
    supabase.rpc('admin_list_users'),
    supabase
      .from('class_teachers')
      .select('teacher_id, classes ( school_id, subject_id, year )'),
    supabase.from('schools').select('id, name').is('archived_at', null).order('name'),
    supabase.from('subjects').select('id, name').is('archived_at', null).order('name'),
  ]);

  const rosterRows = (roster ?? []) as unknown as RosterRow[];
  const homeClasses = buildHomeClassMap(
    (ct ?? []) as unknown as Parameters<typeof buildHomeClassMap>[0],
  );

  const people: Person[] = rosterRows.map((r) => {
    const memberships: PersonMembership[] = (r.memberships ?? []).map((m) => ({
      membershipId: m.membership_id,
      schoolId: m.school_id,
      subjectId: m.subject_id,
      schoolName: m.school_name,
      subjectName: m.subject_name,
      role: m.role,
      homeClass: homeClasses.get(`${r.user_id}:${m.school_id}:${m.subject_id}`) ?? null,
    }));
    return {
      profileId: r.user_id,
      name: r.full_name?.trim() || 'Unnamed',
      role: r.role ?? 'teacher',
      canImpersonate: r.can_impersonate === true,
      memberships,
    };
  });

  people.sort((a, b) => a.name.localeCompare(b.name));

  return {
    people,
    centres: (schools ?? []) as Array<{ id: string; name: string }>,
    subjects: (subjects ?? []) as Array<{ id: string; name: string }>,
  };
}

// ── Users (admin-only, org-wide) ──────────────────────────────────────────────
// The global user-administration list backing the Users tab. Distinct from the
// per-space Members tab above: it surfaces EVERY user (email included, via the
// definer RPC) plus their admin/deactivation flags. Email lives in auth.users, so
// this can only come from the `list_users_admin()` SECURITY DEFINER function,
// which hard-gates on is_admin(). Filtering/search happen client-side in the tab.

/** One subject space a user belongs to, for the Users-tab chips + Edit-access
 *  matrix. `schoolId`/`subjectId` (added in 0037) identify the (centre, subject)
 *  cell so the modal can tick/untick and persist by id; `membershipId` is the
 *  row's own id (unused by the toggle, kept for parity with the RPC shape). */
export interface UserSpace {
  membershipId: string | null;
  schoolId: string | null;
  subjectId: string | null;
  subject: string | null;
  role: MembershipRole;
  centre: string | null;
}

export interface AdminUser {
  userId: string;
  fullName: string | null;
  email: string | null;
  isAdmin: boolean;
  isDeactivated: boolean;
  spaces: UserSpace[];
}

/**
 * The axes of the Edit-access subject-space grid: every active centre and every
 * active subject. A subject is NOT centre-scoped (there is no `centre_subjects`
 * table), so the grid is the cartesian of these two — matching the membership
 * model (`saveMembership` grants any centre × subject pair). Read via the auth'd
 * client (reference tables are readable to any authenticated user).
 */
export interface SubjectSpaceAxes {
  centres: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
}

export async function getSubjectSpaceAxes(): Promise<SubjectSpaceAxes> {
  const supabase = await createClient();
  const [{ data: schools }, { data: subjects }] = await Promise.all([
    supabase.from('schools').select('id, name').is('archived_at', null).order('name'),
    supabase.from('subjects').select('id, name').is('archived_at', null).order('name'),
  ]);
  return {
    centres: (schools ?? []) as Array<{ id: string; name: string }>,
    subjects: (subjects ?? []) as Array<{ id: string; name: string }>,
  };
}

/**
 * Every user in the org, for the admin Users tab. Throws only for a hard failure;
 * the RPC itself raises for non-admins (the tab is admin-gated, so that is a
 * belt-and-braces). Returns rows already normalised to camelCase.
 */
export async function getUsersAdmin(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_users_admin');
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
    is_admin: boolean;
    is_deactivated: boolean;
    spaces:
      | Array<{
          membership_id: string | null;
          school_id: string | null;
          subject_id: string | null;
          subject: string | null;
          role: MembershipRole;
          centre: string | null;
        }>
      | null;
  }>;

  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    isAdmin: r.is_admin,
    isDeactivated: r.is_deactivated,
    spaces: (r.spaces ?? []).map((s) => ({
      membershipId: s.membership_id,
      schoolId: s.school_id,
      subjectId: s.subject_id,
      subject: s.subject,
      role: s.role,
      centre: s.centre,
    })),
  }));
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
      .select('teacher_id, classes ( school_id, subject_id, year )'),
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

// ── AI resource guide (admin) ────────────────────────────────────────────────

/**
 * The active AI-resource-guide version, for the admin Settings surface. The
 * console shows the original filename + upload date only (no text preview); the
 * stored `content` is served to the AI backend through the security-definer read
 * function (`get_active_resource_guide()`) and is not exposed here.
 */
export interface ResourceGuideVersion {
  /** The original uploaded filename, or null on rows predating capture (0021). */
  originalFilename: string | null;
  /** When this version was uploaded (`created_at`). */
  createdAt: string;
}

/**
 * Load the active (latest) AI-resource-guide version for the admin console.
 * Returns null when no guide has been uploaded yet (the UI then notes that the
 * built-in default guide is in use). Admin-only by RLS
 * (`ai_resource_guide_select_admin`); a non-admin read yields no rows → null.
 *
 * `original_filename` is null on versions uploaded before 0021; the UI falls back
 * to showing the upload date alone in that case.
 */
export async function getActiveResourceGuideVersion(): Promise<ResourceGuideVersion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ai_resource_guide')
    .select('original_filename, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { original_filename: string | null; created_at: string } | null;
  if (!row) return null;

  return { originalFilename: row.original_filename, createdAt: row.created_at };
}

// ── SMARTT objective guide (admin) ───────────────────────────────────────────

/**
 * The active SMARTT-objective-guide version, for the admin Settings surface. The
 * console shows the original filename + upload date only (no text preview); the
 * stored `content` is served to the AI backend through the security-definer read
 * function (`get_active_smartt_guide()`) and is not exposed here.
 */
export interface SmarttGuideVersion {
  /** The original uploaded filename, or null on rows predating capture (0021). */
  originalFilename: string | null;
  /** When this version was uploaded (`created_at`). */
  createdAt: string;
}

/**
 * Load the active (latest) SMARTT-objective-guide version for the admin console.
 * Returns null when no guide has been uploaded yet (the UI then notes that the
 * built-in default guide is in use). Admin-only by RLS
 * (`smartt_objective_guide_select_admin`); a non-admin read yields no rows → null.
 *
 * `original_filename` is null on versions uploaded before 0021; the UI falls back
 * to showing the upload date alone in that case.
 *
 * Faithful clone of {@link getActiveResourceGuideVersion} — different table.
 */
export async function getActiveSmarttGuideVersion(): Promise<SmarttGuideVersion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('smartt_objective_guide')
    .select('original_filename, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { original_filename: string | null; created_at: string } | null;
  if (!row) return null;

  return { originalFilename: row.original_filename, createdAt: row.created_at };
}

// ── Term calendar (admin) ─────────────────────────────────────────────────────

export interface TermRow {
  id: string;
  name: string;
  /** The Monday (`YYYY-MM-DD`) of the term's Week 1. */
  startsOn: string;
  /** Whole weeks the term spans (1–40). */
  numWeeks: number;
}

/**
 * All terms for the (org-wide v1) calendar, in start-date order — the bands of the
 * admin timeline and the source the board's `term_week` view derives from. Reads
 * via the auth'd client; `term_read` lets every authenticated user see the shared
 * calendar, while only admins may write it.
 */
export async function getTerms(): Promise<TermRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('term')
    .select('id, name, starts_on, num_weeks')
    .order('starts_on', { ascending: true });

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    starts_on: string;
    num_weeks: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startsOn: r.starts_on,
    numWeeks: r.num_weeks,
  }));
}
