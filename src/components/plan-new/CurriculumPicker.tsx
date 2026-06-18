'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { fetchLessonsForWeek } from '@/lib/curriculum-actions';
import { createPlan } from '@/lib/actions/create-plan';
import { formatLongDate } from '@/lib/week';
import type { CurriculumLesson } from '@/types/curriculum';

interface MonthWeeks {
  month: string;
  weeks: number[];
}

/**
 * The plan-creation curriculum picker. Scoped to one class's year, it walks the
 * teacher through month → week → the week's period rows (each showing the daily
 * learning outcome, focus area / linguistic skill and theme). Selecting a row
 * and confirming creates the plan (via the createPlan server action) and lands
 * in the editor. Week lessons load on demand through the curriculum server
 * action — no raw curriculum access here.
 */
export function CurriculumPicker({
  classId,
  classLabel,
  lessonDate,
  year,
  months,
}: {
  classId: string;
  classLabel: string;
  lessonDate: string;
  year: number;
  months: MonthWeeks[];
}) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [lessons, setLessons] = useState<CurriculumLesson[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLesson = lessons.find((l) => l.id === selectedLessonId) ?? null;

  async function selectWeek(week: number) {
    if (week === selectedWeek) return;
    setSelectedWeek(week);
    setSelectedLessonId(null);
    setError(null);
    setLoadingWeek(true);
    try {
      const rows = await fetchLessonsForWeek(year, week);
      setLessons(rows);
    } finally {
      setLoadingWeek(false);
    }
  }

  async function confirm() {
    if (!selectedLesson || submitting) return;
    setSubmitting(true);
    setError(null);
    // On success (or an existing plan) createPlan redirects and never returns;
    // it only resolves with a value on a real error.
    const result = await createPlan({
      classId,
      curriculumLessonId: selectedLesson.id,
      lessonDate,
      period: selectedLesson.periodNum,
    });
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      {/* Header: what you're planning + a way back */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 p-5">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold">Plan a lesson</div>
          <div className="mt-0.5 text-[13px] text-text-muted">
            {classLabel} · {formatLongDate(lessonDate)}
          </div>
        </div>
        <Link
          href="/"
          className="rounded-sm border border-border-strong bg-surface px-[11px] py-[6px] text-[13px] font-medium text-neutral-900 transition-colors hover:bg-surface-subtle"
        >
          Cancel
        </Link>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr]">
        {/* Left rail: months and their weeks */}
        <div className="border-b border-neutral-100 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-faint">
            Year {year} curriculum
          </div>
          {months.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              No curriculum weeks found for this year.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {months.map((m) => (
                <div key={m.month}>
                  <div className="mb-2 text-[12.5px] font-semibold text-neutral-900">
                    {m.month}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.weeks.map((week) => (
                      <button
                        key={week}
                        type="button"
                        onClick={() => selectWeek(week)}
                        className={cn(
                          'cursor-pointer rounded-badge border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                          week === selectedWeek
                            ? 'border-teal bg-surface-cream text-teal'
                            : 'border-border-strong bg-surface text-neutral-800 hover:bg-surface-subtle',
                        )}
                      >
                        Week {week}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: the selected week's period rows */}
        <div className="p-4">
          {selectedWeek === null ? (
            <EmptyPanel
              title="Pick a week"
              body="Choose a week on the left to see its lessons, then select the one you'll teach."
            />
          ) : loadingWeek ? (
            <EmptyPanel title={`Week ${selectedWeek}`} body="Loading lessons…" />
          ) : lessons.length === 0 ? (
            <EmptyPanel
              title={`Week ${selectedWeek}`}
              body="No lessons are scheduled for this week."
            />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="mb-1 text-[12.5px] font-semibold text-neutral-900">
                Week {selectedWeek} · {lessons.length} period
                {lessons.length === 1 ? '' : 's'}
              </div>
              {lessons.map((lesson) => (
                <PeriodRow
                  key={lesson.id}
                  lesson={lesson}
                  selected={lesson.id === selectedLessonId}
                  onSelect={() => {
                    setSelectedLessonId(lesson.id);
                    setError(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer: confirm */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 p-5">
        <div className="min-h-[20px] text-[13px]">
          {error ? (
            <span className="text-status-review">{error}</span>
          ) : selectedLesson ? (
            <span className="text-text-muted">
              Selected: {selectedLesson.period} —{' '}
              <span className="text-neutral-900">{selectedLesson.dailyLO}</span>
            </span>
          ) : (
            <span className="text-text-faint">Select a lesson to continue.</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={confirm}
          disabled={!selectedLesson || submitting}
        >
          {submitting ? 'Creating…' : 'Create plan'}
        </Button>
      </div>
    </div>
  );
}

function PeriodRow({
  lesson,
  selected,
  onSelect,
}: {
  lesson: CurriculumLesson;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full cursor-pointer rounded-md border p-3 text-left transition-colors',
        selected
          ? 'border-teal bg-surface-cream'
          : 'border-neutral-100 bg-surface hover:bg-surface-subtle',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-faint">
          {lesson.period}
        </span>
        {lesson.linguisticSkill ? (
          <span className="rounded-badge border border-border bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-text-muted">
            {lesson.linguisticSkill}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 text-[13.5px] leading-[1.4] text-neutral-900">
        {lesson.dailyLO || 'No daily learning outcome'}
      </div>
      {lesson.theme ? (
        <div className="mt-1 text-[12px] text-text-muted">Theme: {lesson.theme}</div>
      ) : null}
    </button>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] text-text-muted">{body}</p>
    </div>
  );
}
