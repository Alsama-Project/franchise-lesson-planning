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
import type { PlanStatus } from '@/types/lesson';
import type {
  ClassWeek,
  CurriculumTarget,
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
  status: PlanStatus;
  review_note: string | null;
}

/** Resolve a curriculum key to its daily LO + theme, or null if unknown. */
function resolveTarget(curriculumLessonId: string): CurriculumTarget | null {
  const lesson = getLessonById(curriculumLessonId);
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

  // Display name from the profile, falling back to the auth email.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const teacherName = profile?.full_name ?? user.email ?? 'there';

  // Assigned classes via class_teachers → classes (+ school, subject). RLS
  // limits class_teachers rows to this teacher.
  const { data: ctRows } = await supabase
    .from('class_teachers')
    .select(
      'classes ( id, year, group_label, schools ( name ), subjects ( name ) )',
    )
    .eq('teacher_id', user.id);

  // database.types.ts is still a placeholder (`Database = Record<string, never>`),
  // so the client can't infer the nested select shape — narrow it by hand. The
  // embeds are all many-to-one, so each resolves to a single object at runtime.
  const ctNarrowed = (ctRows ?? []) as unknown as Array<{ classes: ClassRow | null }>;
  const classRows: ClassRow[] = ctNarrowed
    .map((row) => row.classes)
    .filter((c): c is ClassRow => c != null);

  // Stable, readable order: by year then group label.
  classRows.sort((a, b) => a.year - b.year || a.group_label.localeCompare(b.group_label));

  const context = (() => {
    const first = classRows[0];
    const school = first?.schools?.name;
    const subject = first?.subjects?.name;
    if (school && subject) return `${school} · ${subject}`;
    return school ?? subject ?? null;
  })();

  // Plans for those classes within the week. RLS already restricts visibility,
  // but we scope by class + date range to keep the query tight.
  let planRows: PlanRow[] = [];
  if (classRows.length > 0) {
    const { data: plans } = await supabase
      .from('lesson_plans')
      .select('id, class_id, curriculum_lesson_id, lesson_date, status, review_note')
      .in('class_id', classRows.map((c) => c.id))
      .gte('lesson_date', dates.mon)
      .lte('lesson_date', dates.fri);
    planRows = (plans ?? []) as unknown as PlanRow[];
  }

  // Index plans by `${classId}:${weekday}` for O(1) slot lookup.
  const planByCell = new Map<string, PlanRow>();
  for (const plan of planRows) {
    const weekday = weekdayOf(plan.lesson_date);
    if (!weekday) continue; // weekend / out of range — ignore defensively
    planByCell.set(`${plan.class_id}:${weekday}`, plan);
  }

  const classes: ClassWeek[] = classRows.map((c) => {
    const slots: WeekSlot[] = WEEKDAYS.map((weekday) => {
      const date = dates[weekday];
      const plan = planByCell.get(`${c.id}:${weekday}`);
      const slotPlan: SlotPlan | null = plan
        ? { id: plan.id, status: plan.status, reviewNote: plan.review_note }
        : null;
      return {
        weekday,
        date,
        isToday: date === today,
        plan: slotPlan,
        status: plan ? plan.status : 'not_started',
        target: plan ? resolveTarget(plan.curriculum_lesson_id) : null,
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
