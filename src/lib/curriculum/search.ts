import 'server-only';

// ── Curriculum Search corpus (whole-subject, loaded once) ───────────────────────────
//
// The Search tab does INSTANT client-side search + faceted filter over a subject's
// lessons. Unlike the scoped Calendar/Topics reads, Search needs the WHOLE subject at
// once (all years) so a single load can serve every keystroke with no server round-trip.
//
// The whole-subject scope exceeds the PostgREST 1000-row cap (English ~1,190 rows), so —
// unlike curriculumUtils' naturally-scoped reads — this pages through with `.range()`
// until the last page is short, never silently truncating. Reads use the service-role
// client because curriculum is global reference data, identical for every authenticated
// user (see @/lib/supabase/admin), matching curriculumUtils / composition.
//
// SUBJECT-AGNOSTIC & TAXONOMY-FREE by design: every field is nullable and derived from
// live columns (daily_outcome, theme, focus_area, linguistic_skill, grammar_vocabulary),
// so Search works fully for a subject with NO taxonomy (unlike the Logic tree).

import { createAdminClient } from '@/lib/supabase/admin';
import { cleanLO } from '@/lib/curriculumUtils';
import type { CurriculumResource } from '@/lib/curriculum/types';

/** One searchable lesson — the client filters/ranks over an array of these. */
export interface SearchRecord {
  lessonKey: string;
  year: number;
  month: string;
  week: number;
  period: number | null;
  dailyOutcome: string;
  /** Theme = the "Topic" facet/label. */
  theme: string | null;
  focusArea: string | null;
  linguisticSkill: string | null;
  grammarVocabulary: string | null;
  resources: CurriculumResource[];
}

/** The corpus for one subject plus its calendar axes (facet option lists). */
export interface SearchData {
  subject: string;
  records: SearchRecord[];
  /** Distinct years present, ascending. */
  years: number[];
  /** Distinct months present, in calendar order. */
  months: string[];
}

/** Calendar-month order so the Month facet reads in scheme-of-work sequence. */
const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function monthIndex(month: string): number {
  const i = MONTH_ORDER.indexOf(month);
  return i === -1 ? MONTH_ORDER.length : i;
}

/** A resource label carrying no real resource (blank / em-dash / "n/a"). */
function isNoResource(label: string): boolean {
  const s = label.trim().toLowerCase();
  return s === '' || s === '—' || s === 'n/a';
}

function cleanResources(resources: CurriculumResource[] | null): CurriculumResource[] {
  return (resources ?? [])
    .filter((r) => r.label && !isNoResource(r.label))
    .map((r) => ({ label: r.label.trim(), url: r.url }));
}

const SEARCH_COLUMNS =
  'year, month, week, period, lesson_key, daily_outcome, theme, focus_area, ' +
  'linguistic_skill, grammar_vocabulary, resources';

interface SearchRow {
  year: number;
  month: string;
  week: number;
  period: number | null;
  lesson_key: string;
  daily_outcome: string | null;
  theme: string | null;
  focus_area: string | null;
  linguistic_skill: string | null;
  grammar_vocabulary: string | null;
  resources: CurriculumResource[] | null;
}

const PAGE_SIZE = 1000;

/**
 * Load every active lesson for a subject as the Search corpus. Pages through the
 * PostgREST 1000-row cap and returns a ready-to-search array plus the distinct
 * year/month axes. Rows with a blank daily outcome are dropped — they carry no
 * searchable content and no meaningful "Plan this lesson" target.
 */
export async function getSearchData(subject: string): Promise<SearchData> {
  const supabase = createAdminClient();
  const rows: SearchRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('curriculum_lesson_active')
      .select(SEARCH_COLUMNS)
      .eq('is_active', true)
      .eq('subject_code', subject)
      .order('year', { ascending: true })
      .order('week', { ascending: true })
      .order('period', { ascending: true, nullsFirst: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Search corpus read failed: ${error.message}`);
    const page = (data ?? []) as unknown as SearchRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const records: SearchRecord[] = [];
  for (const r of rows) {
    const dailyOutcome = cleanLO(r.daily_outcome ?? '');
    if (!dailyOutcome) continue;
    records.push({
      lessonKey: r.lesson_key,
      year: r.year,
      month: r.month,
      week: r.week,
      period: r.period,
      dailyOutcome,
      theme: (r.theme ?? '').trim() || null,
      focusArea: (r.focus_area ?? '').trim() || null,
      linguisticSkill: (r.linguistic_skill ?? '').trim() || null,
      grammarVocabulary: cleanLO(r.grammar_vocabulary ?? '') || null,
      resources: cleanResources(r.resources),
    });
  }

  const years = [...new Set(records.map((r) => r.year))].sort((a, b) => a - b);
  const months = [...new Set(records.map((r) => r.month))].sort(
    (a, b) => monthIndex(a) - monthIndex(b),
  );

  return { subject, records, years, months };
}
