// Pure derivations for the coordinator Insights page.
//
// This module turns the two server-side aggregate shapes — `InsightsAggregates`
// (taxonomy-sourced; only `hoursPerMonth` is used here, the pure calendar count) and
// `TopicsData` (focus_area/theme-sourced; #99's cleaned/de-duplicated logic, the LIVE
// per-subject signal) — into the exact view models the four analytics render.
//
// It is deliberately i18n-free and side-effect-free so it can be unit-tested and reused
// on the client. Every derivation degrades to an EMPTY view (never a thrown error, never
// a fabricated row) when the subject lacks the underlying data, so each card can show its
// own "not available yet" state rather than a misleading full-looking chart. The
// taxonomy `S0/K0` flat artefact never reaches here (TopicsData is focus_area/theme, and
// #99 already discounts it), so placeholders can't masquerade as real content.

import type { HoursPerMonth, TopicsData } from '@/lib/curriculum/composition';

// ── Calendar order ──────────────────────────────────────────────────────────────────

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export function monthIndex(month: string): number {
  const i = MONTH_ORDER.indexOf(month);
  return i === -1 ? MONTH_ORDER.length : i;
}

// ── Magnitude → teal ramp ─────────────────────────────────────────────────────────
//
// Maps a value's share of the max onto one of the five sequential teal stops. Returns a
// CSS custom-property reference so the actual colour stays a design token, not a hex
// baked into TSX. Zero (or an empty scale) → the faintest stop.

const TEAL_STOPS = [
  'var(--color-chart-teal-1)',
  'var(--color-chart-teal-2)',
  'var(--color-chart-teal-3)',
  'var(--color-chart-teal-4)',
  'var(--color-chart-teal-5)',
];
export function tealStop(value: number, max: number): string {
  if (max <= 0 || value <= 0) return TEAL_STOPS[0];
  const ratio = Math.min(1, value / max);
  const idx = Math.min(TEAL_STOPS.length - 1, Math.ceil(ratio * TEAL_STOPS.length) - 1);
  return TEAL_STOPS[Math.max(0, idx)];
}

// ── 1) Hours per month (for one year) ───────────────────────────────────────────────
//
// The STATED anomaly rule: a teaching month is flagged "unusually low" when its hours
// fall below LOW_MONTH_MEDIAN_FRACTION of the MEDIAN of that year's teaching months.
// Only months actually present (taught) are considered — a month with no lessons isn't
// a bar, so it can't be "low". Documented in the PR; the fraction lives here, not inline.

export const LOW_MONTH_MEDIAN_FRACTION = 0.6;

export interface MonthBar {
  month: string;
  hours: number;
  low: boolean;
}
export interface HoursPerMonthView {
  year: number;
  bars: MonthBar[];
  median: number;
  maxHours: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function hoursPerMonthForYear(hpm: HoursPerMonth[], year: number): HoursPerMonthView {
  const rows = hpm
    .filter((r) => r.year === year && r.hours > 0)
    .sort((a, b) => monthIndex(a.month) - monthIndex(b.month));
  const med = median(rows.map((r) => r.hours));
  const threshold = med * LOW_MONTH_MEDIAN_FRACTION;
  const maxHours = rows.reduce((m, r) => Math.max(m, r.hours), 0);
  const bars: MonthBar[] = rows.map((r) => ({
    month: r.month,
    hours: r.hours,
    // Flag only when there IS a meaningful median to compare against (≥2 months).
    low: rows.length >= 2 && r.hours < threshold,
  }));
  return { year, bars, median: med, maxHours };
}

// ── 2) Hours by focus area / theme ──────────────────────────────────────────────────
//
// focus_area subjects: one bar per focus area, each broken down by its topics.
// english (theme mode): one bar per THEME (the theme IS the unit — no sub-breakdown).
// Percentages are the share of the subject's whole taught total. Empty focus
// areas/themes are dropped so a bar never reads as 0%.

export interface TopicSlice {
  topic: string;
  hours: number;
}
export interface FocusAreaBar {
  label: string | null;
  hours: number;
  pct: number;
  topics: TopicSlice[];
}
export interface FocusAreaView {
  groupedBy: 'focusArea' | 'theme';
  total: number;
  bars: FocusAreaBar[];
}

function sumThreadHours(years: { hours: number }[]): number {
  return years.reduce((s, y) => s + y.hours, 0);
}

export function hoursByFocusArea(data: TopicsData): FocusAreaView {
  const groupedBy = data.groupedBy;
  let raw: FocusAreaBar[];

  if (groupedBy === 'theme') {
    // English: every theme is a top-level bar; there is no focus-area tier to break down.
    const group = data.focusAreas[0];
    raw = (group?.topics ?? []).map((tp) => ({
      label: tp.topic,
      hours: sumThreadHours(tp.years),
      pct: 0,
      topics: [],
    }));
  } else {
    raw = data.focusAreas.map((fa) => {
      const topics = fa.topics
        .map((tp) => ({ topic: tp.topic, hours: sumThreadHours(tp.years) }))
        .filter((s) => s.hours > 0)
        .sort((a, b) => b.hours - a.hours);
      return {
        label: fa.focusArea,
        hours: topics.reduce((s, t) => s + t.hours, 0),
        pct: 0,
        topics,
      };
    });
  }

  const bars = raw.filter((b) => b.hours > 0).sort((a, b) => b.hours - a.hours);
  const total = bars.reduce((s, b) => s + b.hours, 0);
  for (const b of bars) b.pct = total > 0 ? (b.hours / total) * 100 : 0;
  return { groupedBy, total, bars };
}

// ── 3 & 4) Topic × year matrix (shared spine) ───────────────────────────────────────
//
// Rows are topics grouped under their focus area (theme mode: a single null-labelled
// group). `byYear[year]` is the taught hour count for that cell, or undefined = not
// taught that year. Chart 3 reads presence (taught vs dashed); chart 4 reads the count
// (teal magnitude) and marks `undefined` cells with a gap cross.

export interface MatrixRow {
  topic: string;
  byYear: Record<number, number | undefined>;
  totalHours: number;
}
export interface MatrixGroup {
  faLabel: string | null;
  rows: MatrixRow[];
}
export interface MatrixView {
  groupedBy: 'focusArea' | 'theme';
  years: number[];
  groups: MatrixGroup[];
  maxCell: number;
}

export function topicMatrix(data: TopicsData): MatrixView {
  const years = data.years;
  let maxCell = 0;
  const groups: MatrixGroup[] = data.focusAreas.map((fa) => ({
    faLabel: fa.focusArea,
    rows: fa.topics.map((tp) => {
      const byYear: Record<number, number | undefined> = {};
      let total = 0;
      for (const ty of tp.years) {
        byYear[ty.year] = ty.hours;
        total += ty.hours;
        if (ty.hours > maxCell) maxCell = ty.hours;
      }
      return { topic: tp.topic, byYear, totalHours: total };
    }),
  }));
  // Drop groups whose topics are all empty so the matrix never shows a blank section.
  const nonEmpty = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.totalHours > 0) }))
    .filter((g) => g.rows.length > 0);
  return { groupedBy: data.groupedBy, years, groups: nonEmpty, maxCell };
}

// ── Coverage narrative: present → absent → present ──────────────────────────────────
//
// A gap is a run of not-taught years STRICTLY BETWEEN two taught years for one topic —
// the genuine "drops out then reappears" pattern (not merely trailing off at the end of
// the data). Generated from the actual matrix, never a fixed string. Sorted widest-gap
// first so the most notable spiralling break leads.

export interface GapNote {
  faLabel: string | null;
  topic: string;
  gapYears: number[];
  reappear: number;
}

export function gapNotes(view: MatrixView): GapNote[] {
  const notes: GapNote[] = [];
  for (const g of view.groups) {
    for (const row of g.rows) {
      const taught = view.years.filter((y) => row.byYear[y] !== undefined);
      if (taught.length < 2) continue;
      const first = taught[0];
      const last = taught[taught.length - 1];
      // Not-taught years strictly inside the taught span.
      let runStart: number | null = null;
      for (const y of view.years) {
        if (y <= first || y > last) continue;
        const isTaught = row.byYear[y] !== undefined;
        if (!isTaught) {
          if (runStart === null) runStart = y;
        } else if (runStart !== null) {
          const gapYears = view.years.filter((yy) => yy >= runStart! && yy < y && row.byYear[yy] === undefined);
          if (gapYears.length > 0) notes.push({ faLabel: g.faLabel, topic: row.topic, gapYears, reappear: y });
          runStart = null;
        }
      }
    }
  }
  return notes.sort((a, b) => b.gapYears.length - a.gapYears.length);
}
