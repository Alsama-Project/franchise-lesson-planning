// Data layer for the day-column planning board. The board is a per-year set of
// Mon–Fri columns: a plan appears on the board once it exists, placed by its own
// `weekday` (which column) and `period` (its position in that day's stack). The
// curriculum lessons for the selected (month · week) are the POOL the "+ Add
// lesson" picker draws from — the board groups plans by curriculum week via each
// plan's `curriculum_lesson_id`, then lays them out by weekday.
//
// Everything goes through the auth'd, cookie-bound Supabase client, so RLS scopes
// the reads: the teacher's own `class_teachers` rows, and the `lesson_plans` they
// may see (class/centre within their centre, org across centres). The service-role
// key is never used on this path.

import { createClient } from '@/lib/supabase/server';
import { resolveCurrentTermWeekNo, resolveTermWeek } from '@/lib/term-week';
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
  school_id: string;
  subject_id: string;
  role: 'teacher' | 'coordinator';
  subjects: { code: string; name: string } | null;
  schools: { name: string } | null;
}

/**
 * One `(centre, subject)` space the user belongs to — the unit the user-wide board
 * unions over. Enumerated from the user's `subject_membership` rows (the visibility
 * boundary), so the board shows every subject the user is in, not just one.
 */
interface Space {
  /** `${centreId}:${subjectId}` — the space identity (also the coordinator-set key). */
  key: string;
  centreId: string;
  subjectId: string;
  centreName: string;
  subjectCode: string;
  subjectName: string;
  isCoordinator: boolean;
}

/** English-first, then alphabetical — the order subjects surface across the app. */
function sortSubjectNames(names: string[]): string[] {
  return [...new Set(names)].sort((a, b) => {
    const ae = a.toLowerCase() === 'english';
    const be = b.toLowerCase() === 'english';
    if (ae !== be) return ae ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** The empty board shown when there's no session or no teaching assignment. */
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
    weeks: [],
    years: [],
    owners: [],
    planCount: 0,
    hasClasses: false,
    boardReadOnly: false,
    myClassesByYear: {},
  };
}

/**
 * Load the planning board for the signed-in teacher at a curriculum coordinate.
 *
 * `month`/`week` select the curriculum coordinate; when omitted (or out of range)
 * the first synced coordinate for the teacher's subject is used. The board's
 * subject space comes from the teacher's classes when they have any, else from a
 * (centre, subject) membership — so visibility never depends on class assignment.
 * It shows one band per year (the taught years, or every curriculum year of the
 * space for a member with no class); each band carries the plans placed this week
 * (laid out into Mon–Fri columns by their `weekday`/`period`) and the curriculum
 * lessons for the coordinate (the "+ Add lesson" pool). Plan visibility itself is
 * enforced by RLS on `lesson_plans` (subject-membership + scope), not re-filtered
 * here.
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

  // Identity, the teacher's own classes (taught years + subject), and their
  // memberships (coordinator spaces) depend only on the user id — fetch together.
  const [{ data: profile }, { data: ctRows }, { data: memRows }] = await Promise.all([
    supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle(),
    supabase
      .from('class_teachers')
      .select(
        'classes ( id, year, archived_at, school_id, subject_id, schools ( name ), subjects ( code, name ) )',
      )
      .eq('teacher_id', user.id),
    supabase
      .from('subject_membership')
      .select('school_id, subject_id, role, subjects ( code, name ), schools ( name )')
      .eq('profile_id', user.id),
  ]);

  const teacherName =
    (profile as { full_name?: string | null } | null)?.full_name ?? user.email ?? 'there';
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin';

  // The teacher's (non-archived) classes. They define the taught years within each
  // space — but membership, NOT class assignment, is the visibility boundary (see
  // below). Archived classes are removed from planning.
  const taught = ((ctRows ?? []) as unknown as Array<{ classes: TaughtClassRow | null }>)
    .map((r) => r.classes)
    .filter((c): c is TaughtClassRow => !!c && !c.archived_at);

  // The (centre, subject) spaces the teacher belongs to. A member of "English at
  // Shatila" sees that space's lessons — centre- and year-scoped plans (no class)
  // included — whether or not they teach a class in it. Visibility is gated on this
  // membership plus each plan's scope, never on class membership.
  const memberships = (memRows ?? []) as unknown as MembershipRow[];

  // The coordinator spaces the teacher belongs to — drives per-plan edit rights.
  const coordinatorSpaces = new Set(
    memberships
      .filter((m) => m.role === 'coordinator')
      .map((m) => `${m.school_id}:${m.subject_id}`),
  );

  // Enumerate every space the user belongs to — the board is USER-WIDE, so it unions
  // over all of them rather than collapsing to one subject. Memberships are the
  // authoritative list; a class in a space with no matching membership (a data edge)
  // is folded in defensively so a taught class is never dropped.
  const spaceMap = new Map<string, Space>();
  for (const m of memberships) {
    const key = `${m.school_id}:${m.subject_id}`;
    if (spaceMap.has(key)) continue;
    spaceMap.set(key, {
      key,
      centreId: m.school_id,
      subjectId: m.subject_id,
      centreName: m.schools?.name ?? '',
      subjectCode: m.subjects?.code ?? '',
      subjectName: m.subjects?.name ?? '',
      isCoordinator: m.role === 'coordinator',
    });
  }
  for (const c of taught) {
    const key = `${c.school_id}:${c.subject_id}`;
    if (spaceMap.has(key)) continue;
    spaceMap.set(key, {
      key,
      centreId: c.school_id,
      subjectId: c.subject_id,
      centreName: c.schools?.name ?? '',
      subjectCode: c.subjects?.code ?? '',
      subjectName: c.subjects?.name ?? '',
      isCoordinator: coordinatorSpaces.has(key),
    });
  }
  const spaces = [...spaceMap.values()];

  // No classes and no subject membership — nothing to plan against.
  if (spaces.length === 0) return emptyBoard(teacherName);

  // Whether the board describes one space or many — drives the header prefix (kept
  // only for a single space) and the per-card centre label (shown only across >1
  // centre). A single-subject, single-centre user's board is unchanged.
  const distinctCentreIds = new Set(spaces.map((s) => s.centreId));
  const distinctSubjectCodes = new Set(spaces.map((s) => s.subjectCode));
  const spansMultipleCentres = distinctCentreIds.size > 1;
  const spansMultipleSubjects = distinctSubjectCodes.size > 1;
  const isSingleSpace = spaces.length === 1;

  const subjectNames = sortSubjectNames(spaces.map((s) => s.subjectName).filter(Boolean));

  // Per space, the years shown. A teacher with classes in the space sees the years
  // they teach there; a no-class member sees every year the subject's curriculum
  // covers. Same "years you teach" rule as before, just resolved per space.
  const candidateYears = [0, 1, 2, 3, 4, 5, 6];
  const spaceYears = new Map<string, number[]>();
  await Promise.all(
    spaces.map(async (s) => {
      const classYears = [
        ...new Set(
          taught
            .filter((c) => c.school_id === s.centreId && c.subject_id === s.subjectId)
            .map((c) => c.year),
        ),
      ].sort((a, b) => a - b);
      if (classYears.length > 0) {
        spaceYears.set(s.key, classYears);
        return;
      }
      const navProbe = await Promise.all(candidateYears.map((y) => getCurriculumNav(s.subjectCode, y)));
      spaceYears.set(
        s.key,
        candidateYears.filter((_, i) => navProbe[i].length > 0),
      );
    }),
  );

  // The bands: one per (space, year). On a single-subject single-centre board this
  // is exactly "one band per taught year" as before. Sorted subject → centre → year.
  type Band = Space & { year: number; bandKey: string /* centreId|subjectCode|year */ };
  const bands: Band[] = spaces
    .flatMap((s) => (spaceYears.get(s.key) ?? []).map((year) => ({
      ...s,
      year,
      bandKey: `${s.centreId}|${s.subjectCode}|${year}`,
    })))
    .sort(
      (a, b) =>
        a.subjectName.localeCompare(b.subjectName) ||
        a.centreName.localeCompare(b.centreName) ||
        a.year - b.year,
    );

  // The teacher's own classes, grouped by year — legacy field, kept populated.
  const myClassesByYear: Record<number, BoardClass[]> = {};
  for (const c of taught) {
    (myClassesByYear[c.year] ??= []).push({ id: c.id, label: `Year ${c.year}` });
  }
  for (const list of Object.values(myClassesByYear)) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  // The board is a coordinator's read-only review surface only for a SINGLE space
  // the viewer coordinates (unchanged behaviour). A user-wide board spanning several
  // spaces is the teacher's own planning surface; per-plan `canEdit` still gates
  // each card, and RLS still blocks writing another teacher's plan.
  const boardReadOnly = isSingleSpace && spaces[0].isCoordinator;

  const context = isSingleSpace
    ? [spaces[0].centreName, spaces[0].subjectName].filter(Boolean).join(' · ') || null
    : null;

  // Per-subject download targets: each subject's union of years across its centres.
  const downloadYears = new Map<string, { subjectName: string; years: Set<number> }>();
  for (const band of bands) {
    const entry = downloadYears.get(band.subjectCode) ?? {
      subjectName: band.subjectName,
      years: new Set<number>(),
    };
    entry.years.add(band.year);
    downloadYears.set(band.subjectCode, entry);
  }
  const downloadSubjects = [...downloadYears.entries()]
    .map(([subjectCode, e]) => ({
      subjectCode,
      subjectName: e.subjectName,
      years: [...e.years].sort((a, b) => a - b),
    }))
    .sort((a, b) => {
      const ae = a.subjectName.toLowerCase() === 'english';
      const be = b.subjectName.toLowerCase() === 'english';
      if (ae !== be) return ae ? -1 : 1;
      return a.subjectName.localeCompare(b.subjectName);
    });

  // Build the ordered list of curriculum coordinates across every band's
  // (subject, year), so prev/next step through the union scheme of work. The
  // curriculum is identical per (subject, year) regardless of centre, so probe each
  // distinct (subject, year) once.
  const distinctSubjectYear = new Map<string, { subjectCode: string; year: number }>();
  for (const band of bands) {
    distinctSubjectYear.set(`${band.subjectCode}|${band.year}`, {
      subjectCode: band.subjectCode,
      year: band.year,
    });
  }
  const navList = [...distinctSubjectYear.values()];
  const navs = await Promise.all(navList.map((sy) => getCurriculumNav(sy.subjectCode, sy.year)));
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
    .flatMap(([month, weeks]) =>
      [...weeks].sort((a, b) => a - b).map((week) => ({ month, week })),
    );

  // Nothing synced for ANY of the user's subjects/years yet → an empty-but-valid
  // board (year shells per band). The empty state reads user-wide from `subjectNames`.
  if (coords.length === 0) {
    return {
      ...emptyBoard(teacherName),
      context,
      subjectNames,
      spansMultipleSubjects,
      spansMultipleCentres,
      downloadSubjects,
      hasClasses: true,
      boardReadOnly,
      years: bands.map((b) => ({
        key: b.bandKey,
        year: b.year,
        centreId: b.centreId,
        centreName: b.centreName,
        subjectCode: b.subjectCode,
        subjectName: b.subjectName,
        plans: [],
        lessons: [],
      })),
      myClassesByYear,
    };
  }

  // The month → week picker's options: every coordinate in scheme-of-work order,
  // each tagged with its flat teaching-week number (position + 1). This is the
  // SAME ordering that derives `weekNo` below, so picker and arrows never disagree.
  const weeks: BoardWeekOption[] = coords.map((c, i) => ({
    month: c.month,
    week: c.week,
    weekNo: i + 1,
  }));

  // Resolve the selected coordinate from the params (snap to a real one). With no
  // (or an unrecognised) coordinate in the URL, land on the week containing today in
  // Asia/Beirut — resolved via `term_week` — rather than always the first week. When
  // today sits outside every seeded term (holidays, or an unseeded table), fall back
  // to the first week as before.
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

  // The 1-based teaching-week number = the coordinate's position in the ordered
  // scheme of work (Month 1 Week 1 = 1, …). This needs no dates — it's the key
  // into `term_week` for the real Monday + "current" flag (see resolveTermWeek,
  // the single, temporary point of date resolution).
  const weekNo = index + 1;
  const { mondayDate, isCurrent } = await resolveTermWeek(supabase, weekNo);

  // The curriculum lessons (P1..P5) for the selected coordinate, per subject, across
  // that subject's years — the "+ Add lesson" pool and the join target for the
  // plans. Resolve once per subject (curriculum is per (subject, year), centre-
  // independent) and merge into union lookups keyed by lesson key.
  const yearsBySubject = new Map<string, number[]>();
  for (const sy of navList) {
    const list = yearsBySubject.get(sy.subjectCode) ?? [];
    list.push(sy.year);
    yearsBySubject.set(sy.subjectCode, list);
  }
  const slotKeys = new Set<string>();
  const periodByKey = new Map<string, number>();
  const outcomeByKey = new Map<string, string>();
  const subjectByKey = new Map<string, { subjectCode: string; subjectName: string }>();
  // lessons per (subjectCode|year), assigned to every centre's band for that pair.
  const lessonsBySubjectYear = new Map<string, BoardLesson[]>();
  const subjectCodes = [...yearsBySubject.keys()];
  const subjectNameByCode = new Map(spaces.map((s) => [s.subjectCode, s.subjectName]));
  await Promise.all(
    subjectCodes.map(async (code) => {
      const yearList = (yearsBySubject.get(code) ?? []).slice().sort((a, b) => a - b);
      const resolved = await resolveWeekSlotKeys(code, yearList, coordinate.month, coordinate.week);
      const subjectName = subjectNameByCode.get(code) ?? '';
      for (const k of resolved.slotKeys) slotKeys.add(k);
      for (const [k, v] of resolved.periodByKey) periodByKey.set(k, v);
      for (const [k, v] of resolved.outcomeByKey) outcomeByKey.set(k, v);
      resolved.cellsByYear.forEach((cells, i) => {
        const year = yearList[i];
        lessonsBySubjectYear.set(
          `${code}|${year}`,
          cells.map((cell) => ({
            lessonKey: cell.lessonKey,
            period: cell.period,
            dailyOutcome: cell.dailyOutcome,
            focusArea: cell.focusArea,
          })),
        );
        for (const cell of cells) subjectByKey.set(cell.lessonKey, { subjectCode: code, subjectName });
      });
    }),
  );

  // All plans (any scope) the teacher can see whose curriculum_lesson_id is one of
  // the week's lesson keys — the union across every subject/year. RLS enforces
  // visibility; there is intentionally no subject_id predicate here.
  const planRows = await selectWeekPlanRows<PlanRow>(
    supabase,
    slotKeys,
    'id, curriculum_lesson_id, scope, class_id, school_id, subject_id, year, weekday, period, status, review_note, created_by',
  );

  // Resolve plan owners (avatar). One read for the distinct creators; the co-member
  // profiles policy (0013) lets a teammate's id + name be read within a shared space.
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

  const canEdit = (p: PlanRow): boolean =>
    p.created_by === user.id ||
    isAdmin ||
    (!!p.school_id && !!p.subject_id && coordinatorSpaces.has(`${p.school_id}:${p.subject_id}`));

  // Index bands by (subjectCode|year) so a plan finds its band(s) by subject+year,
  // then the matching centre (or, for an org plan, the first band that subject/year).
  const bandsBySubjectYear = new Map<string, Band[]>();
  for (const band of bands) {
    const k = `${band.subjectCode}|${band.year}`;
    (bandsBySubjectYear.get(k) ?? bandsBySubjectYear.set(k, []).get(k)!).push(band);
  }

  // Turn each visible plan into a placed board card, attributed to its band. A plan
  // whose (subject, year) — or, when centre-scoped, whose centre — is outside the
  // user's taught scope is dropped: the union of lesson keys can surface a same-
  // subject plan for a year/centre the teacher doesn't teach, which stays off-board.
  const plansByBand = new Map<string, BoardPlan[]>();
  for (const p of planRows) {
    if (p.year == null) continue;
    const subjectInfo = subjectByKey.get(p.curriculum_lesson_id);
    if (!subjectInfo) continue;
    const candidates = bandsBySubjectYear.get(`${subjectInfo.subjectCode}|${p.year}`);
    if (!candidates || candidates.length === 0) continue;
    const isOrg = p.scope === 'org' || !p.school_id;
    const band = isOrg ? candidates[0] : candidates.find((b) => b.centreId === p.school_id);
    if (!band) continue; // centre-scoped plan for a centre the teacher doesn't teach here

    const curriculumPeriod = periodByKey.get(p.curriculum_lesson_id) ?? 1;
    const plan: BoardPlan = {
      id: p.id,
      lessonKey: p.curriculum_lesson_id,
      year: p.year,
      subjectCode: subjectInfo.subjectCode,
      subjectName: subjectInfo.subjectName,
      // Centre label only when the user spans centres AND the plan sits in one
      // centre; an org ("all centres") plan carries no centre (its scope says so).
      centreName: spansMultipleCentres && !isOrg ? band.centreName : null,
      groupKey: band.bandKey,
      weekday: clampWeekday(p.weekday ?? curriculumPeriod),
      period: p.period ?? curriculumPeriod,
      status: p.status,
      scope: p.scope,
      owner: ownerById.get(p.created_by) ?? null,
      canEdit: canEdit(p),
      reviewNote: p.review_note,
      dailyOutcome: outcomeByKey.get(p.curriculum_lesson_id) ?? '',
    };
    (plansByBand.get(band.bandKey) ?? plansByBand.set(band.bandKey, []).get(band.bandKey)!).push(plan);
  }
  for (const list of plansByBand.values()) list.sort(byDayOrder);

  const yearBands: BoardYear[] = bands.map((band) => ({
    key: band.bandKey,
    year: band.year,
    centreId: band.centreId,
    centreName: band.centreName,
    subjectCode: band.subjectCode,
    subjectName: band.subjectName,
    plans: plansByBand.get(band.bandKey) ?? [],
    lessons: lessonsBySubjectYear.get(`${band.subjectCode}|${band.year}`) ?? [],
  }));

  // Distinct owners across the board, for the people filter.
  const owners = [...ownerById.values()].sort((a, b) => a.name.localeCompare(b.name));

  const planCount = yearBands.reduce((n, b) => n + b.plans.length, 0);

  return {
    teacherName,
    context,
    subjectNames,
    spansMultipleSubjects,
    spansMultipleCentres,
    downloadSubjects,
    coordinate,
    coordinateLabel: `${coordinate.month} · Week ${coordinate.week}`,
    weekNo,
    mondayDate,
    isCurrent,
    prev,
    next,
    weeks,
    years: yearBands,
    owners,
    planCount,
    hasClasses: true,
    boardReadOnly,
    myClassesByYear,
  };
}
