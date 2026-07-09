import 'server-only';

// Data layer for the read-only Curriculum browse screen. It assembles a single
// week's "zoomed-in" view of the curriculum table — the selectors' option lists,
// the selected week's rows (one per period), and that week's weekly + monthly
// outcome context.
//
// Curriculum CONTENT is read through the cached curriculumUtils helpers (which
// front the global, identical-for-every-user `curriculum_lesson` table); subject
// NAMES come through the auth'd, cookie-bound client so the `subjects` reference
// join still respects RLS. Curriculum RLS already lets any authenticated user read
// every curriculum row, so the two paths return the same content either way.

import { createClient } from '@/lib/supabase/server';
import { getActiveSpace } from '@/lib/active-space';
import {
  cleanLO,
  getCurriculumMonthRows,
  getCurriculumNav,
  getCurriculumSubjectCodes,
  getCurriculumWeekRows,
  isSinglePeriodSubject,
} from '@/lib/curriculumUtils';
import { skillKeyOf } from '@/components/curriculum/skill';
import type { CurriculumLessonRow } from '@/lib/curriculum/types';
import type {
  BrowseCoordinate,
  BrowseMonthNav,
  BrowseMonthWeek,
  BrowseRow,
  BrowseSubject,
  CurriculumBrowseData,
} from '@/types/curriculum-browse';

/**
 * A resource label that carries no real resource. The source bakes several
 * "empty" spellings into the label column — null/blank, an em-dash placeholder,
 * or the literal string "n/a" (any case). Scrub them here so no consumer (the
 * weekly table or the detail rail) ever renders a phantom resource line.
 */
function isNoResource(label: string): boolean {
  const s = label.trim().toLowerCase();
  return s === '' || s === '—' || s === 'n/a';
}

/** Map a raw curriculum row to the `BrowseRow` view-model (table row / grid cell). */
function toBrowseRow(r: CurriculumLessonRow): BrowseRow {
  return {
    period: r.period,
    weekday: r.period,
    dailyOutcome: cleanLO(r.daily_outcome ?? ''),
    linguisticSkill: r.linguistic_skill ?? '',
    skillKey: skillKeyOf(r.linguistic_skill ?? ''),
    theme: (r.theme ?? '').trim(),
    resources: (r.resources ?? [])
      .filter((res) => res.label && !isNoResource(res.label))
      .map((res) => ({ label: res.label.trim(), url: res.url })),
    lessonKey: r.lesson_key,
  };
}

/** Calendar-month order so the week stepper walks the scheme of work in sequence. */
const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function monthIndex(month: string): number {
  const i = MONTH_ORDER.indexOf(month);
  return i === -1 ? MONTH_ORDER.length : i;
}

/** The years (0–6) that have synced curriculum for a subject, ascending. */
async function yearsForSubject(subjectCode: string): Promise<number[]> {
  const candidates = [0, 1, 2, 3, 4, 5, 6];
  const navs = await Promise.all(candidates.map((y) => getCurriculumNav(subjectCode, y)));
  return candidates.filter((_, i) => navs[i].length > 0);
}

/** Ordered (month, week) coordinates for a subject+year — the stepper's track. */
async function coordsForSubjectYear(
  subjectCode: string,
  year: number,
): Promise<BrowseCoordinate[]> {
  const nav = await getCurriculumNav(subjectCode, year);
  return [...nav]
    .sort((a, b) => monthIndex(a.month) - monthIndex(b.month))
    .flatMap(({ month, weeks }) =>
      [...weeks].sort((a, b) => a - b).map((week) => ({ month, week })),
    );
}

/** Group ordered coordinates into the month picker's (month → weeks) option list. */
function navFromCoords(coords: BrowseCoordinate[]): BrowseMonthNav[] {
  const nav: BrowseMonthNav[] = [];
  for (const c of coords) {
    const last = nav[nav.length - 1];
    if (last && last.month === c.month) last.weeks.push(c.week);
    else nav.push({ month: c.month, weeks: [c.week] });
  }
  return nav;
}

/** First non-empty cleaned value of a column across the week's rows, else null. */
function firstOutcome(
  rows: CurriculumLessonRow[],
  pick: (r: CurriculumLessonRow) => string | null,
): string | null {
  for (const r of rows) {
    const v = cleanLO(pick(r) ?? '');
    if (v) return v;
  }
  return null;
}

/** The most frequent non-empty theme across the week's rows (the header chip). */
function predominantTheme(rows: CurriculumLessonRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const theme = (r.theme ?? '').trim();
    if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [theme, n] of counts) {
    if (n > bestN) {
      best = theme;
      bestN = n;
    }
  }
  return best;
}

/** Map subject codes to display names via the RLS-readable `subjects` reference. */
async function subjectNames(codes: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (codes.length === 0) return names;
  const supabase = await createClient();
  const { data } = await supabase.from('subjects').select('code, name').in('code', codes);
  for (const row of (data ?? []) as Array<{ code: string; name: string }>) {
    names.set(row.code, row.name);
  }
  return names;
}

/** Subjects sorted English-first, then by display name — English is the default. */
function sortSubjects(subjects: BrowseSubject[]): BrowseSubject[] {
  return [...subjects].sort((a, b) => {
    if (a.code === 'english') return -1;
    if (b.code === 'english') return 1;
    return a.name.localeCompare(b.name);
  });
}

/** The subject/year context every Explorer tab shares (subjects list, resolved
 *  subject, its synced years) — without the calendar-specific reads. */
export interface ExplorerShell {
  subjects: BrowseSubject[];
  subjectCode: string;
  subjectName: string;
  years: number[];
  year: number;
}

/**
 * Resolve the shared Explorer context: the subject list, the resolved subject
 * (explicit `?subject=` → active space → English/first), its synced years, and the
 * resolved year (snap to first). Returns null when no curriculum is synced. Reuses the
 * SAME resolution as `getCurriculumBrowseData` so every tab agrees on subject/year.
 */
export async function getExplorerShell(input: {
  subject?: string;
  year?: number;
}): Promise<ExplorerShell | null> {
  const codes = await getCurriculumSubjectCodes();
  if (codes.length === 0) return null;
  const names = await subjectNames(codes);
  const subjects = sortSubjects(codes.map((code) => ({ code, name: names.get(code) ?? code })));
  const active = await getActiveSpace();
  const subject =
    subjects.find((s) => s.code === input.subject) ??
    (active ? subjects.find((s) => s.code === active.subjectCode) : undefined) ??
    subjects[0];
  const years = await yearsForSubject(subject.code);
  const year = input.year != null && years.includes(input.year) ? input.year : (years[0] ?? 0);
  return { subjects, subjectCode: subject.code, subjectName: subject.name, years, year };
}

const EMPTY: CurriculumBrowseData = {
  subjects: [],
  years: [],
  selected: { subjectCode: '', subjectName: '', year: 0, month: '', week: 0 },
  prev: null,
  next: null,
  nav: [],
  topicChip: null,
  weekly: { skills: null, knowledge: null },
  monthly: { combined: null, knowledge: null, skills: null },
  rows: [],
  singlePeriod: false,
  monthWeekRows: [],
  monthGrid: [],
  prevMonth: null,
  nextMonth: null,
};

/**
 * Build the Curriculum browse view-model for a (subject, year, week) selection.
 *
 * Any out-of-range or missing selector snaps to the first available value:
 * subject → English (else first synced), year → first synced, (month, week) →
 * first coordinate in the scheme of work. Returns an empty-but-valid model when
 * no curriculum is synced, so the page renders its empty state without crashing.
 */
export async function getCurriculumBrowseData(input: {
  subject?: string;
  year?: number;
  month?: string;
  week?: number;
}): Promise<CurriculumBrowseData> {
  const codes = await getCurriculumSubjectCodes();
  if (codes.length === 0) return EMPTY;

  const names = await subjectNames(codes);
  const subjects = sortSubjects(
    codes.map((code) => ({ code, name: names.get(code) ?? code })),
  );

  // Resolve subject: an explicit `?subject=` wins (browsing another subject); else
  // default to the user's ACTIVE space so the curriculum content agrees with the
  // header chip; else fall back to the first synced subject (English sorts first).
  const active = await getActiveSpace();
  const subject =
    subjects.find((s) => s.code === input.subject) ??
    (active ? subjects.find((s) => s.code === active.subjectCode) : undefined) ??
    subjects[0];

  const years = await yearsForSubject(subject.code);
  if (years.length === 0) {
    return {
      ...EMPTY,
      subjects,
      selected: { subjectCode: subject.code, subjectName: subject.name, year: 0, month: '', week: 0 },
    };
  }

  // Resolve year (snap to first available).
  const year = input.year != null && years.includes(input.year) ? input.year : years[0];

  const coords = await coordsForSubjectYear(subject.code, year);
  if (coords.length === 0) {
    return {
      ...EMPTY,
      subjects,
      years,
      selected: { subjectCode: subject.code, subjectName: subject.name, year, month: '', week: 0 },
    };
  }

  // Resolve the (month, week) coordinate (snap to the first when out of range).
  let index = coords.findIndex((c) => c.month === input.month && c.week === input.week);
  if (index === -1) index = 0;
  const coordinate = coords[index];
  const prev = index > 0 ? coords[index - 1] : null;
  const next = index < coords.length - 1 ? coords[index + 1] : null;

  const weekRows = await getCurriculumWeekRows(
    subject.code,
    year,
    coordinate.month,
    coordinate.week,
  );

  // Only daily-grain periods (1–5) populate the period grid; non-instructional /
  // weekly-grain rows (null or out-of-range period) have no slot.
  const isDailyRow = (r: CurriculumLessonRow) =>
    r.period != null && r.period >= 1 && r.period <= 5;
  const rows: BrowseRow[] = weekRows.filter(isDailyRow).map(toBrowseRow);

  // Monthly calendar grid: every week of the selected month × periods 1–5. Each
  // cell is a full BrowseRow (null where a period has no lesson) so the shared
  // FocusCard renders any selected cell without a server round-trip.
  const nav = navFromCoords(coords);
  const monthRows = await getCurriculumMonthRows(subject.code, year, coordinate.month);
  const weeksInMonth = nav.find((n) => n.month === coordinate.month)?.weeks ?? [];
  const monthGrid: BrowseMonthWeek[] = weeksInMonth.map((week) => {
    const weekRowsForGrid = monthRows.filter((r) => r.week === week);
    const cells = [1, 2, 3, 4, 5].map((p) => {
      const cell = weekRowsForGrid.find((r) => r.period === p);
      return cell && isDailyRow(cell) ? toBrowseRow(cell) : null;
    });
    return { week, themeLabel: predominantTheme(weekRowsForGrid) ?? '', cells };
  });

  // Month navigator: step to the first week of the adjacent month in the scheme
  // of work. `nav` is already in calendar-month order.
  const firstCoordOfMonth = (month: string): BrowseCoordinate | null => {
    const weeks = nav.find((n) => n.month === month)?.weeks ?? [];
    return weeks.length > 0 ? { month, week: weeks[0] } : null;
  };
  const monthIdx = nav.findIndex((n) => n.month === coordinate.month);
  const prevMonth = monthIdx > 0 ? firstCoordOfMonth(nav[monthIdx - 1].month) : null;
  const nextMonth =
    monthIdx >= 0 && monthIdx < nav.length - 1
      ? firstCoordOfMonth(nav[monthIdx + 1].month)
      : null;

  // Single-period subjects (Yoga/Awareness) collapse the month into one row per week.
  // Build that list from the month rows WITHOUT the daily-period filter, so Awareness's
  // period-NULL weekly-grain rows survive (they'd be dropped by `monthGrid`'s isDailyRow
  // gate). Exactly one row per week for these subjects; take that week's first row.
  const singlePeriod = await isSinglePeriodSubject(subject.code);
  const monthWeekRows: BrowseRow[] = singlePeriod
    ? weeksInMonth
        .map((week) => monthRows.find((r) => r.week === week))
        .filter((r): r is CurriculumLessonRow => r != null)
        .map(toBrowseRow)
    : [];

  return {
    subjects,
    years,
    selected: {
      subjectCode: subject.code,
      subjectName: subject.name,
      year,
      month: coordinate.month,
      week: coordinate.week,
    },
    prev,
    next,
    nav,
    topicChip: predominantTheme(weekRows),
    weekly: {
      skills: firstOutcome(weekRows, (r) => r.weekly_skills_lo),
      knowledge: firstOutcome(weekRows, (r) => r.weekly_knowledge_lo),
    },
    monthly: {
      combined: firstOutcome(weekRows, (r) => r.monthly_lo),
      knowledge: firstOutcome(weekRows, (r) => r.monthly_knowledge_lo),
      skills: firstOutcome(weekRows, (r) => r.monthly_skills_lo),
    },
    rows,
    singlePeriod,
    monthWeekRows,
    monthGrid,
    prevMonth,
    nextMonth,
  };
}
