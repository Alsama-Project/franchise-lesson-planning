// Data layer for the day-column planning board. The board is a per-year set of
// Mon–Fri columns for ONE active subject: a plan appears on the board once it
// exists, placed by its own `weekday` (which column) and `period` (its position in
// that day's stack). The curriculum lessons for the selected (month · week) are the
// POOL the "+ Add lesson" picker draws from — the board groups plans by curriculum
// week via each plan's `curriculum_lesson_id`, then lays them out by weekday.
//
// VISIBILITY IS SUBJECT-BASED. A plan is keyed to a curriculum slot (subject, year,
// month/week/period); centre and class are provenance on the row, NOT a scoping
// dimension. Every teacher/coordinator of a subject sees every plan for that
// subject across all centres, each with its author label. RLS (`lp_select`,
// migration 0057) enforces exactly this; this layer no longer filters by centre.
//
// Everything goes through the auth'd, cookie-bound Supabase client, so RLS scopes
// the reads. The service-role key is never used on this path.

import { createClient } from '@/lib/supabase/server';
import { resolveActiveMembership, type MembershipFull } from '@/lib/active-space';
import { resolveCurrentTermWeekNo, resolveNearestTermWeekNo, resolveTermWeek } from '@/lib/term-week';
import { getCurriculumNav } from '@/lib/curriculumUtils';
import { resolveWeekSlotKeys, selectWeekPlanRows } from '@/lib/weekly-overview-selection';
import { initialsOf } from '@/components/weekly-overview/avatar';
import type { PlanScope, PlanStatus } from '@/types/lesson';
import type {
  BoardClass,
  BoardCoordinate,
  BoardData,
  BoardLesson,
  BoardPlan,
  BoardWeekOption,
  BoardYear,
  PlanOwner,
} from '@/types/weekly-overview';

// Calendar-month order so the prev/next arrows step through the scheme of work in
// the right sequence regardless of how rows come back from the DB.
const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthIndex(month: string): number {
  const i = MONTH_ORDER.indexOf(month);
  return i === -1 ? MONTH_ORDER.length : i;
}

// Hand-narrowed row shapes — database.types.ts is a placeholder until gen:types
// runs against a live DB, so the client can't infer the nested selects.
interface TaughtClassRow {
  id: string;
  year: number;
  archived_at: string | null;
  school_id: string;
  subject_id: string;
  schools: { name: string } | null;
  subjects: { code: string; name: string } | null;
}

interface PlanRow {
  id: string;
  curriculum_lesson_id: string;
  scope: PlanScope;
  class_id: string | null;
  school_id: string | null;
  subject_id: string | null;
  year: number | null;
  weekday: number | null;
  period: number | null;
  status: PlanStatus;
  review_note: string | null;
  created_by: string;
}

/** Clamp a value to the Mon–Fri (1–5) column range, defaulting to Monday. */
function clampWeekday(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 1;
  return Math.min(5, Math.max(1, Math.trunc(n)));
}

/** Order plans within a day stack: by stored ordinal, then scope, then owner. */
const SCOPE_ORDER: Record<PlanScope, number> = { class: 0, centre: 1, org: 2 };
function byDayOrder(a: BoardPlan, b: BoardPlan): number {
  if (a.weekday !== b.weekday) return a.weekday - b.weekday;
  if (a.period !== b.period) return a.period - b.period;
  const s = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
  if (s !== 0) return s;
  return (a.owner?.name ?? '').localeCompare(b.owner?.name ?? '');
}

interface MembershipRow {
  id: string;
  school_id: string;
  subject_id: string;
  role: 'teacher' | 'coordinator';
  is_primary: boolean;
  created_at: string;
  subjects: { code: string; name: string } | null;
  schools: { name: string } | null;
}

/** The empty board shown when there's no session or no subject to plan against. */
function emptyBoard(teacherName: string): BoardData {
  return {
    teacherName,
    context: null,
    subjectNames: [],
    spansMultipleSubjects: false,
    spansMultipleCentres: false,
    downloadSubjects: [],
    coordinate: { month: '', week: 1 },
    coordinateLabel: '—',
    weekNo: 0,
    mondayDate: null,
    isCurrent: false,
    prev: null,
    next: null,
    currentWeek: null,
    weeks: [],
    years: [],
    owners: [],
    planCount: 0,
    hasClasses: false,
    boardReadOnly: false,
    coordinatorAuthor: false,
    myClassesByYear: {},
  };
}

/**
 * Load the planning board for the signed-in user at a curriculum coordinate, for
 * their ONE active subject.
 *
 * The active subject is resolved the same way the header chip resolves the active
 * space (primary / English-first / earliest) over the user's `subject_membership`;
 * a PURE coordinator holds no membership (coordinator-ness lives school-agnostically
 * in `coordinator_subject`, migration 0040) so the board falls back to their
 * coordinated subjects, English-first — so a coordinator with no class still gets a
 * board.
 *
 * `month`/`week` select the curriculum coordinate; when omitted (or out of range)
 * the week containing today (or the first synced week) is used. The board shows one
 * band per year — the years the viewer teaches in the subject, or every curriculum
 * year of the subject for a coordinator / no-class member. Each band carries the
 * plans placed this week for that (subject, year) across ALL centres (RLS decides
 * visibility; there is no centre filter here) and the curriculum lessons for the
 * coordinate (the "+ Add lesson" pool). Each plan card carries its author label and,
 * when the board's plans span more than one centre, a provenance centre label.
 */
export async function getBoardData(input: {
  month?: string;
  week?: number;
}): Promise<BoardData> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyBoard('there');

  // Identity, the user's own classes (taught years + subject), their teacher
  // memberships, and the subjects they coordinate — all keyed on the user id.
  const [{ data: profile }, { data: ctRows }, { data: memRows }, { data: coordRows }] =
    await Promise.all([
      supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle(),
      supabase
        .from('class_teachers')
        .select(
          'classes ( id, year, archived_at, school_id, subject_id, schools ( name ), subjects ( code, name ) )',
        )
        .eq('teacher_id', user.id),
      supabase
        .from('subject_membership')
        .select(
          'id, school_id, subject_id, role, is_primary, created_at, subjects ( code, name ), schools ( name )',
        )
        .eq('profile_id', user.id),
      // coordinator_subject is the school-agnostic source of coordinator-ness (0040) —
      // the SAME source `is_coordinator_of_subject`, the review queue, and the RLS
      // policies read, so board routing can never disagree on who coordinates what.
      supabase
        .from('coordinator_subject')
        .select('subject_id, subjects ( code, name )')
        .eq('profile_id', user.id),
    ]);

  const teacherName =
    (profile as { full_name?: string | null } | null)?.full_name ?? user.email ?? 'there';
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin';

  // All the user's (non-archived) classes across every subject they teach.
  const taughtAll = ((ctRows ?? []) as unknown as Array<{ classes: TaughtClassRow | null }>)
    .map((r) => r.classes)
    .filter((c): c is TaughtClassRow => !!c && !c.archived_at);

  const memberships = (memRows ?? []) as unknown as MembershipRow[];

  // Coordinated subjects (school-agnostic): subjectId → { code, name }.
  const coordinatedSubjects = new Map<string, { code: string; name: string }>();
  for (const r of (coordRows ?? []) as unknown as Array<{
    subject_id: string;
    subjects: { code: string; name: string } | null;
  }>) {
    coordinatedSubjects.set(r.subject_id, {
      code: r.subjects?.code ?? '',
      name: r.subjects?.name ?? '',
    });
  }

  // Resolve the active TEACHER membership (primary / English-first / earliest) — the
  // same algorithm the header chip uses, so chip and board agree for teachers.
  const activeMembership = resolveActiveMembership(
    memberships.map(
      (m): MembershipFull => ({
        id: m.id,
        schoolId: m.school_id,
        subjectId: m.subject_id,
        subjectCode: m.subjects?.code ?? '',
        subjectName: m.subjects?.name ?? '',
        schoolName: m.schools?.name ?? '',
        role: m.role,
        isPrimary: m.is_primary,
        createdAt: m.created_at,
      }),
    ),
  );

  // The board's active SUBJECT. A teacher's comes from their active membership; a
  // pure coordinator's (no membership) from their coordinated subjects, English-first.
  let subjectId: string;
  let subjectCode: string;
  let subjectName: string;
  // The viewer's own centre for the subject — provenance for plans they author as a
  // teacher. Empty for a pure coordinator (who authors class-less, centre-less plans).
  let ownCentreName = '';
  if (activeMembership) {
    subjectId = activeMembership.subjectId;
    subjectCode = activeMembership.subjectCode;
    subjectName = activeMembership.subjectName;
    ownCentreName = activeMembership.schoolName;
  } else if (coordinatedSubjects.size > 0) {
    const list = [...coordinatedSubjects.entries()].map(([id, cn]) => ({
      id,
      code: cn.code,
      name: cn.name,
    }));
    const english = list.find(
      (s) => s.code.toLowerCase() === 'english' || s.name.toLowerCase() === 'english',
    );
    const pick = english ?? [...list].sort((a, b) => a.name.localeCompare(b.name))[0];
    subjectId = pick.id;
    subjectCode = pick.code;
    subjectName = pick.name;
  } else {
    // No membership and no coordinated subject — nothing to plan against.
    return emptyBoard(teacherName);
  }

  // Whether the viewer COORDINATES the active subject — drives per-card review vs
  // edit routing, born-approved authoring, and delete rights. Subject-wide.
  const coordinatorAuthor =
    coordinatedSubjects.has(subjectId) || activeMembership?.role === 'coordinator';

  // The viewer's own non-archived classes for the active subject (any centre —
  // centre is not a scope). Drives which years show and teacher authoring.
  const taught = taughtAll.filter((c) => c.subject_id === subjectId);

  // Years shown: the years the viewer teaches in the subject, else every curriculum
  // year the subject covers (a coordinator / no-class member sees them all).
  const candidateYears = [0, 1, 2, 3, 4, 5, 6];
  const classYears = [...new Set(taught.map((c) => c.year))].sort((a, b) => a - b);
  let years: number[];
  if (classYears.length > 0) {
    years = classYears;
  } else {
    const navProbe = await Promise.all(candidateYears.map((y) => getCurriculumNav(subjectCode, y)));
    years = candidateYears.filter((_, i) => navProbe[i].length > 0);
  }

  // canAuthor per year: a teacher who teaches a class that year, OR a coordinator of
  // the subject (who authors born-approved plans for any year).
  const canAuthorYear = (year: number): boolean =>
    coordinatorAuthor || taught.some((c) => c.year === year);

  const subjectNames = subjectName ? [subjectName] : [];
  const context = [ownCentreName, subjectName].filter(Boolean).join(' · ') || subjectName || null;
  const downloadSubjects = subjectCode ? [{ subjectCode, subjectName, years }] : [];

  // The viewer's own classes grouped by year — legacy scope-chooser field.
  const myClassesByYear: Record<number, BoardClass[]> = {};
  for (const c of taught) {
    (myClassesByYear[c.year] ??= []).push({ id: c.id, label: `Year ${c.year}` });
  }
  for (const list of Object.values(myClassesByYear)) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  // One year band shell (reused by the empty-coordinate return and the full return).
  const bandShell = (year: number, plans: BoardPlan[], lessons: BoardLesson[]): BoardYear => ({
    key: `${subjectCode}|${year}`,
    year,
    centreId: '', // centre is provenance on each plan now, not a band scope
    centreName: ownCentreName,
    subjectCode,
    subjectName,
    canAuthor: canAuthorYear(year),
    plans,
    lessons,
  });

  // Curriculum coordinates across the subject's years, in scheme-of-work order.
  const navs = await Promise.all(years.map((y) => getCurriculumNav(subjectCode, y)));
  const weeksByMonth = new Map<string, Set<number>>();
  for (const nav of navs) {
    for (const { month, weeks } of nav) {
      if (!weeksByMonth.has(month)) weeksByMonth.set(month, new Set());
      const set = weeksByMonth.get(month)!;
      for (const w of weeks) set.add(w);
    }
  }
  const coords: BoardCoordinate[] = [...weeksByMonth.entries()]
    .sort((a, b) => monthIndex(a[0]) - monthIndex(b[0]))
    .flatMap(([month, weeks]) => [...weeks].sort((a, b) => a - b).map((week) => ({ month, week })));

  // Nothing synced for the subject's years yet → an empty-but-valid board (year shells).
  if (coords.length === 0) {
    return {
      ...emptyBoard(teacherName),
      context,
      subjectNames,
      downloadSubjects,
      hasClasses: true,
      coordinatorAuthor,
      currentWeek: null,
      years: years.map((y) => bandShell(y, [], [])),
      myClassesByYear,
    };
  }

  // The month → week picker's options, each tagged with its flat teaching-week number.
  const weeks: BoardWeekOption[] = coords.map((c, i) => ({
    month: c.month,
    week: c.week,
    weekNo: i + 1,
  }));

  // Resolve the selected coordinate from the params (snap to a real one), else land
  // on the week containing today (Asia/Beirut) via `term_week`, else the first week.
  let index = coords.findIndex((c) => c.month === input.month && c.week === input.week);
  if (index === -1) {
    const currentWeekNo = await resolveCurrentTermWeekNo(supabase);
    index =
      currentWeekNo != null && currentWeekNo >= 1 && currentWeekNo <= coords.length
        ? currentWeekNo - 1
        : 0;
  }
  const coordinate = coords[index];
  const prev = index > 0 ? coords[index - 1] : null;
  const next = index < coords.length - 1 ? coords[index + 1] : null;

  const weekNo = index + 1;
  const { mondayDate, isCurrent } = await resolveTermWeek(supabase, weekNo);

  // The "This week" button's jump target.
  const currentWeekNo = await resolveNearestTermWeekNo(supabase);
  const currentWeek =
    currentWeekNo != null && currentWeekNo >= 1 && currentWeekNo <= coords.length
      ? coords[currentWeekNo - 1]
      : null;

  // The curriculum lessons (P1..P5) for the selected coordinate across the subject's
  // years — the "+ Add lesson" pool and the join target for the plans.
  const resolved = await resolveWeekSlotKeys(subjectCode, years, coordinate.month, coordinate.week);
  const slotKeys = resolved.slotKeys;
  const periodByKey = resolved.periodByKey;
  const outcomeByKey = resolved.outcomeByKey;
  const lessonsByYear = new Map<number, BoardLesson[]>();
  resolved.cellsByYear.forEach((cells, i) => {
    const year = years[i];
    lessonsByYear.set(
      year,
      cells.map((cell) => ({
        lessonKey: cell.lessonKey,
        period: cell.period,
        dailyOutcome: cell.dailyOutcome,
        focusArea: cell.focusArea,
      })),
    );
  });

  // All plans (any scope, any centre) the viewer can see whose curriculum_lesson_id
  // is one of the week's lesson keys. RLS (`lp_select`) enforces subject-based
  // visibility; there is intentionally no centre or created_by filter here.
  const planRows = await selectWeekPlanRows<PlanRow>(
    supabase,
    slotKeys,
    'id, curriculum_lesson_id, scope, class_id, school_id, subject_id, year, weekday, period, status, review_note, created_by',
  );

  // Resolve plan owners (avatar). The co-member profiles policy (0013/0040) lets a
  // teammate's id + name be read within a shared subject.
  const ownerById = new Map<string, PlanOwner>();
  const ownerIds = [...new Set(planRows.map((p) => p.created_by).filter(Boolean))];
  if (ownerIds.length > 0) {
    const { data: ownerRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ownerIds);
    for (const row of (ownerRows ?? []) as Array<{ id: string; full_name: string | null }>) {
      const name = row.full_name ?? 'Unknown';
      ownerById.set(row.id, { id: row.id, name, initials: initialsOf(name) });
    }
  }

  // Provenance centre names for the per-card label. The board now always spans all
  // centres; show the centre label only when the visible plans actually come from
  // more than one centre (provenance, not scope).
  const schoolNameById = new Map<string, string>();
  const schoolIds = [...new Set(planRows.map((p) => p.school_id).filter((s): s is string => !!s))];
  if (schoolIds.length > 0) {
    const { data: schoolRows } = await supabase
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);
    for (const s of (schoolRows ?? []) as Array<{ id: string; name: string | null }>) {
      schoolNameById.set(s.id, s.name ?? '');
    }
  }
  const spansMultipleCentres =
    new Set(planRows.map((p) => p.school_id).filter(Boolean)).size > 1;

  // Edit only your own (or admin). A coordinator does NOT edit others' plans — they
  // review them on /view; `canEdit = false` routes their card there.
  const canEdit = (p: PlanRow): boolean => p.created_by === user.id || isAdmin;

  // Delete (soft-delete) — mirrors the RPC gate in migration 0048: a coordinator of
  // the plan's subject (or admin) may trash any status; the author may trash only
  // their own `in_progress` draft.
  const canDelete = (p: PlanRow): boolean =>
    coordinatorAuthor || isAdmin || (p.created_by === user.id && p.status === 'in_progress');

  // Place each visible plan into its year band — by YEAR only (centre-agnostic). A
  // plan whose year isn't shown on this board is dropped (out of the year scope).
  const plansByYear = new Map<number, BoardPlan[]>();
  for (const p of planRows) {
    if (p.year == null || !years.includes(p.year)) continue;
    const curriculumPeriod = periodByKey.get(p.curriculum_lesson_id) ?? 1;
    const isOrg = p.scope === 'org' || !p.school_id;
    const plan: BoardPlan = {
      id: p.id,
      lessonKey: p.curriculum_lesson_id,
      year: p.year,
      subjectCode,
      subjectName,
      // Centre label only when the board's plans span >1 centre AND this plan sits in
      // one centre; an org / class-less plan carries no centre label.
      centreName:
        spansMultipleCentres && !isOrg && p.school_id
          ? schoolNameById.get(p.school_id) ?? null
          : null,
      groupKey: `${subjectCode}|${p.year}`,
      weekday: clampWeekday(p.weekday ?? curriculumPeriod),
      period: p.period ?? curriculumPeriod,
      status: p.status,
      scope: p.scope,
      owner: ownerById.get(p.created_by) ?? null,
      canEdit: canEdit(p),
      canDelete: canDelete(p),
      reviewNote: p.review_note,
      dailyOutcome: outcomeByKey.get(p.curriculum_lesson_id) ?? '',
    };
    (plansByYear.get(p.year) ?? plansByYear.set(p.year, []).get(p.year)!).push(plan);
  }
  for (const list of plansByYear.values()) list.sort(byDayOrder);

  const yearBands: BoardYear[] = years.map((y) =>
    bandShell(y, plansByYear.get(y) ?? [], lessonsByYear.get(y) ?? []),
  );

  // Distinct owners across the board, for the people filter.
  const owners = [...ownerById.values()].sort((a, b) => a.name.localeCompare(b.name));

  const planCount = yearBands.reduce((n, b) => n + b.plans.length, 0);

  return {
    teacherName,
    context,
    subjectNames,
    spansMultipleSubjects: false,
    spansMultipleCentres,
    downloadSubjects,
    coordinate,
    coordinateLabel: `${coordinate.month} · Week ${coordinate.week}`,
    weekNo,
    mondayDate,
    isCurrent,
    prev,
    next,
    currentWeek,
    weeks,
    years: yearBands,
    owners,
    planCount,
    hasClasses: true,
    boardReadOnly: false,
    coordinatorAuthor,
    myClassesByYear,
  };
}
