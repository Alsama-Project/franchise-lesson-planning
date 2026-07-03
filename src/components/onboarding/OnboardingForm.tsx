'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { finishOnboarding, type OnboardingRole } from '@/lib/actions/onboarding';
import type { OnboardingData } from '@/lib/onboarding';
import { CheckIcon, LiteracyPill, SubjectChip } from '@/components/onboarding/pieces';

const spaceKey = (schoolId: string, subjectId: string) => `${schoolId}:${subjectId}`;

/**
 * The one-page onboarding card (not a wizard): role, name, then a role-specific
 * body. All selection is local React state; the server action runs once on Finish.
 *
 * - Teacher (default): centre + multi-select subjects (+ optional classes) →
 *   immediate `teacher` membership. Unchanged from the original design.
 * - Coordinator: a single subject, school-agnostic (no centre, no classes) →
 *   files a pending request and shows the pending screen. Grants no access until
 *   an admin approves.
 */
export function OnboardingForm({ data }: { data: OnboardingData }) {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  const [role, setRole] = useState<OnboardingRole>('teacher');
  const [name, setName] = useState(data.fullName);
  const [centreId, setCentreId] = useState<string | null>(data.centres[0]?.id ?? null);
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());
  const [classIds, setClassIds] = useState<Set<string>>(new Set());
  const [classOpen, setClassOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCoordinator = role === 'coordinator';

  const centre = data.centres.find((c) => c.id === centreId) ?? null;
  const centreName = centre?.name ?? '';

  // Classes available for the chosen centre + chosen subjects, grouped by year.
  const classGroups = useMemo(() => {
    if (!centreId) return [];
    const rows = data.classes.filter(
      (c) => c.schoolId === centreId && subjectIds.has(c.subjectId),
    );
    const byYear = new Map<number, typeof rows>();
    for (const c of rows) {
      const list = byYear.get(c.year) ?? [];
      list.push(c);
      byYear.set(c.year, list);
    }
    return [...byYear.entries()].sort(([a], [b]) => a - b).map(([year, list]) => ({ year, list }));
  }, [centreId, subjectIds, data.classes]);

  const selectedClassLabels = useMemo(
    () =>
      data.classes
        .filter((c) => classIds.has(c.id))
        .map((c) => t('classes.yearLabel', { year: c.year })),
    [classIds, data.classes, t],
  );

  function changeRole(next: OnboardingRole) {
    if (next === role) return;
    setRole(next);
    // Role drives the whole body; reset downstream picks so nothing leaks across.
    setSubjectIds(new Set());
    setClassIds(new Set());
    setClassOpen(false);
    setError(null);
  }

  function toggleSubject(id: string) {
    // Coordinator picks exactly one subject; teacher may pick several.
    if (isCoordinator) {
      setSubjectIds(subjectIds.has(id) ? new Set() : new Set([id]));
      return;
    }
    const next = new Set(subjectIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSubjectIds(next);
    // A class only stays picked while its subject is still selected at this centre.
    setClassIds((prev) => {
      const pruned = new Set(prev);
      for (const c of data.classes) {
        if (pruned.has(c.id) && !next.has(c.subjectId)) pruned.delete(c.id);
      }
      return pruned;
    });
  }

  function changeCentre(id: string) {
    setCentreId(id);
    // Centre drives subject/class context; reset downstream picks.
    setSubjectIds(new Set());
    setClassIds(new Set());
    setClassOpen(false);
  }

  function toggleClass(id: string) {
    setClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onFinish() {
    setError(null);
    if (!name.trim()) return setError(t('errors.name'));

    if (isCoordinator) {
      if (subjectIds.size !== 1) return setError(t('errors.coordinatorSubject'));
    } else {
      if (!centreId) return setError(t('errors.centre'));
      if (subjectIds.size === 0) return setError(t('errors.subject'));
    }

    // Teacher: keep only class picks that still belong to a selected subject at
    // this centre. Coordinator: no centre/classes are submitted.
    const validClassIds = isCoordinator
      ? []
      : data.classes
          .filter((c) => c.schoolId === centreId && subjectIds.has(c.subjectId) && classIds.has(c.id))
          .map((c) => c.id);

    startTransition(async () => {
      const res = await finishOnboarding({
        fullName: name.trim(),
        role,
        schoolId: isCoordinator ? '' : (centreId ?? ''),
        subjectIds: [...subjectIds],
        classIds: validClassIds,
      });
      if (!res.ok) {
        setError(res.error ?? t('errors.generic'));
        return;
      }
      // finishOnboarding redirects on the happy path (teacher → '/', coordinator →
      // '/onboarding' pending screen); a returned ok means a non-fatal warning, so
      // navigate ourselves.
      router.push(isCoordinator ? '/onboarding' : '/');
    });
  }

  return (
    <div className="w-full max-w-[600px] rounded-[18px] border border-border bg-surface p-[30px_32px_28px] shadow-[0_12px_32px_-20px_rgba(60,40,30,0.4)]">
      <h2 className="mb-6 text-[23px] font-semibold tracking-[-0.01em]">{t('title')}</h2>

      {/* Role — single-select pills (Teacher / Coordinator) */}
      <label className="text-[12px] font-semibold text-neutral-700">{t('roleToggle.label')}</label>
      <div className="mb-[22px] mt-[9px] flex flex-wrap gap-2">
        {(['teacher', 'coordinator'] as const).map((r) => {
          const active = r === role;
          return (
            <button
              key={r}
              type="button"
              onClick={() => changeRole(r)}
              aria-pressed={active}
              className={cn(
                'rounded-[10px] border-[1.5px] px-4 py-[9px] text-[13px] transition-colors',
                active
                  ? 'border-teal bg-teal font-semibold text-white'
                  : 'border-[#E0D6C7] bg-surface font-medium text-neutral-900 hover:bg-surface-subtle',
              )}
            >
              {t(`roleToggle.${r}`)}
            </button>
          );
        })}
      </div>

      <Divider />

      {/* Name — pink editable block */}
      <label className="text-[12px] font-semibold text-neutral-700">{t('name.label')}</label>
      <div className="mb-[22px] mt-[7px] rounded-[12px] border border-mine-border bg-mine p-[6px]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('name.placeholder')}
          dir="auto"
          className="w-full rounded-[8px] border border-mine-field bg-surface px-[13px] py-[11px] text-[14.5px] font-medium text-ink outline-none"
        />
      </div>

      <Divider />

      {/* Centre — teacher only (coordinators are school-agnostic) */}
      {!isCoordinator ? (
        <>
          <label className="text-[12px] font-semibold text-neutral-700">{t('centre.label')}</label>
          <div className="mb-[22px] mt-[9px] flex flex-wrap gap-2">
            {data.centres.map((c) => {
              const active = c.id === centreId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => changeCentre(c.id)}
                  dir="auto"
                  className={cn(
                    'rounded-[10px] border-[1.5px] px-4 py-[9px] text-[13px] transition-colors',
                    active
                      ? 'border-teal bg-teal font-semibold text-white'
                      : 'border-[#E0D6C7] bg-surface font-medium text-neutral-900 hover:bg-surface-subtle',
                  )}
                >
                  {c.name}
                </button>
              );
            })}
            {data.centres.length === 0 ? (
              <span className="text-[13px] text-text-faint">{t('centre.none')}</span>
            ) : null}
          </div>

          <Divider />
        </>
      ) : null}

      {/* Subjects — multi-select (teacher) or single-select (coordinator) rows */}
      <div className="flex items-baseline justify-between gap-[10px]">
        <label className="text-[12px] font-semibold text-neutral-700">
          {isCoordinator
            ? t('subjects.coordinatorLabel')
            : t('subjects.teacherLabel', { centre: centreName ? ` — ${centreName}` : '' })}
        </label>
        {!isCoordinator ? (
          <span className="text-[11px] text-text-faint">
            {t('subjects.selectedCount', { count: formatNumber(subjectIds.size, locale) })}
          </span>
        ) : null}
      </div>
      {isCoordinator ? (
        <p className="mt-[6px] text-[12px] text-text-faint">{t('subjects.coordinatorHint')}</p>
      ) : null}
      <div className="mb-[22px] mt-[10px] flex flex-col gap-2">
        {data.subjects.map((s) => {
          const selected = subjectIds.has(s.id);
          const teachers = !isCoordinator && centreId ? data.teacherCounts[spaceKey(centreId, s.id)] ?? 0 : 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSubject(s.id)}
              dir="auto"
              className={cn(
                'flex items-center gap-3 rounded-[11px] px-[13px] py-[11px] text-left transition-colors',
                selected
                  ? 'border-[1.5px] border-teal bg-teal-tint'
                  : 'border border-border bg-surface hover:bg-surface-subtle',
              )}
            >
              {selected ? (
                <span className="inline-flex size-[21px] shrink-0 items-center justify-center rounded-[6px] bg-teal">
                  <CheckIcon size={12} />
                </span>
              ) : (
                <span className="size-[21px] shrink-0 rounded-[6px] border-[1.5px] border-[#D8CFC2] bg-surface" />
              )}
              <span className="flex-1 text-[14px] font-semibold">{s.name}</span>
              {selected ? (
                !isCoordinator && teachers > 0 ? (
                  <span className="text-[11px] text-[#5E8C84]">
                    {t('subjects.teacherCount', { count: formatNumber(teachers, locale) })}
                  </span>
                ) : null
              ) : (
                <span className="text-[12px] font-semibold text-teal">{t('subjects.select')}</span>
              )}
            </button>
          );
        })}
        {data.subjects.length === 0 ? (
          <span className="text-[13px] text-text-faint">{t('subjects.none')}</span>
        ) : null}
      </div>

      {/* Classes — teacher only, optional */}
      {!isCoordinator ? (
        <>
          <Divider />

          <div className="mb-[10px] flex items-center gap-[9px]">
            <label className="text-[12px] font-semibold text-neutral-700">{t('classes.label')}</label>
            <span className="rounded-[5px] bg-[#F6ECDA] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.04em] text-[#B0651E]">
              {t('classes.optional')}
            </span>
          </div>

          {subjectIds.size === 0 ? (
            <div className="rounded-[12px] border border-[#ECE4D7] bg-surface-subtle px-[14px] py-[12px] text-[12.5px] text-text-faint">
              {t('classes.chooseSubjectFirst')}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-[12px] border border-[#ECE4D7] bg-surface-subtle px-[14px] py-[12px]">
                <div className="flex-1">
                  <div className="text-[13.5px] font-semibold">
                    {t('classes.selectedCount', { count: formatNumber(classIds.size, locale) })}
                  </div>
                  <div className="mt-px text-[12px] text-text-faint" dir="auto">
                    {selectedClassLabels.length > 0
                      ? selectedClassLabels.join(', ')
                      : t('classes.noneYet')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClassOpen((v) => !v)}
                  className="rounded-[9px] border border-teal-tint-border bg-surface px-[13px] py-2 text-[12.5px] font-semibold text-teal hover:bg-surface-subtle"
                >
                  {classOpen ? t('classes.done') : t('classes.edit')}
                </button>
              </div>

              {classOpen ? (
                <div className="mt-2 rounded-[12px] border border-border p-[16px_17px]">
                  {classGroups.length === 0 ? (
                    <div className="text-[12.5px] text-text-faint">{t('classes.noneForSelection')}</div>
                  ) : (
                    <div className="flex flex-col gap-[14px]">
                      {classGroups.map(({ year, list }) => (
                        <div key={year}>
                          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-faint">
                            {t('classes.yearGroup', { year })}
                          </div>
                          {list.map((c) => {
                            const checked = classIds.has(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => toggleClass(c.id)}
                                className="flex w-full items-center gap-[11px] py-1 text-left"
                              >
                                {checked ? (
                                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-teal">
                                    <CheckIcon size={11} />
                                  </span>
                                ) : (
                                  <span className="size-5 shrink-0 rounded-[6px] border-[1.5px] border-[#D8CFC2] bg-surface" />
                                )}
                                <span className="flex-1 text-[13.5px] font-semibold">
                                  {t('classes.yearLabel', { year: c.year })}
                                </span>
                                <SubjectChip>{c.subjectName ?? '—'}</SubjectChip>
                                <LiteracyPill literacy={c.literacy} />
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {error ? <p className="mt-4 text-[12.5px] font-medium text-pink">{error}</p> : null}

      <button
        type="button"
        onClick={onFinish}
        disabled={pending}
        className="mt-[26px] flex w-full items-center justify-center gap-2 rounded-[12px] bg-teal px-4 py-[14px] text-[14.5px] font-semibold text-white transition-colors hover:bg-[#1a6a5d] disabled:opacity-70"
      >
        {pending ? t('finish.saving') : isCoordinator ? t('finish.coordinator') : t('finish.teacher')}
        {!pending ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        ) : null}
      </button>
    </div>
  );
}

function Divider() {
  return <div className="mb-5 h-px bg-[#F0EAE1]" />;
}
