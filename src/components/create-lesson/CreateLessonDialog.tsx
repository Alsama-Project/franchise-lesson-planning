'use client';

// The "+ Lesson" create modal — a two-step dialog that pops over the home:
//   Step 1  pick the class (grouped by space)
//   Step 2  pick the curriculum lesson (week grid)
// then "Create lesson" inserts an in_progress plan and routes into the existing
// 5-step wizard. Edge states (already-planned, unsynced week) render inline.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { WEEKDAYS, WEEKDAY_LABELS, addDays, mondayOf, weekdayOf } from '@/lib/week';
import { STATUS_META } from '@/components/weekly-overview/status';
import {
  createLessonForClass,
  loadPickerWeek,
  type CreateLessonResult,
  type PickerWeekResult,
} from '@/lib/actions/create-lesson';
import type { CreateSeed, CreateSpaceGroup } from '@/components/create-lesson/types';

type Step = 'class' | 'lesson';

type ExistingPlan = Extract<CreateLessonResult, { status: 'already_planned' }>['existing'];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Period (1–5) → short weekday label ("Mon"…"Fri"). */
function periodWeekday(period: number): string {
  const wd = WEEKDAYS[period - 1];
  return wd ? WEEKDAY_LABELS[wd] : `P${period}`;
}

/** Breadcrumb for the "already planned" card, e.g. "Year 2 · A › Period 3 · Wed 24 Jun". */
function alreadySubtitle(classLabel: string, anchorMonday: string, period?: number): string {
  if (period == null) return classLabel;
  const iso = addDays(anchorMonday, period - 1);
  const month = SHORT_MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
  const day = Number(iso.slice(8, 10));
  const where = `Period ${period} · ${periodWeekday(period)} ${day} ${month}`;
  return classLabel ? `${classLabel} › ${where}` : where;
}

export function CreateLessonDialog({
  groups,
  weekStart,
  seed,
  onClose,
}: {
  groups: CreateSpaceGroup[];
  weekStart: string;
  seed: CreateSeed;
  onClose: () => void;
}) {
  const router = useRouter();

  // The calendar week the new plan lands in: a seeded date's Monday, else the
  // home's shown week. The plan's lesson_date is this Monday + (period − 1).
  const anchorMonday = seed.date ? mondayOf(seed.date) : weekStart;
  // A seeded date pre-selects the matching period cell (mon → P1 … fri → P5).
  const seedPeriod = (() => {
    if (!seed.date) return null;
    const wd = weekdayOf(seed.date);
    return wd ? WEEKDAYS.indexOf(wd) + 1 : null;
  })();

  const [step, setStep] = useState<Step>(seed.classId ? 'lesson' : 'class');
  const [classId, setClassId] = useState<string | null>(seed.classId ?? null);

  const [picker, setPicker] = useState<PickerWeekResult | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selected, setSelected] = useState<{ lessonKey: string; period: number } | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [already, setAlready] = useState<ExistingPlan | null>(null);

  // Apply the seeded period preselect only once, on first entry to step 2.
  const seedApplied = useRef(false);

  const load = useCallback(
    async (forClass: string, month?: string, week?: number) => {
      setPickerLoading(true);
      setCreateError(null);
      const result = await loadPickerWeek({ classId: forClass, month, week });
      setPicker(result);
      // The available cells changed — drop any selection that no longer applies,
      // then apply the one-time seeded-period preselect if a matching cell exists.
      setSelected((prev) => {
        const stillThere = prev && result.cells.some((c) => c.lessonKey === prev.lessonKey);
        if (stillThere) return prev;
        if (!seedApplied.current && seedPeriod != null) {
          seedApplied.current = true;
          const cell = result.cells.find((c) => c.period === seedPeriod);
          if (cell) return { lessonKey: cell.lessonKey, period: cell.period };
        }
        return null;
      });
      setPickerLoading(false);
    },
    [seedPeriod],
  );

  // Seeded with a class → load step 2 straight away. Deferred to a microtask so
  // the load's setState doesn't run synchronously inside the effect body.
  useEffect(() => {
    if (!seed.classId) return;
    const id = seed.classId;
    queueMicrotask(() => void load(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const goToLesson = () => {
    if (!classId) return;
    setStep('lesson');
    void load(classId);
  };

  const changeMonth = (month: string) => {
    if (!classId || !picker) return;
    const firstWeek = picker.nav.find((m) => m.month === month)?.weeks[0] ?? 1;
    void load(classId, month, firstWeek);
  };

  const stepWeek = (delta: number) => {
    if (!classId || !picker) return;
    const nextWeek = Math.max(1, picker.week + delta);
    void load(classId, picker.month, nextWeek);
  };

  const create = async () => {
    if (!classId || !selected) return;
    setCreating(true);
    setCreateError(null);
    const result = await createLessonForClass({
      classId,
      lessonKey: selected.lessonKey,
      period: selected.period,
      anchorMonday,
    });
    if (result.status === 'created') {
      router.push(`/plan/${result.planId}`);
      return; // keep the dialog up through the navigation
    }
    if (result.status === 'already_planned') {
      setAlready(result.existing);
      setCreating(false);
      return;
    }
    setCreateError(result.error);
    setCreating(false);
  };

  const wide = step === 'lesson' || already !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create a lesson"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div
        className="my-auto w-full overflow-hidden rounded-[18px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]"
        style={{ maxWidth: wide ? 760 : 520 }}
      >
        <DialogHeader step={step} onClose={onClose} showSteps={already === null} />

        {already !== null ? (
          <AlreadyPlanned
            existing={already}
            subtitle={alreadySubtitle(picker?.classLabel ?? '', anchorMonday, selected?.period)}
            onOpen={() => router.push(`/plan/${already.planId}`)}
            onBack={() => setAlready(null)}
          />
        ) : step === 'class' ? (
          <ClassStep
            groups={groups}
            classId={classId}
            onSelect={setClassId}
            onCancel={onClose}
            onContinue={goToLesson}
          />
        ) : (
          <LessonStep
            picker={picker}
            loading={pickerLoading}
            selected={selected}
            onSelect={(lessonKey, period) => setSelected({ lessonKey, period })}
            onChangeMonth={changeMonth}
            onStepWeek={stepWeek}
            onBack={() => {
              setStep('class');
              setSelected(null);
            }}
            onCreate={create}
            creating={creating}
            error={createError}
          />
        )}
      </div>
    </div>
  );
}

// ── Header (badge · close · step indicator) ─────────────────────────────────────

function DialogHeader({
  step,
  onClose,
  showSteps,
}: {
  step: Step;
  onClose: () => void;
  showSteps: boolean;
}) {
  return (
    <div className="px-[22px] pt-[17px]">
      <div className="flex items-center justify-between">
        <span className="rounded-badge bg-status-progress-bg px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[0.06em] text-status-progress">
          New lesson
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-[30px] items-center justify-center rounded-[8px] border-none bg-[#F3ECE2] text-neutral-600 transition-colors hover:bg-[#ece2d4]"
        >
          <Icon path="M6 6l12 12M18 6L6 18" width={14} strokeWidth={2.2} />
        </button>
      </div>

      {showSteps ? (
        <div className="mt-[15px] flex items-center gap-2">
          <StepTab label="Class" active={step === 'class'} done={step === 'lesson'} />
          <span className="h-px w-[14px] bg-border-strong" />
          <StepTab label="Lesson" active={step === 'lesson'} done={false} />
        </div>
      ) : (
        <div className="mt-[15px]" />
      )}
      <div className="mx-[-22px] h-px bg-[#F0EAE1]" />
    </div>
  );
}

function StepTab({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[4px] pb-[6px] text-[12px]',
        active
          ? 'border-b-2 border-teal font-bold text-teal-deep'
          : done
            ? 'font-semibold text-teal-deep'
            : 'font-medium text-text-faint',
      )}
    >
      {done ? <Icon path="M5 12l4 4 10-11" width={13} strokeWidth={3} stroke="#1F7A6C" /> : null}
      {label}
    </span>
  );
}

// ── Step 1 — pick the class ─────────────────────────────────────────────────────

function ClassStep({
  groups,
  classId,
  onSelect,
  onCancel,
  onContinue,
}: {
  groups: CreateSpaceGroup[];
  classId: string | null;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <div className="px-[20px] pb-[4px] pt-[18px]">
        <h2 className="mb-[16px] text-[19px] font-semibold tracking-[-0.01em]">
          Which class are you planning for?
        </h2>

        {groups.length === 0 ? (
          <p className="py-[24px] text-center text-[13.5px] text-text-muted">
            You aren&rsquo;t a member of any spaces with classes yet. Ask your coordinator to
            add you.
          </p>
        ) : (
          groups.map((group) => (
            <div key={`${group.schoolId}:${group.subjectId}`} className="mb-[16px] last:mb-0">
              <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-faint">
                {group.label}
              </div>
              <div className="flex flex-col gap-[7px]">
                {group.classes.map((cls) => {
                  const isSelected = cls.id === classId;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => onSelect(cls.id)}
                      className={cn(
                        'flex w-full items-center gap-[12px] rounded-[11px] px-[13px] py-[12px] text-left transition-colors',
                        isSelected
                          ? 'border-[1.5px] border-teal bg-teal-tint'
                          : 'border border-border bg-surface hover:bg-surface-subtle',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-[19px] flex-shrink-0 items-center justify-center rounded-full',
                          isSelected ? 'bg-teal' : 'border-[1.5px] border-border-strong bg-surface',
                        )}
                      >
                        {isSelected ? (
                          <Icon path="M5 12l4 4 10-11" width={11} strokeWidth={3} stroke="#fff" />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'flex-1 text-[14px]',
                          isSelected ? 'font-bold' : 'font-semibold',
                        )}
                      >
                        {cls.label}
                      </span>
                      <Icon
                        path="M9 18l6-6-6-6"
                        width={16}
                        stroke={isSelected ? '#1F7A6C' : '#C7BCAE'}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <Footer>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] font-medium text-neutral-700 transition-colors hover:text-ink"
        >
          Cancel
        </button>
        <PrimaryButton onClick={onContinue} disabled={!classId}>
          Continue <Icon path="M5 12h14M13 6l6 6-6 6" width={15} strokeWidth={2.2} stroke="#fff" />
        </PrimaryButton>
      </Footer>
    </>
  );
}

// ── Step 2 — pick the curriculum lesson ─────────────────────────────────────────

function LessonStep({
  picker,
  loading,
  selected,
  onSelect,
  onChangeMonth,
  onStepWeek,
  onBack,
  onCreate,
  creating,
  error,
}: {
  picker: PickerWeekResult | null;
  loading: boolean;
  selected: { lessonKey: string; period: number } | null;
  onSelect: (lessonKey: string, period: number) => void;
  onChangeMonth: (month: string) => void;
  onStepWeek: (delta: number) => void;
  onBack: () => void;
  onCreate: () => void;
  creating: boolean;
  error: string | null;
}) {
  const hasCells = (picker?.cells.length ?? 0) > 0;

  return (
    <>
      <div className="px-[22px] pb-[4px] pt-[18px]">
        <div className="mb-[16px] flex items-end justify-between gap-[14px]">
          <div className="min-w-0">
            <h2 className="mb-[6px] text-[19px] font-semibold tracking-[-0.01em]">Which lesson?</h2>
            {picker ? (
              <div className="text-[12px] text-neutral-600">
                {picker.subjectName} · Year {picker.year}{' '}
                <span className="text-neutral-300">›</span>{' '}
                <b className="font-semibold text-neutral-700">{picker.month || '—'}</b>{' '}
                <span className="text-neutral-300">›</span>{' '}
                <b className="font-semibold text-neutral-700">Week {picker.week}</b>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-[8px]">
            {picker && picker.nav.length > 0 ? (
              <MonthDropdown
                month={picker.month}
                months={picker.nav.map((m) => m.month)}
                onChange={onChangeMonth}
              />
            ) : null}
            <div className="flex items-center gap-[3px]">
              <StepperButton
                label="Previous week"
                path="M15 18l-6-6 6-6"
                onClick={() => onStepWeek(-1)}
                disabled={!picker || picker.week <= 1}
              />
              <span className="min-w-[52px] text-center text-[12px] font-semibold">
                Week {picker?.week ?? 1}
              </span>
              <StepperButton
                label="Next week"
                path="M9 18l6-6-6-6"
                onClick={() => onStepWeek(1)}
                disabled={!picker}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-5 gap-[9px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[188px] animate-pulse rounded-[12px] border border-border bg-surface-subtle"
              />
            ))}
          </div>
        ) : hasCells ? (
          <div className="grid grid-cols-5 gap-[9px]">
            {picker!.cells.map((cell) => {
              const isSelected = selected?.lessonKey === cell.lessonKey;
              return (
                <button
                  key={cell.lessonKey}
                  type="button"
                  onClick={() => onSelect(cell.lessonKey, cell.period)}
                  className={cn(
                    'flex min-h-[188px] flex-col rounded-[12px] p-[11px] pb-[12px] text-left transition-shadow',
                    isSelected
                      ? 'border-[1.5px] border-teal bg-teal-tint shadow-[0_6px_16px_-8px_rgba(31,122,108,0.5)]'
                      : 'border border-border bg-surface-subtle hover:border-border-strong',
                  )}
                >
                  <div
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-[0.04em]',
                      isSelected ? 'text-teal-deep' : 'text-[#A6917A]',
                    )}
                  >
                    Period {cell.period} · {periodWeekday(cell.period)}
                  </div>
                  <div
                    className={cn(
                      'mt-[8px] flex-1 text-[11.5px] leading-[1.45]',
                      isSelected ? 'font-medium text-[#234F47]' : 'text-neutral-800',
                    )}
                  >
                    {cell.dailyOutcome || '—'}
                  </div>
                  {cell.focusArea ? (
                    <div className="mb-[9px] text-[9.5px] font-semibold text-teal-deep">
                      Focus · {cell.focusArea}
                    </div>
                  ) : (
                    <div className="mb-[9px]" />
                  )}
                  {isSelected ? (
                    <span className="inline-flex items-center justify-center gap-[4px] rounded-[7px] bg-teal py-[6px] text-[11px] font-bold text-white">
                      <Icon path="M5 12l4 4 10-11" width={11} strokeWidth={3} stroke="#fff" />{' '}
                      Selected
                    </span>
                  ) : (
                    <span className="rounded-[7px] border border-teal-tint-border py-[6px] text-center text-[11px] font-semibold text-teal">
                      Select
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyWeek
            picker={picker}
            onPreviousWeek={() => onStepWeek(-1)}
            onPickAnotherClass={onBack}
          />
        )}

        {error ? (
          <p className="mt-[12px] rounded-[10px] bg-status-review-bg px-[12px] py-[8px] text-[12.5px] text-status-review">
            {error}
          </p>
        ) : null}
      </div>

      <Footer>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-[6px] text-[13px] font-medium text-neutral-700 transition-colors hover:text-ink"
        >
          <Icon path="M19 12H5M11 18l-6-6 6-6" width={15} stroke="#756B64" /> Back
        </button>
        <PrimaryButton onClick={onCreate} disabled={!selected || creating}>
          {creating ? 'Creating…' : 'Create lesson'}{' '}
          <Icon path="M5 12h14M13 6l6 6-6 6" width={16} strokeWidth={2.2} stroke="#fff" />
        </PrimaryButton>
      </Footer>
    </>
  );
}

// ── Edge: unsynced / empty week ─────────────────────────────────────────────────

function EmptyWeek({
  picker,
  onPreviousWeek,
  onPickAnotherClass,
}: {
  picker: PickerWeekResult | null;
  onPreviousWeek: () => void;
  onPickAnotherClass: () => void;
}) {
  const detail = picker
    ? `${picker.classLabel} · ${picker.subjectName} hasn't synced for Week ${picker.week}. Try another week, or ask your coordinator.`
    : 'This week has no curriculum lessons yet.';
  return (
    <div className="flex flex-col items-center rounded-[14px] border border-dashed border-border-strong px-[24px] py-[34px] text-center">
      <span className="mb-[14px] inline-flex size-[46px] items-center justify-center rounded-[12px] border border-border bg-surface-subtle">
        <Icon
          path="M3 4h18v18H3zM3 10h18M8 2v4M16 2v4"
          width={22}
          stroke="#B6ABA0"
          strokeWidth={1.8}
        />
      </span>
      <div className="text-[15px] font-semibold">No curriculum lessons for this week yet</div>
      <div className="mt-[6px] max-w-[340px] text-[12.5px] leading-[1.55] text-text-muted">
        {detail}
      </div>
      <div className="mt-[18px] flex gap-[9px]">
        <button
          type="button"
          onClick={onPreviousWeek}
          disabled={(picker?.week ?? 1) <= 1}
          className="rounded-[9px] border border-border-strong bg-surface px-[15px] py-[9px] text-[12.5px] font-semibold text-neutral-900 transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous week
        </button>
        <button
          type="button"
          onClick={onPickAnotherClass}
          className="rounded-[9px] border border-teal-tint-border bg-surface px-[15px] py-[9px] text-[12.5px] font-semibold text-teal transition-colors hover:bg-surface-subtle"
        >
          Pick another class
        </button>
      </div>
    </div>
  );
}

// ── Edge: already planned ───────────────────────────────────────────────────────

function AlreadyPlanned({
  existing,
  subtitle,
  onOpen,
  onBack,
}: {
  existing: ExistingPlan;
  subtitle: string;
  onOpen: () => void;
  onBack: () => void;
}) {
  return (
    <div className="px-[22px] py-[20px]">
      <div className="mb-[14px] text-[12px] text-neutral-600">{subtitle}</div>
      <div className="rounded-[14px] border border-border bg-surface-subtle p-[18px]">
        <div className="flex items-start gap-[13px]">
          <span className="inline-flex size-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-status-progress-bg">
            <Icon
              path="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
              width={17}
              stroke="#B0651E"
            />
          </span>
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold">A plan already exists for this date</div>
            <div className="mt-[4px] text-[12.5px] leading-[1.5] text-text-muted">
              {existing.title} ·{' '}
              <b className={cn('font-semibold', STATUS_META[existing.planStatus].text)}>
                {STATUS_META[existing.planStatus].label}
              </b>{' '}
              · {existing.ownerName}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="mt-[16px] inline-flex w-full items-center justify-center gap-[7px] rounded-[11px] bg-teal py-[12px] text-[14px] font-semibold text-white transition-colors hover:bg-teal-deep"
        >
          Open it <Icon path="M5 12h14M13 6l6 6-6 6" width={15} strokeWidth={2.2} stroke="#fff" />
        </button>
      </div>
      <div className="mt-[13px] text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-[12.5px] font-medium text-neutral-700 transition-colors hover:text-ink"
        >
          ← Pick another lesson
        </button>
      </div>
    </div>
  );
}

// ── Small shared pieces ─────────────────────────────────────────────────────────

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[12px] flex items-center justify-between border-t border-[#F0EAE1] px-[22px] py-[16px]">
      {children}
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-[7px] rounded-[10px] bg-teal px-[18px] py-[10px] text-[13.5px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(31,122,108,0.5)] transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

function StepperButton({
  label,
  path,
  onClick,
  disabled,
}: {
  label: string;
  path: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-[28px] items-center justify-center rounded-[8px] border border-border-strong bg-surface transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon path={path} width={13} stroke="#2A2422" />
    </button>
  );
}

function MonthDropdown({
  month,
  months,
  onChange,
}: {
  month: string;
  months: string[];
  onChange: (month: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-[6px] rounded-[9px] border border-border-strong bg-surface px-[11px] py-[7px] text-[12px] font-semibold text-neutral-900 transition-colors hover:bg-surface-subtle"
      >
        {month || 'Month'} <Icon path="M6 9l6 6 6-6" width={12} stroke="#A79E94" />
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-[4px] max-h-[240px] min-w-[140px] overflow-y-auto rounded-[10px] border border-border bg-surface py-[4px] shadow-card">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              className={cn(
                'block w-full px-[12px] py-[7px] text-left text-[12.5px] transition-colors hover:bg-surface-subtle',
                m === month ? 'font-semibold text-teal-deep' : 'text-neutral-900',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Inline stroked icon — matches the design's 24×24 line-icon set. */
function Icon({
  path,
  width = 16,
  stroke = 'currentColor',
  strokeWidth = 2,
}: {
  path: string;
  width?: number;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={width}
      height={width}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
