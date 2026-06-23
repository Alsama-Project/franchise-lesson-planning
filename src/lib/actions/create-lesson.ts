'use server';

// Server actions behind the "+ Lesson" create dialog: loading the curriculum
// week grid for a class, and creating the plan (with the one-plan-per-(class,date)
// guard). All writes go through the auth'd, RLS-scoped client.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isMemberOf } from '@/lib/auth';
import {
  getCurriculumNav,
  getCurriculumWeekCells,
  getLessonById,
} from '@/lib/curriculumUtils';
import { DEFAULT_BLOCKS } from '@/lib/blocks';
import { addDays } from '@/lib/week';
import type { MonthNav, PickerCell } from '@/components/create-lesson/types';
import type { PlanStatus } from '@/types/lesson';

interface ResolvedClass {
  id: string;
  year: number;
  schoolId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  label: string;
}

/** Resolve a class to the fields the picker/creator need, or null if unreadable. */
async function resolveClass(classId: string): Promise<ResolvedClass | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, year, group_label, school_id, subject_id, subjects ( code, name )')
    .eq('id', classId)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    year: number;
    group_label: string;
    school_id: string;
    subject_id: string;
    subjects: { code: string; name: string } | null;
  } | null;
  if (!row) return null;

  return {
    id: row.id,
    year: row.year,
    schoolId: row.school_id,
    subjectId: row.subject_id,
    subjectCode: row.subjects?.code ?? '',
    subjectName: row.subjects?.name ?? '',
    label: `Year ${row.year} · ${row.group_label}`,
  };
}

export interface PickerWeekResult {
  ok: boolean;
  error?: string;
  subjectName: string;
  classLabel: string;
  year: number;
  nav: MonthNav[];
  /** The month/week the grid is currently showing. */
  month: string;
  week: number;
  cells: PickerCell[];
}

/**
 * Load the curriculum week grid for a class. When `month`/`week` are omitted it
 * defaults to the first synced month + its first week. Returns `cells: []` for an
 * unsynced week (the dialog renders its empty state, never an error).
 */
export async function loadPickerWeek(input: {
  classId: string;
  month?: string;
  week?: number;
}): Promise<PickerWeekResult> {
  const cls = await resolveClass(input.classId);
  if (!cls) {
    return {
      ok: false,
      error: 'Class not found.',
      subjectName: '',
      classLabel: '',
      year: 0,
      nav: [],
      month: '',
      week: 1,
      cells: [],
    };
  }

  const nav = await getCurriculumNav(cls.subjectCode, cls.year);

  // Default to the first synced month + week; fall back to a sensible breadcrumb
  // when nothing is synced (the empty state handles the rest).
  const month = input.month ?? nav[0]?.month ?? '';
  const week = input.week ?? nav.find((m) => m.month === month)?.weeks[0] ?? 1;

  const cells =
    month === '' ? [] : await getCurriculumWeekCells(cls.subjectCode, cls.year, month, week);

  return {
    ok: true,
    subjectName: cls.subjectName,
    classLabel: cls.label,
    year: cls.year,
    nav,
    month,
    week,
    cells,
  };
}

export type CreateLessonResult =
  | { status: 'created'; planId: string }
  | {
      status: 'already_planned';
      existing: {
        planId: string;
        title: string;
        planStatus: PlanStatus;
        ownerName: string;
      };
    }
  | { status: 'error'; error: string };

/** Build the "already planned" payload for an existing plan row. */
async function describeExisting(existing: {
  id: string;
  status: PlanStatus;
  curriculum_lesson_id: string;
  created_by: string;
}): Promise<CreateLessonResult> {
  const supabase = await createClient();
  const [lookup, { data: owner }] = await Promise.all([
    getLessonById(existing.curriculum_lesson_id),
    supabase.from('profiles').select('full_name').eq('id', existing.created_by).maybeSingle(),
  ]);
  const lesson = Array.isArray(lookup) ? lookup[0] : lookup;
  return {
    status: 'already_planned',
    existing: {
      planId: existing.id,
      title: lesson?.dailyLO || 'Untitled lesson',
      planStatus: existing.status,
      ownerName: (owner?.full_name as string | undefined) ?? 'A teammate',
    },
  };
}

/**
 * Create a lesson plan for a class on a chosen curriculum period.
 *
 * `anchorMonday` is the Monday of the calendar week the new plan lands in (the
 * home's shown week, or the Monday of a pre-seeded date). The plan's `lesson_date`
 * is that Monday + (period − 1) days. Curriculum weeks are a scheme-of-work
 * numbering independent of the calendar, so the date comes from the anchor week,
 * not the curriculum week number.
 *
 * Enforces one plan per (class, date): an existing plan short-circuits to the
 * "already planned" result (no insert), and a racing unique-violation is mapped
 * to the same result rather than surfaced as an error.
 */
export async function createLessonForClass(input: {
  classId: string;
  lessonKey: string;
  period: number;
  anchorMonday: string;
}): Promise<CreateLessonResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', error: 'Not signed in.' };

  const cls = await resolveClass(input.classId);
  if (!cls) return { status: 'error', error: 'Class not found.' };

  // Defence in depth: RLS would accept any insert where created_by = me, so verify
  // the caller actually belongs to this class's space before writing.
  const allowed = (await isMemberOf(cls.schoolId, cls.subjectId)) || (await isAdmin());
  if (!allowed) return { status: 'error', error: 'You are not a member of this class.' };

  const lessonDate = addDays(input.anchorMonday, input.period - 1);

  // One plan per (class, date): if one exists, route to it instead of inserting.
  const { data: existingRow } = await supabase
    .from('lesson_plans')
    .select('id, status, curriculum_lesson_id, created_by')
    .eq('class_id', input.classId)
    .eq('lesson_date', lessonDate)
    .maybeSingle();

  if (existingRow) {
    return describeExisting(
      existingRow as unknown as {
        id: string;
        status: PlanStatus;
        curriculum_lesson_id: string;
        created_by: string;
      },
    );
  }

  const { data: inserted, error } = await supabase
    .from('lesson_plans')
    .insert({
      class_id: input.classId,
      curriculum_lesson_id: input.lessonKey,
      lesson_date: lessonDate,
      period: input.period,
      status: 'in_progress',
      blocks: DEFAULT_BLOCKS,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Lost a race on the unique (class_id, lesson_date) constraint — resolve the
    // now-existing plan and route to it rather than erroring.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('lesson_plans')
        .select('id, status, curriculum_lesson_id, created_by')
        .eq('class_id', input.classId)
        .eq('lesson_date', lessonDate)
        .maybeSingle();
      if (raced) {
        return describeExisting(
          raced as unknown as {
            id: string;
            status: PlanStatus;
            curriculum_lesson_id: string;
            created_by: string;
          },
        );
      }
    }
    return { status: 'error', error: error.message };
  }

  if (!inserted) return { status: 'error', error: 'Could not create the plan.' };

  revalidatePath('/');
  return { status: 'created', planId: (inserted as { id: string }).id };
}
