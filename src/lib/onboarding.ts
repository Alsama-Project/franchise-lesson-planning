// Server-side data for the onboarding + settings flows.
//
// Everything goes through the auth'd, cookie-bound Supabase client, so RLS
// scopes the reads. Note on counts: `subject_membership` is RLS-scoped (sm_read)
// to spaces the caller already belongs to, so teacher counts are only visible
// for the caller's own spaces — a brand-new user sees 0 until they join. The
// `classes` table is readable by every authenticated user, so class counts are
// always accurate. (A non-sensitive public aggregate would need a new RPC, which
// is intentionally out of scope here — we don't expand the locked schema.)

import { createClient } from '@/lib/supabase/server';

export type Literacy = 'literate' | 'illiterate' | 'mixed';

export interface Centre {
  id: string;
  name: string;
}

export interface SubjectOption {
  id: string;
  name: string;
}

export interface ClassOption {
  id: string;
  schoolId: string;
  subjectId: string;
  subjectName: string | null;
  year: number;
  groupLabel: string;
  literacy: Literacy;
}

/** A `${schoolId}:${subjectId}` → count map. */
export type SpaceCounts = Record<string, number>;

export interface OnboardingData {
  fullName: string;
  centres: Centre[];
  subjects: SubjectOption[];
  classes: ClassOption[];
  /** Teacher count per `${schoolId}:${subjectId}` (RLS-scoped — see file note). */
  teacherCounts: SpaceCounts;
  /** Class count per `${schoolId}:${subjectId}` (fully visible). */
  classCounts: SpaceCounts;
}

const key = (schoolId: string, subjectId: string) => `${schoolId}:${subjectId}`;

interface ClassRow {
  id: string;
  school_id: string;
  subject_id: string;
  year: number;
  group_label: string;
  literacy: Literacy;
  subjects: { name: string } | null;
}

/**
 * Everything the onboarding card and the settings page need to render the
 * pickers in one payload: the centres, the global subject list, every class
 * (the client filters by centre + chosen subjects), and the two count maps.
 */
export async function getOnboardingData(): Promise<OnboardingData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: OnboardingData = {
    fullName: '',
    centres: [],
    subjects: [],
    classes: [],
    teacherCounts: {},
    classCounts: {},
  };
  if (!user) return empty;

  const [{ data: profile }, { data: schools }, { data: subjects }, { data: classes }, { data: members }] =
    await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase.from('schools').select('id, name').order('name'),
      supabase.from('subjects').select('id, name').order('name'),
      supabase
        .from('classes')
        .select('id, school_id, subject_id, year, group_label, literacy, subjects ( name )')
        .order('year'),
      supabase.from('subject_membership').select('school_id, subject_id'),
    ]);

  const classRows = (classes ?? []) as unknown as ClassRow[];
  const memberRows = (members ?? []) as Array<{ school_id: string; subject_id: string }>;

  const teacherCounts: SpaceCounts = {};
  for (const m of memberRows) {
    const k = key(m.school_id, m.subject_id);
    teacherCounts[k] = (teacherCounts[k] ?? 0) + 1;
  }

  const classCounts: SpaceCounts = {};
  for (const c of classRows) {
    const k = key(c.school_id, c.subject_id);
    classCounts[k] = (classCounts[k] ?? 0) + 1;
  }

  return {
    fullName: (profile as { full_name: string | null } | null)?.full_name ?? '',
    centres: (schools ?? []) as Centre[],
    subjects: (subjects ?? []) as SubjectOption[],
    classes: classRows.map((c) => ({
      id: c.id,
      schoolId: c.school_id,
      subjectId: c.subject_id,
      subjectName: c.subjects?.name ?? null,
      year: c.year,
      groupLabel: c.group_label,
      literacy: c.literacy,
    })),
    teacherCounts,
    classCounts,
  };
}

export interface MyClass {
  id: string;
  schoolId: string;
  subjectId: string;
  subjectName: string | null;
  year: number;
  groupLabel: string;
  literacy: Literacy;
}

/** The class rows the signed-in user teaches (`class_teachers`), for settings. */
export async function getMyClasses(): Promise<MyClass[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('class_teachers')
    .select(
      'class_id, classes ( id, school_id, subject_id, year, group_label, literacy, subjects ( name ) )',
    )
    .eq('teacher_id', user.id);

  const rows = (data ?? []) as unknown as Array<{ classes: ClassRow | null }>;
  return rows
    .map((r) => r.classes)
    .filter((c): c is ClassRow => c !== null)
    .map((c) => ({
      id: c.id,
      schoolId: c.school_id,
      subjectId: c.subject_id,
      subjectName: c.subjects?.name ?? null,
      year: c.year,
      groupLabel: c.group_label,
      literacy: c.literacy,
    }));
}

/** Count of the caller's own `subject_membership` rows — drives the gate. */
export async function getMembershipCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from('subject_membership')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', user.id);

  return count ?? 0;
}
