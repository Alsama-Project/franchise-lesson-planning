// Data layer for the Weekly Overview — the read view of a teacher's week.
//
// Everything here goes through the auth'd, cookie-bound Supabase client, so RLS
// scopes the reads to the signed-in teacher: their own profile, the classes they
// are assigned to (class_teachers), and the lesson_plans they may see. The
// service-role key is never used on this path.

import { createClient } from '@/lib/supabase/server';
import { getLessonById } from '@/lib/curriculumUtils';
import {
  WEEKDAYS,
  formatWeekRange,
  todayISO,
  weekdayDates,
  weekdayOf,
} from '@/lib/week';
import { initialsOf } from '@/components/weekly-overview/avatar';
import type { PlanStatus } from '@/types/lesson';
import type {
  ClassWeek,
  CurriculumTarget,
  PlanOwner,
  SlotPlan,
  WeekSlot,
  WeeklyOverview,
} from '@/types/weekly-overview';

// Rows as returned by the (currently untyped) Supabase client. We hand-narrow
// the nested selects below; database.types.ts is a placeholder until gen:types
// runs against a live DB.
interface ClassRow {
  id: string;
  year: number;
  group_label: string;
  schools: { name: string } | null;
  subjects: { name: string } | null;
}

interface PlanRow {
  id: string;
  class_id: string;
  curriculum_lesson_id: string;
  lesson_date: string;
  period: number | null;
  status: PlanStatus;
  review_note: string | null;
  created_by: string;
}

// A plan row with its class embedded — the shape of the week's `lesson_plans`
// query below. The class embed lets the grid show plans for classes the caller
// can see via RLS (e.g. an admin, or a subject coordinator) even when they are
// not enrolled in `class_teachers` for them.
interface PlanRowWithClass extends PlanRow {
  classes: ClassRow | null;
}

/** Resolve a curriculum key to its daily LO + theme, or null if unknown. */
async function resolveTarget(curriculumLessonId: string): Promise<CurriculumTarget | null> {
  const lesson = await getLessonById(curriculumLessonId);
  if (!lesson) return null;
  // Some keys (exam slots) map to multiple year rows; the first carries the
  // headline we need for the slot.
  const one = Array.isArray(lesson) ? lesson[0] : lesson;
  if (!one) return null;
  return { dailyLO: one.dailyLO, theme: one.theme };
}

/**
 * Load the signed-in teacher's week: every class they are assigned to, with a
 * Monday–Friday slot per class carrying any plan, its status, and the plan's
 * resolved curriculum target. `weekStart` must be the Monday of the week.
 */
export async function getWeeklyOverview(weekStart: string): Promise<WeeklyOverview> {
  const supabase = await createClient();
  const dates = weekdayDates(weekStart);
  const today = todayISO();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const weekLabel = formatWeekRange(weekStart);

  // No session shouldn't happen (the proxy protects this route), but stay safe.
  if (!user) {
    return {
      weekStart,
      weekLabel,
      teacherName: 'there',
      context: null,
      planCount: 0,
      classes: [],
    };
  }

  // Three independent reads — the profile (display name), the caller's own
  // assigned classes (`class_teachers`), and every plan they may see this week —
  // depend only on the user id and week, so fetch them in parallel. RLS scopes
  // each: own `class_teachers` rows, and the `lesson_plans` they can read.
  //
  // The plan query is NOT pre-filtered to `class_teachers` classes: visibility is
  // RLS's job, and the access model now grants it via subject membership / admin,
  // not just `class_teachers`. Pre-filtering here would hide plans an admin or
  // subject coordinator can legitimately see. The class is embedded so those
  // plans' classes can join the grid even when the caller doesn't teach them.
  const [{ data: profile }, { data: ctRows }, { data: plans }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase
      .from('class_teachers')
      .select(
        'classes ( id, year, group_label, schools ( name ), subjects ( name ) )',
      )
      .eq('teacher_id', user.id),
    supabase
      .from('lesson_plans')
      .select(
        'id, class_id, curriculum_lesson_id, lesson_date, period, status, review_note, created_by, classes ( id, year, group_label, schools ( name ), subjects ( name ) )',
      )
      .gte('lesson_date', dates.mon)
      .lte('lesson_date', dates.fri),
  ]);

  const teacherName = profile?.full_name ?? user.email ?? 'there';

  // database.types.ts is still a placeholder (`Database = Record<string, never>`),
  // so the client can't infer the nested select shape — narrow it by hand. The
  // embeds are all many-to-one, so each resolves to a single object at runtime.
  const ctNarrowed = (ctRows ?? []) as unknown as Array<{ classes: ClassRow | null }>;
  const planRowsWithClass = (plans ?? []) as unknown as PlanRowWithClass[];
  const planRows: PlanRow[] = planRowsWithClass;

  // The grid's class set is the union of the caller's own classes and the classes
  // referenced by the plans they can see this week — so empty (unplanned) classes
  // still show as "Not started" columns, while plans on classes the caller
  // doesn't teach (admin / coordinator views) appear too. Dedup by class id.
  const classById = new Map<string, ClassRow>();
  for (const row of ctNarrowed) {
    if (row.classes) classById.set(row.classes.id, row.classes);
  }
  for (const plan of planRowsWithClass) {
    if (plan.classes) classById.set(plan.classes.id, plan.classes);
  }
  const classRows: ClassRow[] = [...classById.values()];

  // Stable, readable order: by year then group label.
  classRows.sort((a, b) => a.year - b.year || a.group_label.localeCompare(b.group_label));

  const context = (() => {
    const first = classRows[0];
    const school = first?.schools?.name;
    const subject = first?.subjects?.name;
    if (school && subject) return `${school} · ${subject}`;
    return school ?? subject ?? null;
  })();

  // Index plans by `${classId}:${weekday}` for O(1) slot lookup.
  const planByCell = new Map<string, PlanRow>();
  for (const plan of planRows) {
    const weekday = weekdayOf(plan.lesson_date);
    if (!weekday) continue; // weekend / out of range — ignore defensively
    planByCell.set(`${plan.class_id}:${weekday}`, plan);
  }

  // Resolve curriculum targets up front (the slot map below is synchronous). The
  // curriculum read is cached and deduped per id, so this is a handful of lookups.
  const targetByKey = new Map<string, CurriculumTarget | null>();
  await Promise.all(
    [...new Set(planRows.map((p) => p.curriculum_lesson_id))].map(async (id) => {
      targetByKey.set(id, await resolveTarget(id));
    }),
  );

  // Resolve plan owners (the "whose plan" avatar + people filter). One read for
  // the distinct creators across this week's visible plans. The co-member profiles
  // policy (migration 0013) lets a member read a teammate's id + full_name when
  // they share a (school, subject) space; the auth'd client keeps it RLS-scoped.
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

  const classes: ClassWeek[] = classRows.map((c) => {
    const slots: WeekSlot[] = WEEKDAYS.map((weekday) => {
      const date = dates[weekday];
      const plan = planByCell.get(`${c.id}:${weekday}`);
      const slotPlan: SlotPlan | null = plan
        ? {
            id: plan.id,
            status: plan.status,
            period: plan.period,
            reviewNote: plan.review_note,
            owner: ownerById.get(plan.created_by) ?? null,
          }
        : null;
      return {
        weekday,
        date,
        isToday: date === today,
        plan: slotPlan,
        status: plan ? plan.status : 'not_started',
        target: plan ? targetByKey.get(plan.curriculum_lesson_id) ?? null : null,
      };
    });

    return {
      classId: c.id,
      year: c.year,
      groupLabel: c.group_label,
      schoolName: c.schools?.name ?? '',
      subjectName: c.subjects?.name ?? '',
      label: `Year ${c.year} · ${c.group_label}`,
      slots,
    };
  });

  return {
    weekStart,
    weekLabel,
    teacherName,
    context,
    planCount: planRows.length,
    classes,
  };
}
