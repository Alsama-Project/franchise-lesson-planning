'use client';

// The Topics tab — a faithful port of the Explorer mock's Topics view.
//
// Focus area → Topic (left rail) → the topic's SPIRAL across years (middle) → the
// selected year's lesson (IN FOCUS rail). The spiral is presence/recurrence ONLY: a
// year is "taught" or "not taught" — there is NO depth gradient, because no source
// column expresses increasing complexity. Focus areas come from `focus_area` TEXT where
// present; for subjects without it (english) the data layer groups by THEME and flags
// it, which we surface with a small note.

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  SubjectYearPills,
  PlanLessonButton,
  type SubjectOption,
} from './explorer-ui';
import type { TopicsData, Topic, TopicThreadYear } from '@/lib/curriculum/composition';

export function Topics({
  data,
  subjects,
  subjectName,
  year,
}: {
  data: TopicsData;
  subjects: SubjectOption[];
  subjectName: string;
  year: number;
}) {
  const t = useTranslations('curriculum');
  const hasTopics = data.focusAreas.some((fa) => fa.topics.length > 0);

  return (
    <div>
      <SubjectYearPills
        tab="topics"
        subjects={subjects}
        subjectCode={data.subject}
        years={data.years}
        year={year}
      />
      {hasTopics ? (
        <TopicsBody data={data} />
      ) : (
        <div className="px-[26px] py-[64px] text-center">
          <p className="text-[14px] text-text-muted">{t('topics.empty', { subject: subjectName })}</p>
        </div>
      )}
    </div>
  );
}

type Address = { faIdx: number; topicIdx: number };

function TopicsBody({ data }: { data: TopicsData }) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  const isThemeMode = data.groupedBy === 'theme';

  // Selection address (focusAreaIdx, topicIdx). English (theme mode) is a FLAT,
  // always-visible list, so it auto-selects the first topic. Focus-area subjects render
  // COLLAPSIBLE Focus Area sections that are collapsed by default with nothing selected
  // — the teacher expands a Focus Area and picks a Topic to drive the spiral.
  const firstFa = data.focusAreas.findIndex((fa) => fa.topics.length > 0);
  const [selected, setSelected] = useState<Address | null>(() =>
    isThemeMode && firstFa !== -1 ? { faIdx: firstFa, topicIdx: 0 } : null,
  );
  // Which Focus Area sections are open (focus-area mode only).
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const focusArea = selected ? data.focusAreas[selected.faIdx] : undefined;
  const topic: Topic | undefined = selected ? focusArea?.topics[selected.topicIdx] : undefined;

  // Presence across ALL of the subject's years → the spiral rows.
  const taughtByYear = useMemo(() => {
    const m = new Map<number, TopicThreadYear>();
    for (const ty of topic?.years ?? []) m.set(ty.year, ty);
    return m;
  }, [topic]);

  // Selected year for the IN FOCUS rail — default to the topic's first taught year.
  const [selectedYear, setSelectedYear] = useState<number | null>(topic?.years[0]?.year ?? null);
  const selectedThread =
    (selectedYear != null ? taughtByYear.get(selectedYear) : null) ?? topic?.years[0] ?? null;

  const selectTopic = (nextFa: number, nextTopic: number) => {
    setSelected({ faIdx: nextFa, topicIdx: nextTopic });
    setSelectedYear(data.focusAreas[nextFa]?.topics[nextTopic]?.years[0]?.year ?? null);
  };
  const toggleFa = (fi: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fi)) next.delete(fi);
      else next.add(fi);
      return next;
    });

  // Theme mode has a single null-focus-area group; its topic count is the count of
  // themes that survived cleaning (junk dropped, case-variants merged) — surfaced next
  // to the "grouped by theme" disclosure.
  const themeCount = isThemeMode ? (data.focusAreas[0]?.topics.length ?? 0) : 0;

  return (
    <div className="grid gap-[20px] px-[26px] pb-[28px] pt-[18px] lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      {/* Left rail: Focus area → Topic (collapsible), or a flat theme list for english */}
      <div className="self-start">
        <div className="mb-[10px] flex flex-wrap items-baseline gap-x-[6px] gap-y-[2px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8A8178]">
            {isThemeMode ? t('topics.byThemeLabel') : t('topics.focusAreaLabel')}
          </span>
          {isThemeMode ? (
            <span className="text-[11px] text-[#A79E94]">· {t('topics.themeCount', { count: themeCount })}</span>
          ) : null}
        </div>
        {isThemeMode ? (
          <ThemeRail
            group={data.focusAreas[firstFa === -1 ? 0 : firstFa]}
            faIdx={firstFa === -1 ? 0 : firstFa}
            selected={selected}
            onSelect={selectTopic}
          />
        ) : (
          <FocusAreaRail
            focusAreas={data.focusAreas}
            expanded={expanded}
            selected={selected}
            onToggle={toggleFa}
            onSelect={selectTopic}
          />
        )}
      </div>

      {/* Middle: the spiral (or a prompt until a topic is chosen) */}
      <div>
        {topic ? (
          <>
            <div dir="auto" className="mb-[18px] text-[17px] font-semibold text-ink">{topic.topic}</div>
            <div className="flex flex-col">
              {data.years.map((yr, i) => {
                const thread = taughtByYear.get(yr);
                const taught = Boolean(thread);
                const selected2 = selectedYear === yr && taught;
                return (
                  <div key={yr} className="flex gap-[16px]">
                    <div className="flex w-[52px] flex-col items-center">
                      <span
                        className="w-[48px] rounded-full py-[5px] text-center text-[11px] font-bold text-white"
                        style={{ background: yearAccent(i, data.years.length) }}
                      >
                        {t('year', { n: formatNumber(yr, locale) })}
                      </span>
                      {i < data.years.length - 1 ? <span className="my-[4px] w-[2px] flex-1 bg-[#DCEAE6]" /> : null}
                    </div>
                    <SpiralCard
                      taught={taught}
                      selected={selected2}
                      thread={thread ?? null}
                      presence={data.years.map((y) => taughtByYear.has(y))}
                      onSelect={() => (taught ? setSelectedYear(yr) : undefined)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[#DBCDBB] bg-[#F5EDE5]/40 px-[18px] py-[40px] text-center text-[13px] text-text-muted">
            {t('topics.pickTopic')}
          </div>
        )}
      </div>

      {/* Right: IN FOCUS */}
      <div className="self-start">
        <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
          {selectedThread
            ? t('topics.inFocusYear', { year: formatNumber(selectedThread.year, locale) })
            : t('focus.inFocusPlain')}
        </div>
        {selectedThread && topic ? (
          <TopicFocus thread={selectedThread} topicLabel={topic.topic} />
        ) : (
          <div className="rounded-[14px] border border-border bg-surface-subtle p-[15px] text-[13px] text-text-muted">
            {topic ? t('topics.selectYear') : t('topics.pickTopic')}
          </div>
        )}
      </div>
    </div>
  );
}

/** The flat, always-visible theme list (english fallback — no focus_area structure). */
function ThemeRail({
  group,
  faIdx,
  selected,
  onSelect,
}: {
  group: TopicsData['focusAreas'][number] | undefined;
  faIdx: number;
  selected: Address | null;
  onSelect: (fi: number, ti: number) => void;
}) {
  const t = useTranslations('curriculum');
  if (!group) return null;
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#EFE8DD]">
      <div className="bg-[#F8F1E8] px-[13px] py-[11px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#9A7B5C]">
          {t('topics.topicsHeading')}
        </span>
      </div>
      <div className="bg-[#FCFAF6] p-[6px]">
        {group.topics.map((tp, ti) => (
          <TopicButton
            key={ti}
            label={tp.topic}
            active={selected?.faIdx === faIdx && selected?.topicIdx === ti}
            onSelect={() => onSelect(faIdx, ti)}
          />
        ))}
      </div>
    </div>
  );
}

/** Collapsible Focus Area → Topic accordion (subjects with focus_area text). Sections
 *  are collapsed by default and show their topic count; expanding one reveals its topics. */
function FocusAreaRail({
  focusAreas,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  focusAreas: TopicsData['focusAreas'];
  expanded: Set<number>;
  selected: Address | null;
  onToggle: (fi: number) => void;
  onSelect: (fi: number, ti: number) => void;
}) {
  const t = useTranslations('curriculum');
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#EFE8DD]">
      {focusAreas.map((fa, fi) => {
        const open = expanded.has(fi);
        return (
          <div key={fi} className={fi > 0 ? 'border-t border-[#F3EEE6]' : ''}>
            <button
              type="button"
              onClick={() => onToggle(fi)}
              aria-expanded={open}
              className="flex w-full items-center gap-[9px] bg-[#F8F1E8] px-[13px] py-[11px] text-start transition-colors hover:bg-[#F5ECDF]"
            >
              <Chevron open={open} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-[#9A7B5C]">
                  {t('topics.focusArea')}
                </span>
                {fa.focusArea ? (
                  <span dir="auto" className="mt-[1px] block truncate text-[13px] font-semibold text-ink">
                    {fa.focusArea}
                  </span>
                ) : null}
              </span>
              <span className="whitespace-nowrap text-[11px] text-[#A79E94]">
                {t('topics.topicCount', { count: fa.topics.length })}
              </span>
            </button>
            {open ? (
              <div className="bg-[#FCFAF6] p-[6px]">
                {fa.topics.map((tp, ti) => (
                  <TopicButton
                    key={ti}
                    label={tp.topic}
                    active={selected?.faIdx === fi && selected?.topicIdx === ti}
                    onSelect={() => onSelect(fi, ti)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A single selectable Topic row (shared by both rails). */
function TopicButton({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-[9px] rounded-[8px] px-[10px] py-[9px] text-start transition-colors',
        active ? 'bg-teal-tint' : 'hover:bg-surface-subtle',
      )}
    >
      <span className={cn('size-[6px] shrink-0 rounded-full', active ? 'bg-teal' : 'bg-[#CFC6BA]')} />
      <span dir="auto" className={cn('min-w-0 flex-1 text-[13px] [overflow-wrap:anywhere]', active ? 'font-semibold text-teal-deep' : 'text-[#5C544E]')}>
        {label}
      </span>
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={open ? '#9A7B5C' : '#B4AA9E'}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('shrink-0', !open && 'rtl:-scale-x-100')}
    >
      {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

function SpiralCard({
  taught,
  selected,
  thread,
  presence,
  onSelect,
}: {
  taught: boolean;
  selected: boolean;
  thread: TopicThreadYear | null;
  presence: boolean[];
  onSelect: () => void;
}) {
  const t = useTranslations('curriculum');
  if (!taught) {
    return (
      <div className="mb-[12px] flex-1 rounded-[12px] border border-dashed border-[#DBCDBB] bg-[#F5EDE5]/40 px-[16px] py-[12px] text-[13px] italic text-text-faint">
        {t('topics.notTaught')}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'mb-[12px] flex-1 rounded-[12px] border px-[16px] py-[12px] text-start transition-shadow',
        selected
          ? 'border-[1.5px] border-teal bg-[#EFF6F4] shadow-[0_12px_26px_-20px_rgba(31,122,108,0.5)]'
          : 'border border-[#EAD9C5] bg-surface-cream',
      )}
    >
      {/* Presence pips — filled where the topic is TAUGHT (recurrence, not depth). */}
      <div className="mb-[4px] flex gap-[3px]" aria-hidden>
        {presence.map((on, i) => (
          <span key={i} className={cn('size-[6px] rounded-full', on ? 'bg-teal' : 'border border-[#C9BEB0]')} />
        ))}
      </div>
      <div dir="auto" className="text-[14px] leading-[1.45] text-ink [overflow-wrap:anywhere]">
        {thread?.dailyOutcome || t('empty')}
      </div>
    </button>
  );
}

function TopicFocus({ thread, topicLabel }: { thread: TopicThreadYear; topicLabel: string }) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  const coords = parseLessonKey(thread.lessonKey);
  const path = coords
    ? [
        t('year', { n: formatNumber(thread.year, locale) }),
        coords.month,
        coords.week != null ? t('tree.slotWeek', { n: formatNumber(coords.week, locale) }) : null,
        coords.period != null ? t('tree.slotPeriod', { n: formatNumber(coords.period, locale) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <div className="rounded-[14px] border-[1.5px] border-teal bg-surface p-[15px] shadow-[0_14px_30px_-24px_rgba(31,122,108,0.6)]">
      <div className="mb-[10px] flex flex-wrap gap-[6px]">
        {thread.strandLabel ? (
          <span dir="auto" className="rounded-[7px] bg-surface-cream px-[9px] py-[3px] text-[11px] font-semibold text-[#8A6D57]">
            {thread.strandLabel}
          </span>
        ) : null}
        <span dir="auto" className="rounded-[7px] bg-surface-cream px-[9px] py-[3px] text-[11px] font-semibold text-[#8A6D57]">
          {topicLabel}
        </span>
      </div>
      {path ? <div className="mb-[8px] text-[10px] text-[#A79E94]">{path}</div> : null}
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A79E94]">
        {t('topics.dailyLearningOutcome')}
      </div>
      <p dir="auto" className="mb-[14px] mt-[5px] text-[15.5px] font-medium leading-[1.4] text-ink [overflow-wrap:anywhere]">
        {thread.dailyOutcome || t('empty')}
      </p>
      {thread.resources.length > 0 ? (
        <>
          <div className="mb-[7px] text-[10px] font-semibold uppercase text-[#A79E94]">{t('focus.resources')}</div>
          <ul className="mb-[14px] space-y-[6px]">
            {thread.resources.map((r, i) => (
              <li key={`${r.label}-${i}`} dir="auto" className="flex items-start gap-[8px] text-[13px] text-ink">
                <ImageIcon />
                <span className="min-w-0 break-all">{r.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <PlanLessonButton lessonKey={thread.lessonKey} period={coords?.period ?? null} />
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-[2px] shrink-0 text-teal">
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <circle cx="9" cy="12" r="2" />
    </svg>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────────────

/** A teal that deepens with the year index — purely positional chrome, not a depth
 *  signal (there is none). Prep → pale, final year → deep teal. */
function yearAccent(i: number, total: number): string {
  const stops = ['#A9CFC7', '#6FB3A6', '#4C9B8F', '#3D9084', '#2E8577', '#186155'];
  if (total <= 1) return stops[stops.length - 1];
  const idx = Math.round((i / (total - 1)) * (stops.length - 1));
  return stops[idx];
}

/** Parse `subject|Y{year}|{month}|W{week}|P{period}` into its calendar coordinate. */
function parseLessonKey(key: string): { month: string; week: number | null; period: number | null } | null {
  const parts = key.split('|');
  if (parts.length < 5) return null;
  const month = parts[2] ?? '';
  const week = /^W(\d+)$/.exec(parts[3] ?? '');
  const period = /^P(\d+)$/.exec(parts[4] ?? '');
  return {
    month,
    week: week ? Number(week[1]) : null,
    period: period ? Number(period[1]) : null,
  };
}
