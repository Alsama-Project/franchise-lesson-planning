'use client';

// The read-only Curriculum browse screen. Two structures share one selector row and
// one detail card (the teal "IN FOCUS" FocusCard):
//   • Weekly  — a single-week table (outcome / skill / topic / resources) + the card.
//   • Monthly — the whole month as a weeks × periods calendar grid + the card.
// A segmented [Weekly | Monthly] toggle switches between them; the choice rides in
// the URL (?view=) so month navigation stays in the monthly view and the screen is
// linkable.
//
// PERIODS, NOT WEEKDAYS. Alsama schools don't pin curriculum periods to fixed
// weekdays, so every day/column label reads off `curriculum_lesson.period` (1–5) —
// "Period 1"…"Period 5" — never a derived Mon–Fri name.
//
// COLOUR SEMANTICS (locked): everything here is curriculum-provided content, so it
// reads as cream/locked. The only teal is the "Plan this lesson" CTA and the
// selected-row / focus-card / selected-cell accent. There are NO teacher-editable
// zones, so the editable-pink (`--color-pink` #b62a5c) never appears; the skill
// hues come from the shared categorical `--color-skill-*` tokens (SKILL_TEXT), the
// SAME mapping the weekly Skill column already uses — Reading teal and Listening
// orange match the design exactly, and Speaking/Writing use the codebase's canonical
// categorical hues rather than repurposing the editable-pink.
//
// Selecting Subject / Year / Week / Month / View navigates (the server re-fetches);
// selecting a period (weekly) or a grid cell (monthly) is pure client state that
// re-points the focus card.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createScopedPlan } from '@/lib/actions/create-lesson';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { WeekPicker } from '@/components/common/WeekPicker';
import { SKILL_PILL, SKILL_TEXT } from '@/components/curriculum/skill';
import type {
  BrowseCoordinate,
  BrowseMonthWeek,
  BrowseRow,
  CurriculumBrowseData,
} from '@/types/curriculum-browse';

/** Which structure the screen shows; carried in the URL as `?view=`. */
export type CurriculumView = 'weekly' | 'monthly';

export function CurriculumBrowse({
  data,
  view,
  embedded = false,
}: {
  data: CurriculumBrowseData;
  view: CurriculumView;
  /** True when rendered as the Explorer's Calendar tab — drop the standalone card
   *  wrapper (the tab bar already provides it) and render header + body inline. */
  embedded?: boolean;
}) {
  if (data.subjects.length === 0) {
    return <EmptyState />;
  }

  const inner = (
    <>
      <Header data={data} view={view} />
      <div className="border-t border-border p-[22px]">
        {data.singlePeriod ? (
          // Single-period subjects (Yoga/Awareness): one collapsed view, keyed on the
          // month so the selected-week state re-initialises on month navigation.
          <SinglePeriodBody
            key={`${data.selected.subjectCode}-${data.selected.year}-${data.selected.month}`}
            data={data}
          />
        ) : view === 'monthly' ? (
          // Key on the resolved coordinate so the grid selection re-initialises when
          // the month changes (month nav / subject / year) — the component otherwise
          // stays mounted across navigation and would hold stale cell indices.
          <MonthlyBody
            key={`${data.selected.subjectCode}-${data.selected.year}-${data.selected.month}`}
            data={data}
          />
        ) : (
          <WeeklyBody data={data} />
        )}
      </div>
    </>
  );

  if (embedded) return inner;

  return (
    // No `overflow-hidden` here: an overflow-clipping ancestor would trap the
    // IN-FOCUS panel's `position: sticky` inside this card. The rounded corners are
    // still respected by the bordered header / inner content, which clip their own.
    <div className="rounded-[18px] border border-border bg-surface shadow-card">{inner}</div>
  );
}

// ── Header: selectors + week/month nav + view toggle ─────────────────────────────

function Header({ data, view }: { data: CurriculumBrowseData; view: CurriculumView }) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  const router = useRouter();
  const { subjectCode, year, month, week } = data.selected;

  // One href builder for every navigation on this screen: it always pins the
  // resolved subject + year, then overlays whichever of month / week / view the
  // caller changes, preserving the rest (so the view survives week/month steps).
  const buildHref = (patch: {
    subject?: string;
    year?: number;
    month?: string;
    week?: number;
    view?: CurriculumView;
  }) => {
    const sp = new URLSearchParams();
    sp.set('subject', patch.subject ?? subjectCode);
    sp.set('year', String(patch.year ?? year));
    const m = patch.month ?? month;
    const w = patch.week ?? week;
    if (m) sp.set('month', m);
    if (w) sp.set('week', String(w));
    const v = patch.view ?? view;
    if (v === 'monthly') sp.set('view', 'monthly');
    return `/curriculum?${sp.toString()}`;
  };

  // Changing subject / year snaps month+week server-side, so drop them here but keep
  // the active view.
  const onSubject = (code: string) =>
    router.push(buildHref({ subject: code, month: '', week: 0 }));
  const onYear = (y: string) =>
    router.push(buildHref({ year: Number(y), month: '', week: 0 }));

  const coordHref = (c: BrowseCoordinate) => buildHref({ month: c.month, week: c.week });

  // Single-period subjects (Yoga/Awareness) collapse to one month-stepping view: no
  // Weekly/Monthly toggle, no week picker, no per-week topic chip. The navigator reuses
  // the month stepper (prevMonth/nextMonth), matching the month-of-weeks table below.
  const singlePeriod = data.singlePeriod;

  return (
    <div className="flex flex-wrap items-center justify-between gap-[14px] px-[22px] py-[15px]">
      <div className="flex flex-wrap items-center gap-[12px]">
        <Selector
          ariaLabel={t('subjectLabel')}
          value={subjectCode}
          onChange={onSubject}
          options={data.subjects.map((s) => ({ value: s.code, label: s.name }))}
        />
        <Selector
          ariaLabel={t('yearLabel')}
          value={String(year)}
          onChange={onYear}
          options={data.years.map((y) => ({
            value: String(y),
            label: t('year', { n: formatNumber(y, locale) }),
          }))}
        />
        {singlePeriod || view === 'monthly' ? (
          <MonthNav
            label={month || t('empty')}
            prevHref={data.prevMonth ? coordHref(data.prevMonth) : null}
            nextHref={data.nextMonth ? coordHref(data.nextMonth) : null}
            prevLabel={t('prevMonth')}
            nextLabel={t('nextMonth')}
          />
        ) : (
          /* Combined month → week picker — the SAME control as the weekly board
             (src/components/common/WeekPicker), driving ?month=&week=. */
          <WeekPicker
            label={month ? t('week', { n: formatNumber(week, locale) }) : t('empty')}
            defaultMonth={month || null}
            options={data.nav.flatMap((n) =>
              n.weeks.map((w) => ({
                month: n.month,
                week: w,
                label: t('week', { n: formatNumber(w, locale) }),
                href: coordHref({ month: n.month, week: w }),
                active: n.month === month && w === week,
              })),
            )}
            prevHref={data.prev ? coordHref(data.prev) : null}
            nextHref={data.next ? coordHref(data.next) : null}
            labels={{
              previousWeek: t('prevWeek'),
              nextWeek: t('nextWeek'),
              unavailable: (label) => label,
              monthHeading: t('monthLabel'),
              weekHeading: t('weekHeading'),
            }}
          />
        )}
        {!singlePeriod && view === 'weekly' && data.topicChip ? (
          <span
            dir="auto"
            className="inline-flex items-center rounded-full border border-[#ece4d7] bg-surface-cream px-[11px] py-[4px] text-[12.5px] font-medium text-[#8a6a3a]"
          >
            {data.topicChip}
          </span>
        ) : null}
      </div>
      {singlePeriod ? null : (
        <div className="flex items-center gap-[14px]">
          <ViewToggle weeklyHref={buildHref({ view: 'weekly' })} monthlyHref={buildHref({ view: 'monthly' })} view={view} />
        </div>
      )}
    </div>
  );
}

/** Segmented [Weekly | Monthly] control; the active segment fills teal. */
function ViewToggle({
  weeklyHref,
  monthlyHref,
  view,
}: {
  weeklyHref: string;
  monthlyHref: string;
  view: CurriculumView;
}) {
  const t = useTranslations('curriculum');
  const seg = (active: boolean) =>
    cn(
      'rounded-[7px] px-[13px] py-[6px] text-[13px] font-semibold transition-colors',
      active ? 'bg-teal text-white shadow-[0_2px_6px_-3px_rgba(31,122,108,0.6)]' : 'text-text-muted hover:text-ink',
    );
  return (
    <div
      role="group"
      aria-label={t('view.label')}
      className="inline-flex items-center gap-[2px] rounded-[10px] border border-border bg-surface-subtle p-[3px]"
    >
      <Link href={weeklyHref} aria-current={view === 'weekly'} className={seg(view === 'weekly')}>
        {t('view.weekly')}
      </Link>
      <Link href={monthlyHref} aria-current={view === 'monthly'} className={seg(view === 'monthly')}>
        {t('view.monthly')}
      </Link>
    </div>
  );
}

/** Month stepper (‹ Month ›) for the monthly view — parallels WeekPicker's arrows. */
function MonthNav({
  label,
  prevHref,
  nextHref,
  prevLabel,
  nextLabel,
}: {
  label: string;
  prevHref: string | null;
  nextHref: string | null;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center gap-[10px]">
      <MonthArrow href={prevHref} label={prevLabel} dir="left" />
      <span dir="auto" className="min-w-[110px] text-center text-[16px] font-semibold">
        {label}
      </span>
      <MonthArrow href={nextHref} label={nextLabel} dir="right" />
    </div>
  );
}

function MonthArrow({
  href,
  label,
  dir,
}: {
  href: string | null;
  label: string;
  dir: 'left' | 'right';
}) {
  const arrow = (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="rtl:-scale-x-100"
    >
      {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
  if (!href) {
    return (
      <span
        aria-label={label}
        aria-disabled="true"
        className="inline-flex size-[30px] cursor-not-allowed items-center justify-center rounded-[8px] border border-border bg-surface text-text-faint opacity-40"
      >
        {arrow}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-[30px] items-center justify-center rounded-[8px] border border-border bg-surface text-ink transition-colors hover:bg-surface-subtle"
    >
      {arrow}
    </Link>
  );
}

function Selector({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-[10px] border border-border bg-surface py-[8px] pe-[32px] ps-[14px] text-[14px] font-semibold text-ink transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="pointer-events-none absolute end-[11px] top-1/2 -translate-y-1/2 text-neutral-500"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

// ── Weekly body: outcome panels + week table + focus card ────────────────────────

function WeeklyBody({ data }: { data: CurriculumBrowseData }) {
  const t = useTranslations('curriculum');
  return (
    <>
      <div className="grid gap-[16px] md:grid-cols-2">
        <MonthlyPanel data={data} />
        <WeeklyPanel data={data} />
      </div>
      {data.rows.length === 0 ? (
        <p className="mt-[20px] rounded-[14px] border border-border bg-surface-subtle px-[16px] py-[24px] text-center text-[13.5px] text-text-muted">
          {t('noLessons')}
        </p>
      ) : (
        <WeekGrid data={data} />
      )}
    </>
  );
}

// ── Single-period body: full-width monthly outcome + month-of-weeks table ────────
//
// Yoga / Awareness have one period per week (see `isSinglePeriodSubject`), so the
// weekly/monthly split doesn't apply: we render ONE collapsed view. The Monthly
// Outcome block spans full width (the Weekly Outcome block is gone) and shows ONLY
// when it has content — locked curriculum content is never faked with an empty box.
// The table shows one row per week of the selected month (from `monthWeekRows`),
// reusing the existing week table; the row label is the week's ordinal within the
// month, not the DB period (1 for every Yoga row, NULL for Awareness).
function SinglePeriodBody({ data }: { data: CurriculumBrowseData }) {
  const t = useTranslations('curriculum');
  const rows = data.monthWeekRows;

  const monthlyLOs = useMemo(() => parseMonthlyOutcome(data.monthly), [data.monthly]);
  const hasMonthly =
    monthlyLOs.skills.length > 0 ||
    monthlyLOs.knowledge.length > 0 ||
    Boolean(data.monthly.combined);

  return (
    <>
      {hasMonthly ? <MonthlyPanel data={data} /> : null}
      {rows.length === 0 ? (
        <p
          className={cn(
            'rounded-[14px] border border-border bg-surface-subtle px-[16px] py-[24px] text-center text-[13.5px] text-text-muted',
            hasMonthly && 'mt-[20px]',
          )}
        >
          {t('monthGrid.noLessons')}
        </p>
      ) : (
        <SinglePeriodGrid rows={rows} spaced={hasMonthly} />
      )}
    </>
  );
}

/** The month-of-weeks table + sticky focus card for a single-period subject. */
function SinglePeriodGrid({ rows, spaced }: { rows: BrowseRow[]; spaced: boolean }) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  // Default-select the first week; clicking a row re-points the focus card.
  const [selected, setSelected] = useState(0);
  const safeIndex = Math.min(selected, rows.length - 1);
  const focusRow = rows[safeIndex];

  // Row label = the week's ordinal within the displayed month (1..N — 5 in a 5-week
  // month), reusing the existing `period` key. Deliberately NOT the DB `period`.
  const rowLabel = (i: number) => t('period', { n: formatNumber(i + 1, locale) });

  return (
    <div
      className={cn(
        'grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_360px]',
        spaced && 'mt-[20px]',
      )}
    >
      <WeekTable rows={rows} selected={safeIndex} onSelect={setSelected} rowLabel={rowLabel} />
      <div className="lg:sticky lg:top-[80px]">
        <FocusCard row={focusRow} periodLabel={rowLabel(safeIndex)} />
      </div>
    </div>
  );
}

// ── Monthly body: monthly outcome + calendar grid + focus card ───────────────────

/** Locate the initial grid selection: the URL-selected week's first lesson, else the
 *  first lesson anywhere in the month. Null when the month has no lessons. */
function initialSelection(
  grid: BrowseMonthWeek[],
  selectedWeek: number,
): { weekIdx: number; periodIdx: number } | null {
  if (grid.length === 0) return null;
  const found = grid.findIndex((w) => w.week === selectedWeek);
  const weekIdx = found === -1 ? 0 : found;
  const pi = grid[weekIdx].cells.findIndex(Boolean);
  if (pi !== -1) return { weekIdx, periodIdx: pi };
  for (let w = 0; w < grid.length; w += 1) {
    const p = grid[w].cells.findIndex(Boolean);
    if (p !== -1) return { weekIdx: w, periodIdx: p };
  }
  return null;
}

function MonthlyBody({ data }: { data: CurriculumBrowseData }) {
  const t = useTranslations('curriculum');
  const grid = data.monthGrid;
  const [sel, setSel] = useState(() => initialSelection(grid, data.selected.week));

  const isEmpty = grid.length === 0 || grid.every((w) => w.cells.every((c) => !c));
  const focusRow = sel ? grid[sel.weekIdx]?.cells[sel.periodIdx] ?? null : null;

  return (
    <>
      <MonthlyPanel data={data} />
      {isEmpty ? (
        <p className="mt-[20px] rounded-[14px] border border-border bg-surface-subtle px-[16px] py-[24px] text-center text-[13.5px] text-text-muted">
          {t('monthGrid.noLessons')}
        </p>
      ) : (
        <div className="mt-[20px] grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
          <MonthCalendar
            grid={grid}
            selected={sel}
            onSelect={(weekIdx, periodIdx) => setSel({ weekIdx, periodIdx })}
          />
          <div className="lg:sticky lg:top-[80px]">
            {focusRow ? <FocusCard row={focusRow} /> : null}
          </div>
        </div>
      )}
    </>
  );
}

// ── Monthly calendar grid ────────────────────────────────────────────────────────

const GRID_COLS = 'grid grid-cols-[84px_repeat(5,minmax(0,1fr))] gap-[10px]';

function MonthCalendar({
  grid,
  selected,
  onSelect,
}: {
  grid: BrowseMonthWeek[];
  selected: { weekIdx: number; periodIdx: number } | null;
  onSelect: (weekIdx: number, periodIdx: number) => void;
}) {
  const t = useTranslations('curriculum');
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Period column headers (source of truth = curriculum_lesson.period). */}
      <div className={GRID_COLS}>
        <div />
        {[1, 2, 3, 4, 5].map((p) => (
          <div
            key={p}
            className="text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-text-faint"
          >
            {t('period', { n: formatNumber(p, locale) })}
          </div>
        ))}
      </div>

      {/* Every week renders as a plain row — no highlighted "in focus" week. The only
          teal accent is the selected cell (GridCell), which drives the detail rail. */}
      {grid.map((weekRow, weekIdx) => (
        <div key={weekRow.week} className={cn(GRID_COLS, 'items-stretch')}>
          <div className="flex flex-col justify-center">
            <span className="text-[13px] font-semibold text-ink">
              {t('week', { n: formatNumber(weekRow.week, locale) })}
            </span>
            {weekRow.themeLabel ? (
              <span dir="auto" className="text-[11px] text-text-faint">
                {weekRow.themeLabel}
              </span>
            ) : null}
          </div>
          {weekRow.cells.map((cell, periodIdx) => (
            <GridCell
              key={periodIdx}
              cell={cell}
              selected={selected?.weekIdx === weekIdx && selected?.periodIdx === periodIdx}
              onSelect={() => onSelect(weekIdx, periodIdx)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A single period cell in the calendar grid — skill (colour-coded), LO, topic. */
function GridCell({
  cell,
  selected,
  onSelect,
}: {
  cell: BrowseRow | null;
  selected: boolean;
  onSelect: () => void;
}) {
  if (!cell) {
    return <div className="rounded-[10px] border border-dashed border-border bg-surface-subtle" />;
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex min-w-0 flex-col rounded-[10px] border bg-surface px-[10px] py-[9px] text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40',
        selected
          ? 'border-[1.5px] border-teal ring-[3px] ring-teal/10'
          : 'border-border hover:border-teal-tint-border',
      )}
    >
      {cell.linguisticSkill ? (
        <span dir="auto" className={cn('text-[10.5px] font-semibold', SKILL_TEXT[cell.skillKey])}>
          {cell.linguisticSkill}
        </span>
      ) : null}
      <span
        dir="auto"
        className="mt-[3px] line-clamp-2 text-[12px] leading-[1.3] text-neutral-900 [overflow-wrap:anywhere]"
      >
        {cell.dailyOutcome || '—'}
      </span>
      {cell.theme ? (
        <span dir="auto" className="mt-[6px] text-[10.5px] text-neutral-500 [overflow-wrap:anywhere]">
          {cell.theme}
        </span>
      ) : null}
    </button>
  );
}

// ── Outcome panels (cream, locked) ──────────────────────────────────────────────

/** The month's learning outcome (Skills / Knowledge). Shared by both views. */
function MonthlyPanel({ data }: { data: CurriculumBrowseData }) {
  const t = useTranslations('curriculum');
  const { month } = data.selected;

  // The monthly outcome arrives as Skills/Knowledge learning outcomes (parsed from
  // the split columns when present, else the single combined blob). Mirror the
  // weekly two-heading layout, but render one bullet per LO rather than gluing the
  // whole block into a single paragraph.
  const monthlyLOs = useMemo(() => parseMonthlyOutcome(data.monthly), [data.monthly]);
  const hasMonthlyLOs = monthlyLOs.skills.length > 0 || monthlyLOs.knowledge.length > 0;

  return (
    <Panel label={t('monthlyOutcome', { month: month || '—' })}>
      {hasMonthlyLOs ? (
        <OutcomeBulletColumns knowledge={monthlyLOs.knowledge} skills={monthlyLOs.skills} />
      ) : (
        // Fallback for a non-conforming blob with no parseable Skills/Knowledge.
        <OutcomeValue value={data.monthly.combined} />
      )}
    </Panel>
  );
}

/** The selected week's learning outcome (Skills / Knowledge). Weekly view only. */
function WeeklyPanel({ data }: { data: CurriculumBrowseData }) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  return (
    <Panel label={t('weeklyOutcome', { n: formatNumber(data.selected.week, locale) })}>
      <OutcomeColumns knowledge={data.weekly.knowledge} skills={data.weekly.skills} />
    </Panel>
  );
}

// ── Monthly-outcome parsing ──────────────────────────────────────────────────────
//
// The source "Monthly Learning Outcome" is one combined blob shaped as
//   Skills\n. <LO>\n. <LO> … Knowledge\n. <LO> …
// — a literal `Skills` / `Knowledge` heading line, then one `. `-led line per LO.
// We split it into its two sections, then into individual LOs (one per `. ` item).

/** Strip a leading ". " bullet stem from a single LO line. */
function stripBullet(line: string): string {
  return line.replace(/^\.\s*/, '').trim();
}

/**
 * Split a daily Learning Outcome into its individual LOs. Two delimiters are
 * honoured:
 *  1. The source's line-leading ". " bullet (cleanLO strips only the first), so
 *     distinct LOs are delimited by a newline introducing a fresh ". "-led outcome.
 *  2. A semicolon between LOs (confirmed in UI-fixes r5, e.g. Tue: "…tracking it;
 *     greet the teacher by saying 'hello'/'goodbye'."), which the old data baked
 *     into one line. This overrides the r4 choice to keep ";" joined.
 *
 * The semicolon class is deliberately broad: the curriculum is bilingual and the
 * Excel import carries whatever was typed, so an LO boundary can be an ASCII ";",
 * an Arabic semicolon "؛" (U+061B), or a fullwidth "；" (U+FF1B). Splitting on only
 * the ASCII form left non-ASCII-delimited days rendering as one run-on paragraph.
 *
 * Each segment is trimmed and empty segments (trailing/double ";" or newline) are
 * dropped, so no orphan/empty bullets are emitted. A single segment renders as
 * plain text upstream (DailyOutcome).
 */
const LO_SEPARATOR = /[;؛；]/;

function splitDailyLOs(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n(?=\s*\.\s)/)
    .flatMap((s) => s.split(LO_SEPARATOR))
    .map((s) => stripBullet(s.trim()))
    .filter(Boolean);
}

/** Split a section body into individual LOs — one per non-empty line. */
function splitSectionLOs(body: string): string[] {
  return body
    .split('\n')
    .map((l) => stripBullet(l))
    .filter(Boolean);
}

/** Parse the combined blob into its Skills / Knowledge LO lists. */
function parseMonthlyBlob(blob: string): { skills: string[]; knowledge: string[] } {
  const acc = { skills: [] as string[], knowledge: [] as string[] };
  let section: 'skills' | 'knowledge' | null = null;
  for (const raw of blob.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = stripBullet(line).toLowerCase();
    if (heading === 'skills') {
      section = 'skills';
      continue;
    }
    if (heading === 'knowledge') {
      section = 'knowledge';
      continue;
    }
    if (!section) continue;
    const lo = stripBullet(line);
    if (lo) acc[section].push(lo);
  }
  return acc;
}

/**
 * Resolve the monthly outcome to its Skills / Knowledge LO lists. Prefer the split
 * columns when either is populated, else parse the single combined blob.
 */
function parseMonthlyOutcome(monthly: {
  combined: string | null;
  skills: string | null;
  knowledge: string | null;
}): { skills: string[]; knowledge: string[] } {
  if (monthly.skills || monthly.knowledge) {
    return {
      skills: monthly.skills ? splitSectionLOs(monthly.skills) : [],
      knowledge: monthly.knowledge ? splitSectionLOs(monthly.knowledge) : [],
    };
  }
  if (monthly.combined) return parseMonthlyBlob(monthly.combined);
  return { skills: [], knowledge: [] };
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[#ece4d7] bg-surface-cream p-[18px]">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a6794f]">
        {label}
      </h2>
      <div className="mt-[12px]">{children}</div>
    </section>
  );
}

function OutcomeColumns({
  knowledge,
  skills,
}: {
  knowledge: string | null;
  skills: string | null;
}) {
  const t = useTranslations('curriculum');
  return (
    <div className="grid gap-[18px] sm:grid-cols-2">
      <div>
        {/* teal accent = "Knowledge"; categorical, not an action */}
        <p className="text-[12px] font-semibold text-teal">{t('knowledge')}</p>
        <OutcomeValue value={knowledge} className="mt-[5px]" />
      </div>
      <div>
        {/* rose accent = "Skills"; deliberately NOT the editable-pink #b62a5c */}
        <p className="text-[12px] font-semibold text-[#b8366b]">{t('skills')}</p>
        <OutcomeValue value={skills} className="mt-[5px]" />
      </div>
    </div>
  );
}

/**
 * Like `OutcomeColumns`, but renders each side as a bulleted list of LOs (one
 * <li> per learning outcome) instead of a single paragraph. Heading colours match
 * `OutcomeColumns` exactly so the monthly panel mirrors the weekly one.
 */
function OutcomeBulletColumns({
  knowledge,
  skills,
}: {
  knowledge: string[];
  skills: string[];
}) {
  const t = useTranslations('curriculum');
  return (
    <div className="grid gap-[18px] sm:grid-cols-2">
      <div>
        {/* teal accent = "Knowledge"; categorical, not an action */}
        <p className="text-[12px] font-semibold text-teal">{t('knowledge')}</p>
        <OutcomeList items={knowledge} className="mt-[6px]" />
      </div>
      <div>
        {/* rose accent = "Skills"; deliberately NOT the editable-pink #b62a5c */}
        <p className="text-[12px] font-semibold text-[#b8366b]">{t('skills')}</p>
        <OutcomeList items={skills} className="mt-[6px]" />
      </div>
    </div>
  );
}

function OutcomeList({ items, className }: { items: string[]; className?: string }) {
  const t = useTranslations('curriculum');
  if (items.length === 0) {
    return <p className={cn('text-[14px] text-text-faint', className)}>{t('empty')}</p>;
  }
  return (
    <ul className={cn('space-y-[6px]', className)}>
      {items.map((item, i) => (
        <li key={i} dir="auto" className="flex gap-[8px] text-[14px] leading-[1.5] text-ink">
          <span aria-hidden className="mt-[8px] size-[4px] shrink-0 rounded-full bg-[#a6794f]" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function OutcomeValue({ value, className }: { value: string | null; className?: string }) {
  const t = useTranslations('curriculum');
  if (!value) {
    return <p className={cn('text-[14px] text-text-faint', className)}>{t('empty')}</p>;
  }
  return (
    <p dir="auto" className={cn('text-[14px] leading-[1.5] text-ink [overflow-wrap:anywhere]', className)}>
      {value}
    </p>
  );
}

/**
 * Render a daily Learning Outcome, splitting a multi-LO day into one bullet per LO.
 * A single LO renders as plain inline text (no orphan bullet). Text size/weight is
 * inherited from the parent cell so this works in both the table and the focus card.
 */
function DailyOutcome({ text }: { text: string }) {
  const los = splitDailyLOs(text);
  if (los.length <= 1) {
    return <span dir="auto">{los[0] ?? text}</span>;
  }
  return (
    <ul className="space-y-[5px]">
      {los.map((lo, i) => (
        <li key={i} dir="auto" className="flex gap-[8px]">
          <span aria-hidden className="mt-[8px] size-[4px] shrink-0 rounded-full bg-[#a6794f]" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{lo}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Week grid: table + focus card ───────────────────────────────────────────────

function WeekGrid({ data }: { data: CurriculumBrowseData }) {
  // Default-select the first period; clicking a row re-points the focus card.
  const [selected, setSelected] = useState(0);
  const safeIndex = Math.min(selected, data.rows.length - 1);
  const focusRow = data.rows[safeIndex];

  return (
    <div className="mt-[20px] grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <WeekTable rows={data.rows} selected={safeIndex} onSelect={setSelected} />
      {/* Sticky so the IN FOCUS card stays in view while the day table scrolls.
          top offset clears the 64px (h-16) sticky shell header + a small gap. */}
      <div className="lg:sticky lg:top-[80px]">
        <FocusCard row={focusRow} />
      </div>
    </div>
  );
}

/** A merged Topic cell, computed from contiguous same-Theme runs. */
interface TopicCell {
  theme: string;
  rowSpan: number;
}

function WeekTable({
  rows,
  selected,
  onSelect,
  rowLabel,
}: {
  rows: BrowseRow[];
  selected: number;
  onSelect: (i: number) => void;
  /** Overrides the PERIOD cell label (single-period view uses the week ordinal). When
   *  omitted, the cell reads the row's own DB period — multi-period behaviour, unchanged. */
  rowLabel?: (index: number) => string;
}) {
  const t = useTranslations('curriculum');
  const locale = useLocale();

  // Compute the topic spans once. Contiguous periods merge into one cell ONLY when
  // their Theme is exactly equal (themes are already whitespace-trimmed upstream in
  // curriculum-browse.ts) — driven off the actual per-period data. A run of equal
  // non-empty Theme is rendered at its first row; blank Theme is its own single cell.
  const topicCells = useMemo<(TopicCell | null)[]>(() => {
    const cells: (TopicCell | null)[] = new Array(rows.length).fill(null);
    let i = 0;
    while (i < rows.length) {
      const theme = rows[i].theme;
      if (!theme) {
        cells[i] = { theme: '', rowSpan: 1 };
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < rows.length && rows[j].theme === theme) j += 1;
      cells[i] = { theme, rowSpan: j - i };
      i = j;
    }
    return cells;
  }, [rows]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-surface-cream">
            {/* LEARNING OUTCOME holds the long, most-read text — let it take all the
                remaining width; the other columns are squeezed to tight fixed widths
                so the LO column is clearly the widest. */}
            <Th className="w-[80px]">{t('table.period')}</Th>
            <Th className="w-auto border-s border-border">{t('table.learningOutcome')}</Th>
            <Th className="w-[76px] border-s border-border">{t('table.skill')}</Th>
            <Th className="w-[96px] border-s border-border">{t('table.topic')}</Th>
            <Th className="w-[104px] border-s border-border">{t('table.resources')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isSelected = i === selected;
            const topic = topicCells[i];
            const tint = isSelected ? 'bg-[#edf5f2]' : '';
            return (
              <tr
                key={row.lessonKey}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(i);
                  }
                }}
                tabIndex={0}
                aria-selected={isSelected}
                className="cursor-pointer border-t border-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal/40"
              >
                <td
                  className={cn(
                    'border-s-[3px] px-[16px] py-[14px] align-top text-[13.5px] font-semibold text-ink',
                    isSelected ? 'border-s-teal' : 'border-s-transparent',
                    tint,
                  )}
                >
                  {rowLabel ? rowLabel(i) : t('period', { n: formatNumber(row.period, locale) })}
                </td>
                <td className={cn('border-s border-border px-[16px] py-[14px] align-top text-[13.5px] leading-[1.45] text-ink', tint)}>
                  {row.dailyOutcome ? (
                    <DailyOutcome text={row.dailyOutcome} />
                  ) : (
                    <span>{t('empty')}</span>
                  )}
                </td>
                <td className={cn('border-s border-border px-[16px] py-[14px] align-top text-[13px] font-medium', tint)}>
                  {row.linguisticSkill ? (
                    <span dir="auto" className={SKILL_TEXT[row.skillKey]}>
                      {row.linguisticSkill}
                    </span>
                  ) : (
                    <span className="text-text-faint">{t('empty')}</span>
                  )}
                </td>
                {topic ? (
                  // The merged Topic cell spans its same-Theme run. Vertical dividers
                  // (border-s here + border-s on Resources) frame its full height and
                  // the row separators close its top/bottom, so the merge reads as an
                  // intentional merged cell rather than empty white space. Topic text
                  // stays de-emphasised (same weight/colour as other cells — no teal,
                  // no highlight); only borders carry the structure.
                  <td
                    rowSpan={topic.rowSpan}
                    className="border-s border-border px-[16px] py-[14px] align-top"
                  >
                    {topic.theme ? (
                      <span dir="auto" className="text-[13px] text-neutral-700">
                        {topic.theme}
                      </span>
                    ) : null}
                  </td>
                ) : null}
                <td className={cn('border-s border-border px-[16px] py-[14px] align-top text-[13px] text-neutral-700', tint)}>
                  {row.resources.length > 0 ? (
                    <span dir="auto">{row.resources.map((r) => r.label).join(' · ')}</span>
                  ) : (
                    <span className="text-text-faint">{t('empty')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-[16px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-600',
        className,
      )}
    >
      {children}
    </th>
  );
}

// ── Focus card (teal-accented) ──────────────────────────────────────────────────

function FocusCard({ row, periodLabel }: { row: BrowseRow; periodLabel?: string }) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = async () => {
    setBusy(true);
    setError(null);
    // Membership is enforced server-side by createScopedPlan; we always render the
    // CTA and map a membership refusal to friendly copy rather than a raw error.
    const res = await createScopedPlan({
      lessonKey: row.lessonKey,
      scope: 'centre',
      weekday: row.weekday,
      period: row.period,
    });
    if (res.ok) {
      router.push(`/plan/${res.planId}`);
      return; // keep the busy state through the navigation
    }
    setError(/member/i.test(res.error) ? t('focus.notMember') : t('focus.genericError'));
    setBusy(false);
  };

  return (
    <div>
      <p className="mb-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
        {t('focus.inFocus', {
          value: periodLabel ?? t('period', { n: formatNumber(row.period, locale) }),
        })}
      </p>
      <div className="rounded-[16px] border border-teal bg-surface p-[18px]">
        <p className="mb-[10px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
          {t('focus.skillTopic')}
        </p>
        <div className="flex flex-wrap items-center gap-[8px]">
          {row.linguisticSkill ? (
            <span
              dir="auto"
              className={cn(
                'inline-flex items-center rounded-full border px-[10px] py-[3px] text-[12px] font-medium',
                SKILL_PILL[row.skillKey],
              )}
            >
              {row.linguisticSkill}
            </span>
          ) : null}
          {row.theme ? (
            <span
              dir="auto"
              className="inline-flex items-center rounded-full border border-[#ece4d7] bg-surface-cream px-[10px] py-[3px] text-[12px] font-medium text-[#8a6a3a]"
            >
              {row.theme}
            </span>
          ) : null}
        </div>

        <p className="mt-[14px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
          {t('focus.dailyOutcome')}
        </p>
        <div className="mt-[6px] text-[16px] font-semibold leading-[1.35] text-ink break-words [overflow-wrap:anywhere]">
          {row.dailyOutcome ? <DailyOutcome text={row.dailyOutcome} /> : t('empty')}
        </div>

        {row.resources.length > 0 ? (
          <>
            <p className="mt-[16px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
              {t('focus.resources')}
            </p>
            <ul className="mt-[8px] space-y-[8px]">
              {row.resources.map((r, i) => (
                <li key={`${r.label}-${i}`} className="flex min-w-0 items-start gap-[9px]">
                  <ResourceIcon label={r.label} />
                  {/* Resource labels are often raw URLs (e.g. langeek.co/…) — break
                      inside the string with break-all so they can't bleed past the
                      card edge. min-w-0 lets the flex child actually shrink. */}
                  <span dir="auto" className="min-w-0 break-all text-[13.5px] text-ink">
                    {r.label}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <button
          type="button"
          onClick={plan}
          disabled={busy}
          className="mt-[18px] inline-flex w-full items-center justify-center gap-[7px] rounded-[12px] bg-teal px-[16px] py-[12px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(31,122,108,0.5)] transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('focus.planning') : t('focus.plan')}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="rtl:-scale-x-100"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        {error ? (
          <p className="mt-[10px] text-[12.5px] text-[#b8366b]">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Small content-inferred icon for a resource line (audio / cards / document). */
function ResourceIcon({ label }: { label: string }) {
  const s = label.toLowerCase();
  const kind =
    /audio|listen|sound|song|recording/.test(s) ? 'audio'
    : /flashcard|cards?\b|card/.test(s) ? 'cards'
    : 'doc';
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-[2px] shrink-0 text-teal"
    >
      {kind === 'audio' ? (
        <>
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        </>
      ) : kind === 'cards' ? (
        <>
          <rect x="3" y="5" width="14" height="14" rx="2" />
          <path d="M7 5V3h14v14h-2" />
        </>
      ) : (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </>
      )}
    </svg>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────────

function EmptyState() {
  const t = useTranslations('curriculum');
  return (
    <div className="rounded-[14px] border border-border bg-surface px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">{t('emptyState.title')}</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
        {t('emptyState.body')}
      </p>
    </div>
  );
}
