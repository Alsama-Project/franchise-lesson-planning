'use client';

// The Search tab — instant client-side search + faceted filter over ONE subject's
// lessons, presented as the design's SLICE BAR: a collapsed "Search lessons" bar that
// opens into a slicer panel. Facets are ADDED from that panel and shown as INLINE chips
// in the bar (Year · Month · Topic · Skill / Focus area), plus a "Group by" selector. The
// whole subject is loaded once (server: getSearchData), so every keystroke / chip filters
// in memory — no round-trip, no spinner, no taxonomy dependency.
//
// SUBJECT-CONDITIONAL FACETS reuse the shared capability probe (#99, composition.ts), not
// a second definition: Skill (english, arabic — canonicalised to the ~5 real values),
// Focus area (the six focus_area subjects). Year / Month / Topic / Has-resources are
// universal. Results drive the detail rail + "Plan this lesson →" (existing create flow).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { skillKeyOf, canonicalSkill, SKILL_PILL } from '@/components/curriculum/skill';
import { PlanLessonButton, type SubjectOption } from './explorer-ui';
import {
  highlightSegments,
  scoreFields,
  tokenize,
  type WeightedField,
} from '@/lib/curriculum/search-match';
import type { SearchData, SearchRecord } from '@/lib/curriculum/search';
import type { SubjectCapabilities } from '@/lib/curriculum/composition';

type DimKey = 'years' | 'months' | 'topics' | 'skills' | 'focusAreas';
type GroupBy = 'none' | 'topics' | 'years' | 'months';

interface FacetState {
  years: Set<number>;
  months: Set<string>;
  topics: Set<string>;
  skills: Set<string>;
  focusAreas: Set<string>;
  hasResources: boolean;
}

const EMPTY_FACETS: FacetState = {
  years: new Set(),
  months: new Set(),
  topics: new Set(),
  skills: new Set(),
  focusAreas: new Set(),
  hasResources: false,
};

export function Search({
  data,
  capabilities,
  subjects,
  subjectCode,
  subjectName,
  initialQuery,
}: {
  data: SearchData;
  capabilities: SubjectCapabilities;
  subjects: SubjectOption[];
  subjectCode: string;
  subjectName: string;
  initialQuery: string;
}) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [facets, setFacets] = useState<FacetState>(EMPTY_FACETS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [openDim, setOpenDim] = useState<DimKey | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  const barRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── URL sync (?q=) — debounced replace so searches are shareable / back-safe ──────
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const sp = new URLSearchParams();
      sp.set('tab', 'search');
      sp.set('subject', subjectCode);
      if (query.trim()) sp.set('q', query.trim());
      router.replace(`/curriculum?${sp.toString()}`, { scroll: false });
    }, 200);
    return () => {
      if (urlTimer.current) clearTimeout(urlTimer.current);
    };
  }, [query, subjectCode, router]);

  // Focus the field when the bar opens; close the slicer on an outside click.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(false);
        setOpenDim(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const queryTokens = useMemo(() => tokenize(query), [query]);

  // ── Facet option lists (Focus area → Topic cascades; Skill canonicalised) ─────────
  const focusAreaOptions = useMemo(() => distinct(data.records.map((r) => r.focusArea)), [data.records]);
  const skillOptions = useMemo(
    () => distinct(data.records.map((r) => canonicalSkill(r.linguisticSkill))),
    [data.records],
  );
  const topicOptions = useMemo(() => {
    const scoped =
      facets.focusAreas.size > 0
        ? data.records.filter((r) => r.focusArea && facets.focusAreas.has(r.focusArea))
        : data.records;
    return distinct(scoped.map((r) => r.theme));
  }, [data.records, facets.focusAreas]);

  // A selected topic outside the current focus-area cascade is IGNORED (not deleted).
  const effectiveTopics = useMemo(() => {
    if (facets.topics.size === 0) return facets.topics;
    const allowed = new Set(topicOptions);
    return new Set([...facets.topics].filter((tp) => allowed.has(tp)));
  }, [facets.topics, topicOptions]);

  const showSkill = capabilities.hasLinguisticSkillText && skillOptions.length > 0;
  const showFocusArea = capabilities.hasFocusAreaText && focusAreaOptions.length > 0;
  const showTopic = topicOptions.length > 0;
  const hasResourcesFacet = useMemo(() => data.records.some((r) => r.resources.length > 0), [data.records]);

  const effectiveFacets = useMemo<FacetState>(
    () => ({ ...facets, topics: effectiveTopics }),
    [facets, effectiveTopics],
  );

  const toggleValue = useCallback(
    <K extends 'years' | 'months' | 'topics' | 'skills' | 'focusAreas'>(
      key: K,
      value: FacetState[K] extends Set<infer V> ? V : never,
    ) => {
      setFacets((f) => {
        const next = new Set(f[key] as Set<typeof value>);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return { ...f, [key]: next };
      });
    },
    [],
  );

  // ── Facet dimensions (drive both the slicer rows and the inline chips) ────────────
  const yearLabel = useCallback((y: number) => t('year', { n: formatNumber(y, locale) }), [t, locale]);
  const dimensions = useMemo<Dimension[]>(() => {
    const dims: Dimension[] = [];
    if (data.years.length > 0) {
      dims.push({
        key: 'years',
        label: t('search.facets.year'),
        options: data.years.map((y) => ({
          value: String(y),
          label: yearLabel(y),
          selected: facets.years.has(y),
          toggle: () => toggleValue('years', y),
        })),
      });
    }
    if (data.months.length > 0) {
      dims.push({
        key: 'months',
        label: t('search.facets.month'),
        options: data.months.map((m) => ({
          value: m,
          label: m,
          selected: facets.months.has(m),
          toggle: () => toggleValue('months', m),
        })),
      });
    }
    if (showTopic) {
      dims.push({
        key: 'topics',
        label: t('search.facets.topic'),
        options: topicOptions.map((tp) => ({
          value: tp,
          label: tp,
          selected: effectiveTopics.has(tp),
          toggle: () => toggleValue('topics', tp),
        })),
      });
    }
    if (showSkill) {
      dims.push({
        key: 'skills',
        label: t('search.facets.skill'),
        options: skillOptions.map((sk) => ({
          value: sk,
          label: sk,
          selected: facets.skills.has(sk),
          toggle: () => toggleValue('skills', sk),
        })),
      });
    }
    if (showFocusArea) {
      dims.push({
        key: 'focusAreas',
        label: t('search.facets.focusArea'),
        options: focusAreaOptions.map((fa) => ({
          value: fa,
          label: fa,
          selected: facets.focusAreas.has(fa),
          toggle: () => toggleValue('focusAreas', fa),
        })),
      });
    }
    return dims;
  }, [
    data.years, data.months, showTopic, showSkill, showFocusArea, topicOptions, skillOptions,
    focusAreaOptions, facets, effectiveTopics, t, yearLabel, toggleValue,
  ]);

  // Inline chips = every selected option across dimensions (+ the resources toggle).
  const chips = useMemo(() => {
    const out: { id: string; dim: string; label: string; remove: () => void }[] = [];
    for (const d of dimensions) {
      for (const o of d.options) {
        if (o.selected) out.push({ id: `${d.key}:${o.value}`, dim: d.label, label: o.label, remove: o.toggle });
      }
    }
    if (facets.hasResources) {
      out.push({
        id: 'res',
        dim: t('search.facets.more'),
        label: t('search.facets.hasResources'),
        remove: () => setFacets((f) => ({ ...f, hasResources: false })),
      });
    }
    return out;
  }, [dimensions, facets.hasResources, t]);

  const hasQuery = queryTokens.length > 0;
  const active = hasQuery || chips.length > 0;

  // ── Filter (facets, AND across dimensions) then rank (query score) ────────────────
  const results = useMemo(() => {
    const filtered = data.records.filter((r) => matchesFacets(r, effectiveFacets));
    if (!hasQuery) {
      return filtered.map((record) => ({ record, score: 0 })).sort((a, b) => calRank(a.record) - calRank(b.record));
    }
    const scored: Array<{ record: SearchRecord; score: number }> = [];
    for (const record of filtered) {
      const score = scoreFields(searchableFields(record), queryTokens);
      if (score != null) scored.push({ record, score });
    }
    scored.sort((a, b) => b.score - a.score || calRank(a.record) - calRank(b.record));
    return scored;
  }, [data.records, effectiveFacets, hasQuery, queryTokens]);

  const selected =
    results.find((r) => r.record.lessonKey === selectedKey)?.record ?? results[0]?.record ?? null;

  // ── Grouping (Group by Topic / Year / Month) ──────────────────────────────────────
  const groups = useMemo(() => groupResults(results.map((r) => r.record), groupBy, yearLabel), [results, groupBy, yearLabel]);

  const clearAll = useCallback(() => {
    setFacets(EMPTY_FACETS);
    setQuery('');
  }, []);

  const scopeHint = t('search.scope', { subject: subjectName });

  return (
    <div>
      {/* Selector row: subject switcher + the slice bar */}
      <div className="relative z-[5] flex flex-wrap items-start gap-[12px] px-[26px] pt-[20px]">
        <SubjectSelect
          ariaLabel={t('subjectLabel')}
          value={subjectCode}
          subjects={subjects}
          onChange={(code) => {
            const sp = new URLSearchParams();
            sp.set('tab', 'search');
            sp.set('subject', code);
            if (query.trim()) sp.set('q', query.trim());
            router.push(`/curriculum?${sp.toString()}`);
          }}
        />

        <div ref={barRef} className="relative min-w-[300px] flex-1">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-[9px] rounded-[11px] border-[1.5px] border-border-strong bg-surface px-[14px] py-[11px] text-start transition-colors hover:border-[#CBBFAF] hover:bg-surface-subtle"
            >
              <span className="text-[#A79E94]"><SearchGlyph /></span>
              <span dir="auto" className={cn('text-[15px]', hasQuery ? 'text-ink' : 'text-text-faint')}>
                {hasQuery ? query : t('search.placeholder')}
              </span>
              <span className="ms-auto text-[12px] text-[#C7BFB5]">
                {chips.length > 0 ? t('search.selectedCount', { count: chips.length }) : scopeHint}
              </span>
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-[8px] rounded-t-[11px] border-[1.5px] border-teal bg-surface px-[14px] py-[10px]">
                <span className="text-teal"><SearchGlyph /></span>
                {chips.map((c) => (
                  <InlineChip key={c.id} dim={c.dim} label={c.label} onRemove={c.remove} removeAria={t('search.removeFilter', { label: c.label })} />
                ))}
                <input
                  ref={inputRef}
                  type="search"
                  dir="auto"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label={t('search.inputAria', { subject: subjectName })}
                  placeholder={chips.length === 0 ? t('search.placeholder') : ''}
                  className="min-w-[100px] flex-1 bg-transparent py-[3px] text-[15px] text-ink outline-none placeholder:text-text-faint"
                />
                <button
                  type="button"
                  onClick={() => { setOpen(false); setOpenDim(null); }}
                  aria-label={t('search.close')}
                  className="shrink-0 text-[#B4AA9E] transition-colors hover:text-ink"
                >
                  <Chevron dir="up" />
                </button>
              </div>

              <div className="absolute inset-x-0 top-full z-[10] overflow-hidden rounded-b-[13px] border-[1.5px] border-t-0 border-teal bg-surface shadow-[0_30px_54px_-22px_rgba(60,40,30,0.5)]">
                {dimensions.map((d, i) => {
                  const count = d.options.filter((o) => o.selected).length;
                  const expanded = openDim === d.key;
                  return (
                    <div key={d.key} className={i > 0 ? 'border-t border-[#F3EEE6]' : ''}>
                      <button
                        type="button"
                        onClick={() => setOpenDim((p) => (p === d.key ? null : d.key))}
                        aria-expanded={expanded}
                        className="flex w-full items-center gap-[10px] px-[14px] py-[12px] text-start transition-colors hover:bg-surface-subtle"
                      >
                        <span className="flex-1 text-[14px] text-[#3A332E]">{d.label}</span>
                        <span className="text-[12px] text-[#A79E94]">
                          {count > 0 ? t('search.selectedCount', { count }) : t('search.anyValue')}
                        </span>
                        <Chevron dir={expanded ? 'down' : 'right'} />
                      </button>
                      {expanded ? (
                        <div className="flex flex-wrap gap-[6px] px-[14px] pb-[12px]">
                          {d.options.map((o) => (
                            <Chip key={o.value} active={o.selected} onClick={o.toggle} label={o.label} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {hasResourcesFacet ? (
                  <label className="flex cursor-pointer items-center gap-[10px] border-t border-[#F3EEE6] px-[14px] py-[12px]">
                    <input
                      type="checkbox"
                      checked={facets.hasResources}
                      onChange={() => setFacets((f) => ({ ...f, hasResources: !f.hasResources }))}
                      className="size-[16px] accent-teal"
                    />
                    <span className="text-[14px] text-[#3A332E]">{t('search.resourcesOnly')}</span>
                  </label>
                ) : null}

                <div className="flex flex-wrap items-center gap-[8px] border-t border-[#F0EAE1] bg-surface-subtle px-[14px] py-[11px]">
                  <span className="text-[12px] text-[#8A8178]">{t('search.groupByLabel')}</span>
                  {(['none', 'topics', 'years', 'months'] as GroupBy[]).map((g) => (
                    <GroupChip key={g} active={groupBy === g} onClick={() => setGroupBy(g)} label={groupByLabel(g, t)} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {active ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[13px] font-semibold text-teal transition-colors hover:text-teal-deep"
          >
            {t('search.clearAll')}
          </button>
        ) : null}
      </div>

      {/* Body: results + detail rail (facets live in the bar, so no left rail) */}
      <div className="grid gap-[20px] px-[26px] pb-[28px] pt-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {active ? (
            <div className="mb-[12px] text-[12px] font-semibold text-text-muted">
              {t('search.resultCount', { count: results.length })}
            </div>
          ) : null}

          {!active ? (
            <SearchState title={t('search.emptyTitle')} body={t('search.emptyBody', { subject: subjectName })} />
          ) : results.length === 0 ? (
            <SearchState title={t('search.noMatchTitle')} body={t('search.noMatchBody')} />
          ) : groupBy === 'none' ? (
            <ul className="flex flex-col gap-[10px]">
              {results.map(({ record }) => (
                <li key={record.lessonKey}>
                  <ResultRow
                    record={record}
                    queryTokens={queryTokens}
                    active={record.lessonKey === selected?.lessonKey}
                    onSelect={() => setSelectedKey(record.lessonKey)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-[18px]">
              {groups.map((g) => (
                <div key={g.key}>
                  <div dir="auto" className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.05em] text-[#9A7B5C]">
                    {g.label} · {t('search.resultCount', { count: g.records.length })}
                  </div>
                  <ul className="flex flex-col gap-[10px]">
                    {g.records.map((record) => (
                      <li key={record.lessonKey}>
                        <ResultRow
                          record={record}
                          queryTokens={queryTokens}
                          active={record.lessonKey === selected?.lessonKey}
                          onSelect={() => setSelectedKey(record.lessonKey)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail rail — same rail + Plan handoff as Topics/Calendar */}
        <div className="self-start">
          <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
            {selected ? t('search.detailHeading') : t('focus.inFocusPlain')}
          </div>
          {selected ? (
            <DetailRail record={selected} queryTokens={queryTokens} />
          ) : (
            <div className="rounded-[14px] border border-border bg-surface-subtle p-[15px] text-[13px] text-text-muted">
              {t('search.selectResult')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Dimension {
  key: DimKey;
  label: string;
  options: { value: string; label: string; selected: boolean; toggle: () => void }[];
}

// ── Result row ────────────────────────────────────────────────────────────────────────

function ResultRow({
  record,
  queryTokens,
  active,
  onSelect,
}: {
  record: SearchRecord;
  queryTokens: string[];
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'w-full rounded-[12px] border px-[15px] py-[12px] text-start transition-shadow',
        active
          ? 'border-[1.5px] border-teal bg-[#EFF6F4] shadow-[0_12px_26px_-20px_rgba(31,122,108,0.5)]'
          : 'border border-[#EAD9C5] bg-surface-cream hover:shadow-[0_10px_22px_-20px_rgba(60,40,30,0.5)]',
      )}
    >
      <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A79E94]">
        {calendarPath(record, t, locale)}
      </div>
      <div dir="auto" className="text-[14px] leading-[1.45] text-ink [overflow-wrap:anywhere]">
        <Highlighted text={record.dailyOutcome} queryTokens={queryTokens} />
      </div>
      <FacetChips record={record} className="mt-[9px]" />
    </button>
  );
}

// ── Detail rail ─────────────────────────────────────────────────────────────────────

function DetailRail({ record, queryTokens }: { record: SearchRecord; queryTokens: string[] }) {
  const t = useTranslations('curriculum');
  const locale = useLocale();
  return (
    <div className="rounded-[14px] border-[1.5px] border-teal bg-surface p-[15px] shadow-[0_14px_30px_-24px_rgba(31,122,108,0.6)]">
      <FacetChips record={record} className="mb-[10px]" heading={t('focus.skillTopic')} />
      <div className="mb-[8px] text-[10px] text-[#A79E94]">{calendarPath(record, t, locale)}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A79E94]">
        {t('focus.dailyOutcome')}
      </div>
      <p dir="auto" className="mb-[14px] mt-[5px] text-[15.5px] font-medium leading-[1.4] text-ink [overflow-wrap:anywhere]">
        <Highlighted text={record.dailyOutcome} queryTokens={queryTokens} />
      </p>
      {record.resources.length > 0 ? (
        <>
          <div className="mb-[7px] text-[10px] font-semibold uppercase text-[#A79E94]">{t('focus.resources')}</div>
          <ul className="mb-[14px] space-y-[6px]">
            {record.resources.map((r, i) => (
              <li key={`${r.label}-${i}`} dir="auto" className="flex items-start gap-[8px] text-[13px] text-ink">
                <ImageGlyph />
                <span className="min-w-0 break-all">{r.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <PlanLessonButton lessonKey={record.lessonKey} period={record.period} />
    </div>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────────────

/** An inline, removable facet chip inside the open search bar. */
function InlineChip({ dim, label, onRemove, removeAria }: { dim: string; label: string; onRemove: () => void; removeAria: string }) {
  return (
    <span className="inline-flex items-center gap-[6px] rounded-full border border-teal-tint-border bg-teal-tint py-[3px] pe-[6px] ps-[9px] text-[12px] font-semibold text-teal-deep">
      <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-[#6BA093]">{dim}</span>
      <span dir="auto">{label}</span>
      <button type="button" onClick={onRemove} aria-label={removeAria} className="text-teal-deep/70 transition-colors hover:text-teal-deep">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </span>
  );
}

/** The matched facet chips for a record: Focus area, Topic (theme), and (canonical) Skill. */
function FacetChips({
  record,
  className,
  heading,
}: {
  record: SearchRecord;
  className?: string;
  heading?: string;
}) {
  const chips: React.ReactNode[] = [];
  if (record.focusArea) {
    chips.push(
      <span key="fa" dir="auto" className="rounded-[7px] bg-surface-cream px-[9px] py-[3px] text-[11px] font-semibold text-[#8A6D57]">
        {record.focusArea}
      </span>,
    );
  }
  if (record.theme) {
    chips.push(
      <span key="theme" dir="auto" className="rounded-[7px] bg-surface-cream px-[9px] py-[3px] text-[11px] font-semibold text-[#8A6D57]">
        {record.theme}
      </span>,
    );
  }
  const skill = canonicalSkill(record.linguisticSkill);
  if (skill) {
    chips.push(
      <span
        key="skill"
        dir="auto"
        className={cn('rounded-[7px] border px-[9px] py-[3px] text-[11px] font-semibold', SKILL_PILL[skillKeyOf(skill)])}
      >
        {skill}
      </span>,
    );
  }
  if (chips.length === 0) return null;
  if (heading) {
    return (
      <div className={className}>
        <div className="mb-[7px] text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A79E94]">
          {heading}
        </div>
        <div className="flex flex-wrap gap-[6px]">{chips}</div>
      </div>
    );
  }
  return <div className={cn('flex flex-wrap gap-[6px]', className)}>{chips}</div>;
}

/** Render text with query-token occurrences wrapped in a NEUTRAL (off-palette) mark. */
function Highlighted({ text, queryTokens }: { text: string; queryTokens: string[] }) {
  const segments = useMemo(() => highlightSegments(text, queryTokens), [text, queryTokens]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="rounded-[3px] bg-neutral-200/60 px-[1.5px] font-semibold text-ink">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      dir="auto"
      className={cn(
        'rounded-full border px-[11px] py-[5px] text-[12px] font-semibold transition-colors',
        active ? 'border-teal bg-teal-tint text-teal-deep' : 'border-[#E3DACD] bg-surface text-[#5C544E] hover:bg-surface-subtle',
      )}
    >
      {label}
    </button>
  );
}

function GroupChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-[10px] py-[3px] text-[12px] transition-colors',
        active ? 'border-teal bg-teal-tint font-semibold text-teal-deep' : 'border-[#DDD4C8] bg-surface text-[#5C544E] hover:bg-surface-subtle',
      )}
    >
      {label}
    </button>
  );
}

function SearchState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-[12px] rounded-[14px] border border-dashed border-[#DBCDBB] bg-surface-subtle px-[26px] py-[56px] text-center">
      <span className="inline-flex size-[52px] items-center justify-center rounded-[15px] bg-[#F3EEE6] text-[#C7BFB5]">
        <SearchGlyph size={24} />
      </span>
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      <p dir="auto" className="max-w-[340px] text-[13px] text-text-muted">{body}</p>
    </div>
  );
}

function SubjectSelect({
  ariaLabel,
  value,
  subjects,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  subjects: SubjectOption[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-[10px] border border-[#DDD4C8] bg-surface py-[9px] pe-[34px] ps-[13px] text-[14px] font-medium text-ink transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
      >
        {subjects.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
      <svg
        width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden className="pointer-events-none absolute end-[12px] top-1/2 -translate-y-1/2 text-[#A79E94]"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

function Chevron({ dir }: { dir: 'down' | 'right' | 'up' }) {
  const d = dir === 'down' ? 'M6 9l6 6 6-6' : dir === 'up' ? 'M6 15l6-6 6 6' : 'M9 18l6-6-6-6';
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('text-[#B4AA9E]', dir === 'right' && 'rtl:-scale-x-100')}>
      <path d={d} />
    </svg>
  );
}

function SearchGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ImageGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-[2px] shrink-0 text-teal">
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <circle cx="9" cy="12" r="2" />
    </svg>
  );
}

// ── Pure helpers ────────────────────────────────────────────────────────────────────

/** Distinct, non-empty, trimmed values in alphabetical order. */
function distinct(values: (string | null)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? '').trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** The weighted searchable fields for a record — daily outcome dominates. */
function searchableFields(record: SearchRecord): WeightedField[] {
  const fields: WeightedField[] = [{ tokens: tokenize(record.dailyOutcome), weight: 3 }];
  if (record.theme) fields.push({ tokens: tokenize(record.theme), weight: 1.5 });
  if (record.focusArea) fields.push({ tokens: tokenize(record.focusArea), weight: 1.5 });
  if (record.linguisticSkill) fields.push({ tokens: tokenize(record.linguisticSkill), weight: 1 });
  if (record.grammarVocabulary) fields.push({ tokens: tokenize(record.grammarVocabulary), weight: 1 });
  return fields;
}

/** Whether a record passes the active facets (OR within a facet, AND across facets). */
function matchesFacets(r: SearchRecord, f: FacetState): boolean {
  if (f.years.size > 0 && !f.years.has(r.year)) return false;
  if (f.months.size > 0 && !f.months.has(r.month)) return false;
  if (f.topics.size > 0 && !(r.theme && f.topics.has(r.theme))) return false;
  if (f.skills.size > 0) {
    const sk = canonicalSkill(r.linguisticSkill);
    if (!sk || !f.skills.has(sk)) return false;
  }
  if (f.focusAreas.size > 0 && !(r.focusArea && f.focusAreas.has(r.focusArea))) return false;
  if (f.hasResources && r.resources.length === 0) return false;
  return true;
}

/** Scheme-of-work sort rank (year, then globally-monotonic week, then period). */
function calRank(r: SearchRecord): number {
  return r.year * 1_000_000 + r.week * 100 + (r.period ?? 0);
}

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Group ranked results by the chosen dimension, preserving in-group rank order and
 *  ordering the groups sensibly (year ascending, month by calendar, topic alphabetical). */
function groupResults(
  records: SearchRecord[],
  groupBy: GroupBy,
  yearLabel: (y: number) => string,
): { key: string; label: string; records: SearchRecord[] }[] {
  if (groupBy === 'none') return [];
  const map = new Map<string, { label: string; sort: number | string; records: SearchRecord[] }>();
  for (const r of records) {
    let key: string;
    let label: string;
    let sort: number | string;
    if (groupBy === 'years') {
      key = `y${r.year}`;
      label = yearLabel(r.year);
      sort = r.year;
    } else if (groupBy === 'months') {
      key = r.month;
      label = r.month;
      sort = MONTH_ORDER.indexOf(r.month);
    } else {
      label = r.theme ?? '—';
      key = `t${label}`;
      sort = label.toLocaleLowerCase();
    }
    let g = map.get(key);
    if (!g) {
      g = { label, sort, records: [] };
      map.set(key, g);
    }
    g.records.push(r);
  }
  return [...map.entries()]
    .sort((a, b) => (typeof a[1].sort === 'number' && typeof b[1].sort === 'number'
      ? (a[1].sort as number) - (b[1].sort as number)
      : String(a[1].sort).localeCompare(String(b[1].sort))))
    .map(([key, g]) => ({ key, label: g.label, records: g.records }));
}

/** "Yr N · Month · Wk N · P N" — the same calendar path Topics/Calendar show. */
function calendarPath(r: SearchRecord, t: ReturnType<typeof useTranslations>, locale: string): string {
  return [
    t('year', { n: formatNumber(r.year, locale) }),
    r.month,
    t('tree.slotWeek', { n: formatNumber(r.week, locale) }),
    r.period != null ? t('tree.slotPeriod', { n: formatNumber(r.period, locale) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function groupByLabel(g: GroupBy, t: ReturnType<typeof useTranslations>): string {
  if (g === 'none') return t('search.groupNone');
  if (g === 'topics') return t('search.facets.groupTopic');
  if (g === 'years') return t('search.facets.groupYear');
  return t('search.facets.groupMonth');
}
