import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { CurriculumPicker } from '@/components/plan-new/CurriculumPicker';
import { createClient } from '@/lib/supabase/server';
import { getMonthsWithWeeks } from '@/lib/curriculumUtils';
import { isValidISODate } from '@/lib/week';

// Rendered per-request: the class is read with the auth'd client (RLS).
export const dynamic = 'force-dynamic';

type SearchParams = { classId?: string; date?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hand-narrowed class row: database.types.ts is still a placeholder, so the
// client can't infer the nested embeds (each is many-to-one → a single object).
interface ClassRow {
  id: string;
  year: number;
  group_label: string;
  literacy: string;
  schools: { name: string } | null;
  subjects: { name: string } | null;
}

/**
 * The plan-creation bridge. A teacher arrives here from an empty "Not started"
 * slot on the Weekly Overview (`?classId=…&date=…`). We resolve the class (for
 * its year + context), short-circuit to the editor if a plan already exists for
 * that class/day, and otherwise show a curriculum picker scoped to the class's
 * year. Selecting a lesson creates the plan and redirects into the editor.
 */
export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { classId, date } = await searchParams;

  // The slot always supplies both; bail back to the overview if either is
  // missing or malformed rather than rendering an unscoped picker.
  if (!classId || !UUID_RE.test(classId) || !date || !isValidISODate(date)) {
    redirect('/');
  }

  const supabase = await createClient();

  // Class context. Reference tables are readable by any authenticated user;
  // ownership is enforced on insert by RLS, so an unassigned class can be
  // browsed but not planned.
  const { data: classData } = await supabase
    .from('classes')
    .select('id, year, group_label, literacy, schools ( name ), subjects ( name )')
    .eq('id', classId)
    .maybeSingle();

  const classRow = classData as unknown as ClassRow | null;
  if (!classRow) redirect('/');

  // If a plan already exists for this class + date, skip the picker.
  const { data: existing } = await supabase
    .from('lesson_plans')
    .select('id')
    .eq('class_id', classId)
    .eq('lesson_date', date)
    .maybeSingle();
  if (existing?.id) redirect(`/plan/${existing.id}`);

  // Display name for the shell chrome.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id ?? '')
    .maybeSingle();
  const name = profile?.full_name ?? user?.email ?? 'there';

  const schoolName = classRow.schools?.name ?? '';
  const subjectName = classRow.subjects?.name ?? '';
  const classLabel = `Year ${classRow.year} · ${classRow.group_label}`;
  const months = getMonthsWithWeeks(classRow.year);

  return (
    <AppShell
      name={name}
      subtitle={[schoolName, subjectName].filter(Boolean).join(' · ') || undefined}
    >
      <CurriculumPicker
        classId={classRow.id}
        classLabel={classLabel}
        lessonDate={date}
        year={classRow.year}
        months={months}
      />
    </AppShell>
  );
}
