'use client';

// The Logic-tree tab — a faithful port of the Curriculum Explorer mock.
//
// The spine is the OUTCOME COMPOSITION, not the calendar: Subject → Yearly → each
// Monthly outcome (identified by S#.K#) → the Hours (H#) that compose it, pulled from
// wherever they sit in the year so the calendar slots are deliberately NON-CONTIGUOUS
// (they are ordered by H#, never re-sorted into calendar order — the data layer already
// guarantees this). Groups collapse by default and carry an hour count, so a 3-hour and
// a 26-hour group both read gracefully.
//
// Strand cards (Skill / Knowledge) render only where the weekly skill/knowledge text is
// present; a subject without it (professionalism) shows the node with no strand cards.
// The Subject and Yearly tiers read the subject/annual outcome columns and fall back to
// a quiet placeholder until those are backfilled.

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { SubjectYearBar, PlanLessonButton, type SubjectOption } from './explorer-ui';
import type {
  CompositionTree,
  CompositionYear,
  CompositionGroup,
  CompositionHour,
} from '@/lib/curriculum/composition';

export function LogicTree({
  tree,
  enabled,
  unmappedCount,
  totalRows,
  subjects,
  subjectName,
  years,
  year,
}: {
  tree: CompositionTree;
  /** False when the subject's taxonomy coverage is below the threshold. */
  enabled: boolean;
  /** Rows in this subject NOT mapped to the taxonomy (disclosed, not dropped). */
  unmappedCount: number;
  /** Total active rows for the subject (the banner's denominator). */
  totalRows: number;
  subjects: SubjectOption[];
  subjectName: string;
  years: number[];
  year: number;
}) {
  const t = useTranslations('curriculum');
  const yearData: CompositionYear | undefined = tree.years[0];
  const showTree = enabled && yearData && yearData.groups.length > 0;

  return (
    <div>
      <SubjectYearBar
        tab="tree"
        subjects={subjects}
        subjectCode={tree.subject}
        years={years}
        year={year}
      />
      {showTree ? (
        <TreeBody tree={tree} yearData={yearData} unmappedCount={unmappedCount} totalRows={totalRows} />
      ) : (
        <div className="px-[26px] py-[64px] text-center">
          <p className="text-[14px] text-text-muted">
            {t('tabs.logicTreeDisabled', { subject: subjectName })}
          </p>
        </div>
      )}
    </div>
  );
}

function TreeBody({
  tree,
  yearData,
  unmappedCount,
  totalRows,
}: {
  tree: CompositionTree;
  yearData: CompositionYear;
  unmappedCount: number;
  totalRows: number;
}) {
  const t = useTranslations('curriculum');
  const locale = useLocale();

  const [openKey, setOpenKey] = useState<string | null>(null);
  // The IN FOCUS rail: default to the first hour of the first group.
  const [selected, setSelected] = useState<{ groupKey: string; hourIdx: number }>(() => ({
    groupKey: yearData.groups[0]?.key ?? '',
    hourIdx: 0,
  }));

  const selectedGroup =
    yearData.groups.find((g) => g.key === selected.groupKey) ?? yearData.groups[0];
  const selectedHour = selectedGroup?.hours[selected.hourIdx] ?? selectedGroup?.hours[0] ?? null;

  const crumb =
    t('tree.breadcrumb', { year: formatNumber(yearData.year, locale) }) +
    (openKey ? ` › ${t('tree.monthlyOutcome')} ${openKey}` : '');

  return (
    <div>
      {/* Disclosure: rows without a well-formed taxonomy id are NOT part of the tree.
          Quiet, informational chrome (slate) — not an error. TODO: once the curriculum
          upload/validation surface exists, deep-link this to that subject's unmapped
          rows so a coordinator can fix them at source. */}
      {unmappedCount > 0 ? (
        <div className="mx-[26px] mt-[16px] flex items-start gap-[9px] rounded-[10px] border border-[#E4DED4] bg-[#F6F3EE] px-[13px] py-[10px]">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8A8178"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="mt-[1px] shrink-0"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" />
          </svg>
          <p className="text-[12.5px] leading-[1.45] text-[#6C6259]">
            {t('tree.unmappedBanner', { n: unmappedCount, m: totalRows })}
          </p>
        </div>
      ) : null}
      <div className="grid gap-[22px] px-[26px] pb-[26px] pt-[18px] lg:grid-cols-[minmax(0,1fr)_328px]">
        <div>
          <div className="mx-auto max-w-[720px]">
            <div className="mb-[14px] text-[11.5px] text-[#A79E94]">{crumb}</div>

          {/* Subject tier */}
          <div className="rounded-[12px] border border-[#EAD9C5] bg-surface-cream px-[15px] py-[12px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#8A6D57]">
              {t('tree.subject')}
            </div>
            <OutcomeText value={tree.subjectOutcome} placeholder={t('tree.subjectNotRecorded')} className="mt-[2px] text-[14px] font-medium" />
          </div>
          <div className="mx-auto h-[12px] w-[2px] bg-teal" />

          {/* Yearly tier */}
          <div className="rounded-[12px] border border-[#EDE1D0] bg-[#F8F1E8] px-[15px] py-[12px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#9A7B5C]">
              {t('tree.yearly', { n: formatNumber(yearData.year, locale) })}
            </div>
            <OutcomeText value={yearData.yearlyOutcome} placeholder={t('tree.yearlyNotRecorded')} className="mt-[2px] text-[13.5px]" />
          </div>

          {/* Monthly-outcome accordion */}
          <div className="ms-[16px] mt-[10px] flex flex-col gap-[9px] border-s-2 border-[#E9E0D2] ps-[16px]">
            {yearData.groups.map((group) => (
              <OutcomeNode
                key={group.key}
                group={group}
                open={openKey === group.key}
                onToggle={() => setOpenKey((k) => (k === group.key ? null : group.key))}
                selectedHourIdx={selected.groupKey === group.key ? selected.hourIdx : -1}
                onSelectHour={(hourIdx) => setSelected({ groupKey: group.key, hourIdx })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="self-start">
        <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
          {t('focus.inFocusPlain')}
        </div>
        {selectedGroup && selectedHour ? (
          <FocusRail tree={tree} yearData={yearData} group={selectedGroup} hour={selectedHour} />
        ) : null}
      </div>
      </div>
    </div>
  );
}

// ── One monthly-outcome node (accordion) ────────────────────────────────────────────

function OutcomeNode({
  group,
  open,
  onToggle,
  selectedHourIdx,
  onSelectHour,
}: {
  group: CompositionGroup;
  open: boolean;
  onToggle: () => void;
  selectedHourIdx: number;
  onSelectHour: (hourIdx: number) => void;
}) {
  const t = useTranslations('curriculum');
  const summary =
    group.skillOutcome ?? group.knowledgeOutcome ?? group.hours[0]?.dailyOutcome ?? group.key;
  const hasStrands = Boolean(group.skillOutcome || group.knowledgeOutcome);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-[10px] rounded-[11px] border border-[#EDE1D0] bg-[#F8F1E8] px-[13px] py-[11px] text-start"
      >
        <Chevron open={open} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[7px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#9A7B5C]">
              {t('tree.monthlyOutcome')}
            </span>
            <code className="rounded-[5px] bg-[#F1EBE1] px-[6px] py-px font-mono text-[10px] text-[#8A8178]">
              {group.skillLo} · {group.knowledgeLo}
            </code>
          </div>
          <div dir="auto" className="mt-[2px] truncate text-[12.5px] text-ink">
            {summary}
          </div>
        </div>
        <span className="whitespace-nowrap text-[11px] text-[#A79E94]">
          {t('tree.hours', { count: group.hours.length })}
        </span>
      </button>

      {open ? (
        <div className="ms-[20px] mt-[9px] border-s-2 border-[#E3EAE8] ps-[15px]">
          {hasStrands ? (
            <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
              {group.skillOutcome ? (
                <StrandCard
                  variant="skill"
                  label={t('tree.skill')}
                  code={group.skillLo}
                  text={group.skillOutcome}
                />
              ) : null}
              {group.knowledgeOutcome ? (
                <StrandCard
                  variant="knowledge"
                  label={t('tree.knowledge')}
                  code={group.knowledgeLo}
                  text={group.knowledgeOutcome}
                />
              ) : null}
            </div>
          ) : null}

          <div className={cn('flex items-center gap-[8px] mb-[8px]', hasStrands ? 'mt-[12px]' : 'mt-[2px]')}>
            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
              {t('tree.composingHours')}
            </span>
          </div>
          <div className="flex flex-col gap-[7px]">
            {group.hours.map((hour, i) => (
              <HourRow
                key={`${hour.lessonKey}-${i}`}
                hour={hour}
                selected={i === selectedHourIdx}
                onSelect={() => onSelectHour(i)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StrandCard({
  variant,
  label,
  code,
  text,
}: {
  variant: 'skill' | 'knowledge';
  label: string;
  code: string | null;
  text: string;
}) {
  const styles =
    variant === 'skill'
      ? { box: 'border-[#6B7C93] bg-[#F7F9FB]', label: 'text-[#6B7C93]', chip: 'bg-[#EAEFF5] text-[#5C6B7D]' }
      : { box: 'border-[#B08D57] bg-[#FBF7F0]', label: 'text-[#B08D57]', chip: 'bg-[#F3E9D7] text-[#96733F]' };
  return (
    <div className={cn('rounded-[11px] border-[1.5px] px-[12px] py-[10px]', styles.box)}>
      <div className="flex items-center gap-[6px]">
        <span className={cn('text-[10px] font-bold tracking-[0.04em]', styles.label)}>{label}</span>
        {code ? <code className={cn('rounded-[5px] px-[5px] py-px font-mono text-[9.5px]', styles.chip)}>{code}</code> : null}
      </div>
      <div dir="auto" className="mt-[4px] text-[12px] leading-[1.4] text-ink [overflow-wrap:anywhere]">
        {text}
      </div>
    </div>
  );
}

function HourRow({
  hour,
  selected,
  onSelect,
}: {
  hour: CompositionHour;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-[11px] rounded-[10px] border bg-surface px-[12px] py-[9px] text-start transition-colors',
        selected ? 'border-teal ring-[3px] ring-teal/10' : 'border-[#ECE3D5] hover:border-teal-tint-border',
      )}
    >
      <code className="whitespace-nowrap rounded-[6px] bg-[#F1EBE1] px-[7px] py-[3px] font-mono text-[10px] font-semibold text-[#7A6E62]">
        {hour.hour != null ? `H${hour.hour}` : '—'}
      </code>
      <div className="min-w-0 flex-1">
        <div dir="auto" className="text-[13px] leading-[1.4] text-ink [overflow-wrap:anywhere]">
          {hour.dailyOutcome || t('empty')}
        </div>
        <div className="mt-[5px] flex flex-wrap items-center gap-[6px]">
          {hour.strandLabel ? (
            <span dir="auto" className="rounded-[6px] bg-surface-cream px-[7px] py-[2px] text-[10px] font-semibold text-[#8A6D57]">
              {hour.strandLabel}
            </span>
          ) : null}
          <span className="text-[10px] text-[#A79E94]">{slotLabel(hour, locale, t)}</span>
        </div>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#C7BFB5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0 rtl:-scale-x-100"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

// ── IN FOCUS rail ────────────────────────────────────────────────────────────────────

function FocusRail({
  tree,
  yearData,
  group,
  hour,
}: {
  tree: CompositionTree;
  yearData: CompositionYear;
  group: CompositionGroup;
  hour: CompositionHour;
}) {
  const t = useTranslations('curriculum');
  const locale = useLocale();

  const ladder: { chip: string; tone: 'hour' | 'skill' | 'knowledge' | 'plain'; text: string }[] = [];
  ladder.push({ chip: hour.hour != null ? `H${hour.hour}` : 'H', tone: 'hour', text: hour.dailyOutcome ?? '' });
  if (group.skillOutcome) ladder.push({ chip: group.skillLo ?? 'S', tone: 'skill', text: group.skillOutcome });
  if (group.knowledgeOutcome) ladder.push({ chip: group.knowledgeLo ?? 'K', tone: 'knowledge', text: group.knowledgeOutcome });
  ladder.push({ chip: t('tree.yearShort'), tone: 'plain', text: yearData.yearlyOutcome ?? t('tree.yearlyNotRecorded') });
  ladder.push({ chip: t('tree.subjShort'), tone: 'plain', text: tree.subjectOutcome ?? t('tree.subjectNotRecorded') });

  return (
    <div className="rounded-[14px] border-[1.5px] border-teal bg-surface p-[15px] shadow-[0_14px_30px_-24px_rgba(31,122,108,0.6)]">
      <div className="mb-[10px] flex flex-wrap gap-[6px]">
        {hour.strandLabel ? <FocusPill>{hour.strandLabel}</FocusPill> : null}
        <FocusPill>{group.skillLo} · {group.knowledgeLo}</FocusPill>
      </div>
      {hour.taxonomyId ? (
        <div className="mb-[8px] text-[10px] text-[#A79E94]">
          {t('tree.composes')} <span className="font-mono">{hour.taxonomyId}</span> · {slotLabel(hour, locale, t)}
        </div>
      ) : null}
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A79E94]">
        {t('tree.dailyOutcomeHour')}
      </div>
      <p dir="auto" className="mb-[14px] mt-[5px] text-[15.5px] font-medium leading-[1.4] text-ink [overflow-wrap:anywhere]">
        {hour.dailyOutcome || t('empty')}
      </p>

      <div className="mb-[9px] text-[10px] font-semibold uppercase text-[#A79E94]">{t('tree.laddersUpTo')}</div>
      <div className="mb-[15px] flex flex-col">
        {ladder.map((rung, i) => (
          <div key={i}>
            <div className="flex items-start gap-[9px]">
              <LadderChip tone={rung.tone}>{rung.chip}</LadderChip>
              <span dir="auto" className={cn('text-[12px] leading-[1.35] [overflow-wrap:anywhere]', i === 0 ? 'font-medium text-ink' : 'text-[#5C544E]')}>
                {rung.text}
              </span>
            </div>
            {i < ladder.length - 1 ? <div className="ms-[10px] h-[11px] w-[2px] bg-[#E0D6C7]" /> : null}
          </div>
        ))}
      </div>

      {hour.resources.length > 0 ? (
        <>
          <div className="mb-[7px] text-[10px] font-semibold uppercase text-[#A79E94]">{t('focus.resources')}</div>
          <ul className="mb-[14px] space-y-[6px]">
            {hour.resources.map((r, i) => (
              <li key={`${r.label}-${i}`} dir="auto" className="flex items-start gap-[8px] text-[13px] text-ink">
                <DocIcon />
                <span className="min-w-0 break-all">{r.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <PlanLessonButton lessonKey={hour.lessonKey} period={hour.calendarSlot.period} />
    </div>
  );
}

function FocusPill({ children }: { children: React.ReactNode }) {
  return (
    <span dir="auto" className="rounded-[7px] bg-surface-cream px-[9px] py-[3px] text-[11px] font-semibold text-[#8A6D57]">
      {children}
    </span>
  );
}

function LadderChip({ tone, children }: { tone: 'hour' | 'skill' | 'knowledge' | 'plain'; children: React.ReactNode }) {
  if (tone === 'plain') {
    return <span className="w-[30px] shrink-0 text-[9.5px] font-bold text-[#A79E94]">{children}</span>;
  }
  const cls =
    tone === 'hour'
      ? 'bg-[#F1EBE1] text-[#7A6E62]'
      : tone === 'skill'
        ? 'bg-[#EAEFF5] text-[#5C6B7D]'
        : 'bg-[#F3E9D7] text-[#96733F]';
  return (
    <code className={cn('whitespace-nowrap rounded-[5px] px-[6px] py-[2px] font-mono text-[9.5px] font-bold', cls)}>
      {children}
    </code>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────────────

function OutcomeText({
  value,
  placeholder,
  className,
}: {
  value: string | null;
  placeholder: string;
  className?: string;
}) {
  if (value) {
    return <div dir="auto" className={cn('text-ink [overflow-wrap:anywhere]', className)}>{value}</div>;
  }
  return <div className={cn('italic text-text-faint', className)}>{placeholder}</div>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
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

function DocIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-[2px] shrink-0 text-teal">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

/** "Yr N · Wk W · PP" — the composing hour's calendar coordinate. */
function slotLabel(
  hour: CompositionHour,
  locale: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const { year, week, period } = hour.calendarSlot;
  const parts = [
    t('tree.slotYear', { n: formatNumber(year, locale) }),
    t('tree.slotWeek', { n: formatNumber(week, locale) }),
  ];
  if (period != null) parts.push(t('tree.slotPeriod', { n: formatNumber(period, locale) }));
  return parts.join(' · ');
}
