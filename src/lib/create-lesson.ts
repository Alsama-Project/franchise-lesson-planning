import 'server-only';

// Data layer for the "+ Lesson" creation flow — the classes the signed-in user
// may plan for, grouped by their (centre · subject) spaces. Everything goes
// through the auth'd, RLS-scoped client. Classes are reference data (readable by
// any authenticated user), so we scope them to the caller's actual memberships
// here rather than relying on RLS to hide them.

import { createClient } from '@/lib/supabase/server';
import { getMyMemberships } from '@/lib/auth';
import type { CreatableClass, CreateSpaceGroup } from '@/components/create-lesson/types';

interface ClassRow {
  id: string;
  year: number;
  group_label: string;
  school_id: string;
  subject_id: string;
  subjects: { code: string } | null;
}

/**
 * Every class across the spaces the user belongs to, grouped by space and sorted
 * (centre then subject; within a space by year then group). The picker lists
 * these grouped under a "{Centre} · {Subject}" label. Empty when the user has no
 * memberships or none of their spaces has classes yet.
 */
export async function getCreatableClasses(): Promise<CreateSpaceGroup[]> {
  const memberships = await getMyMemberships();
  if (memberships.length === 0) return [];

  const supabase = await createClient();
  // RLS lets any authenticated user read classes; scope to the caller's spaces.
  const { data } = await supabase
    .from('classes')
    .select('id, year, group_label, school_id, subject_id, subjects ( code )');

  const rows = (data ?? []) as unknown as ClassRow[];

  // Index memberships by space so we can attach names + subject codes and keep
  // only classes in a space the user actually belongs to.
  const spaceKey = (schoolId: string, subjectId: string) => `${schoolId}:${subjectId}`;
  const groups = new Map<string, CreateSpaceGroup>();
  for (const m of memberships) {
    groups.set(spaceKey(m.schoolId, m.subjectId), {
      schoolId: m.schoolId,
      subjectId: m.subjectId,
      subjectCode: '', // filled from the class's subject join below
      schoolName: m.schoolName ?? '',
      subjectName: m.subjectName ?? '',
      label: [m.schoolName, m.subjectName].filter(Boolean).join(' · '),
      classes: [],
    });
  }

  for (const row of rows) {
    const group = groups.get(spaceKey(row.school_id, row.subject_id));
    if (!group) continue; // class in a space the user isn't a member of
    if (!group.subjectCode && row.subjects?.code) group.subjectCode = row.subjects.code;
    const cls: CreatableClass = {
      id: row.id,
      year: row.year,
      groupLabel: row.group_label,
      label: `Year ${row.year} · ${row.group_label}`,
    };
    group.classes.push(cls);
  }

  return [...groups.values()]
    .filter((g) => g.classes.length > 0)
    .map((g) => ({
      ...g,
      classes: g.classes.sort(
        (a, b) => a.year - b.year || a.groupLabel.localeCompare(b.groupLabel),
      ),
    }))
    .sort(
      (a, b) =>
        a.schoolName.localeCompare(b.schoolName) ||
        a.subjectName.localeCompare(b.subjectName),
    );
}
