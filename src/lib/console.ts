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
import {
  getCurrentProfile,
  getMyMemberships,
  type Membership,
  type MembershipRole,
} from '@/lib/auth';

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
 * Admin → Centres · Subjects · Classes · Calendar · Curriculum · AI resource guide
 * · SMARTT objective guide · Users (+ Profile first). The admin Members tab is
 * retired — user access is managed from the Users-tab "Edit access" modal.
 * Coordinator (non-admin, ≥1 coordinated subject) → Members · Curriculum.
 * Everyone has Profile. Teacher → Profile only.
 */
export async function getConsoleAccess(): Promise<ConsoleAccess> {
  const [profile, memberships] = await Promise.all([getCurrentProfile(), getMyMemberships()]);
  const isAdmin = profile?.role === 'admin';

  // Coordinated subjects are school-agnostic (coordinator_subject); admins don't
  // render the coordinator surface, so skip the read for them.
  const coordinatorSpaces = isAdmin ? [] : await resolveCoordinatorSpaces(memberships);
  const isCoordinator = !isAdmin && coordinatorSpaces.length > 0;

  const tabs: ConsoleTab[] = ['profile'];
  let defaultTab: ConsoleTab = 'profile';
  if (isAdmin) {
    tabs.push('centres', 'subjects', 'classes', 'calendar', 'curriculum', 'ai_guide', 'smartt_guide', 'users');
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

/**
 * A coordinator's spaces for the (coordinator-facing) Members tab. Coordinator-ness
 * is school-agnostic — one `coordinator_subject` row means "this subject at every
 * school" — so we expand each coordinated subject across all active schools. During
 * the migration-1→2 transition a coordinator may still carry legacy per-school
 * `subject_membership` coordinator rows, so we union both sources by subject.
 */
async function resolveCoordinatorSpaces(memberships: Membership[]): Promise<CoordinatorSpace[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: coordRows } = await supabase
    .from('coordinator_subject')
    .select('subject_id, subjects ( name )')
    .eq('profile_id', user.id);

  // subjectId → subjectName, deduped across the new table and any legacy rows.
  const coordinatedSubjects = new Map<string, string | null>();
  for (const r of (coordRows ?? []) as unknown as Array<{
    subject_id: string;
    subjects: { name: string } | null;
  }>) {
    coordinatedSubjects.set(r.subject_id, r.subjects?.name ?? null);
  }
  for (const m of memberships) {
    if (m.role === 'coordinator' && !coordinatedSubjects.has(m.subjectId)) {
      coordinatedSubjects.set(m.subjectId, m.subjectName);
    }
  }
  if (coordinatedSubjects.size === 0) return [];

  const { data: schools } = await supabase
    .from('schools')
    .select('id, name')
    .is('archived_at', null)
    .order('name');
  const activeSchools = (schools ?? []) as Array<{ id: string; name: string }>;

  const spaces: CoordinatorSpace[] = [];
  for (const [subjectId, subjectName] of coordinatedSubjects) {
    for (const s of activeSchools) {
      spaces.push({ schoolId: s.id, subjectId, schoolName: s.name, subjectName });
    }
  }
  return spaces;
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
  /** Whether this user may USE the test bar (`profiles.can_impersonate`). Real
   *  admins are eligible regardless (eligibility is `can_impersonate` OR admin),
   *  so the flag is moot for them — the modal renders admins implied-on. */
  canImpersonate: boolean;
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
    can_impersonate: boolean | null;
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
    canImpersonate: r.can_impersonate === true,
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

// ── Pending coordinator requests (admin-only) ─────────────────────────────────
// The triage list for the Users tab: users who self-requested coordinator access
// and are awaiting an admin decision. Email lives in auth.users, so this can only
// come from the `list_pending_coordinator_requests()` SECURITY DEFINER function,
// which hard-gates on is_admin(). Approve/reject mint (or don't) a
// coordinator_subject row through the paired definer RPCs.

export interface PendingCoordinatorRequest {
  requestId: string;
  profileId: string;
  fullName: string | null;
  email: string | null;
  subjectId: string;
  subjectName: string | null;
  createdAt: string;
}

/**
 * Pending coordinator-access requests, newest first. Returns `[]` on any read
 * failure (the section simply doesn't render) rather than throwing — the Users
 * tab must still load if this optional triage list can't be fetched. The RPC
 * itself raises for non-admins (belt-and-braces with the admin-gated tab).
 */
export async function getPendingCoordinatorRequests(): Promise<PendingCoordinatorRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_pending_coordinator_requests');
  if (error) return [];

  const rows = (data ?? []) as Array<{
    request_id: string;
    profile_id: string;
    full_name: string | null;
    email: string | null;
    subject_id: string;
    subject_name: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    requestId: r.request_id,
    profileId: r.profile_id,
    fullName: r.full_name,
    email: r.email,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    createdAt: r.created_at,
  }));
}

// ── Members & roles (coordinator) ──────────────────────────────────────────────
// The coordinator-facing roster, re-skinned to match the admin Users tab but scoped
// to the caller's coordinated subject(s). One row per teacher (the per-school
// cartesian is collapsed — coordinator authority is school-agnostic). Email lives in
// auth.users, so this can only come from the `list_subject_members()` SECURITY
// DEFINER function, which intrinsically scopes to the caller's coordinator_subject
// rows (a non-coordinator gets nothing) and returns teachers only — never other
// coordinators or admins. Filtering/search happen client-side in the tab.

/** One coordinated-subject space a teacher belongs to. `membershipIds` are the
 *  teacher's `subject_membership` rows in that subject (one per school) — what a
 *  coordinator deletes to remove them from the subject (RLS-gated). */
export interface SubjectMemberSpace {
  subjectId: string;
  subjectName: string | null;
  membershipIds: string[];
}

export interface SubjectMember {
  userId: string;
  fullName: string | null;
  email: string | null;
  /** Global role from `profiles` (`user_role`) — distinct from `membership_role`.
   *  In practice always 'teacher' here (coordinators/admins are excluded), but
   *  surfaced faithfully from the RPC. */
  role: MembershipRole | 'admin';
  isDeactivated: boolean;
  spaces: SubjectMemberSpace[];
}

/**
 * Teachers within the caller's coordinated subject(s), for the coordinator Members
 * tab. Throws only on a hard failure; the RPC scopes itself to the caller and raises
 * only for a deactivated caller (belt-and-braces — a deactivated user can't reach
 * the tab). Rows arrive already normalised to camelCase.
 */
export async function getSubjectMembers(): Promise<SubjectMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_subject_members');
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
    role: MembershipRole | 'admin';
    is_deactivated: boolean;
    spaces:
      | Array<{ subject_id: string; subject: string | null; membership_ids: string[] | null }>
      | null;
  }>;

  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    role: r.role,
    isDeactivated: r.is_deactivated,
    spaces: (r.spaces ?? []).map((s) => ({
      subjectId: s.subject_id,
      subjectName: s.subject,
      membershipIds: s.membership_ids ?? [],
    })),
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
  /**
   * LIVE count of active rows with no daily outcome, computed from `curriculum_lesson`
   * — not the stored `curriculum_sync_run.unresolved` (a point-in-time parse count that
   * can drift). Drives the "Review N unresolved" inspector so the number and the list
   * always agree with the current table.
   */
  unresolvedLive: number;
}

/**
 * Latest sync run per subject. `subjectIds` scopes the list (coordinator → their
 * own subjects); omitted → all non-archived subjects (admin).
 */
export async function getCurriculumStatus(
  subjectIds?: string[],
): Promise<CurriculumSubjectStatus[]> {
  const supabase = await createClient();
  const [{ data: subjects }, { data: runs }, { data: unresolvedRows }] = await Promise.all([
    supabase.from('subjects').select('id, name, code').is('archived_at', null).order('name'),
    supabase
      .from('curriculum_sync_run')
      .select('subject_code, status, rows_upserted, rows_deactivated, unresolved, started_at, finished_at, error')
      .order('started_at', { ascending: false }),
    // Live "unresolved" per subject: active rows with no daily outcome. Cheap (a few
    // hundred single-column rows) and always current, unlike the stored run count.
    supabase.from('curriculum_lesson').select('subject_code').eq('is_active', true).is('daily_outcome', null),
  ]);

  const unresolvedByCode = new Map<string, number>();
  for (const r of (unresolvedRows ?? []) as Array<{ subject_code: string }>) {
    unresolvedByCode.set(r.subject_code, (unresolvedByCode.get(r.subject_code) ?? 0) + 1);
  }

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
      unresolvedLive: unresolvedByCode.get(s.code) ?? 0,
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
