'use client';

// The board's "Not started" creation affordance, behind a shared provider:
//   • openChooser — a "Not started" card: the curriculum lesson (and its year) is
//     already fixed, so creation has nothing left to ask — it confirms and goes.
//
// The day-column "+ Add lesson" path no longer lives here: it now resolves the
// curriculum lesson directly from the column's (year, period, week) via the
// AddLessonMenu dropdown, so the old NEW LESSON popup has been retired.
//
// Creation no longer asks "who for" (the audience/scope step) — whose lessons you
// see is the weekly board's "Everyone / me" view filter, not a creation concern.
// Instead, the new plan binds to one of the TEACHER'S OWN classes for the slot
// (createTeacherPlan): auto when they teach exactly one such class, a pick when
// they teach several, blocked when they teach none. A teacher never creates a
// read-only `class_id=null` / `scope='centre'` plan.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import {
  createTeacherPlan,
  createCoordinatorPlan,
  type EligibleClass,
} from '@/lib/actions/create-lesson';
import { usePlanHref } from '@/components/weekly-overview/BoardReturn';
import { formatNumber } from '@/lib/format';

/** A fixed curriculum lesson to plan, with the day placement to write. */
export interface ScopeTarget {
  lessonKey: string;
  year: number;
  /** The centre (school) band the plan is created in — scopes the class match. */
  centreId: string;
  dailyOutcome: string;
  /** The Mon–Fri column (1..5) to place the new plan on. */
  weekday: number;
  /** The day-ordinal position to write (next in that day's stack). */
  period: number;
}

interface ScopeChooserApi {
  /** Open the confirm step for a fixed curriculum lesson. */
  openChooser: (target: ScopeTarget) => void;
}

const ScopeChooserContext = createContext<ScopeChooserApi | null>(null);

/**
 * Whether the board viewer COORDINATES the active subject. When true, the board's
 * create affordances author a born-approved coordinator plan (`createCoordinatorPlan`)
 * instead of the teacher submit-for-approval path. Board-wide (single active
 * subject), so it lives in one context both create entry points read.
 */
const CoordinatorAuthorContext = createContext<boolean>(false);

export function useScopeChooser(): ScopeChooserApi {
  const ctx = useContext(ScopeChooserContext);
  if (!ctx) throw new Error('useScopeChooser must be used within ScopeChooserProvider');
  return ctx;
}

/** Whether the viewer authors as a coordinator of the board's active subject. */
export function useCoordinatorAuthor(): boolean {
  return useContext(CoordinatorAuthorContext);
}

export function ScopeChooserProvider({
  children,
  coordinatorAuthor = false,
}: {
  children: ReactNode;
  /** True when the viewer coordinates the active subject — born-approved authoring. */
  coordinatorAuthor?: boolean;
}) {
  const [target, setTarget] = useState<ScopeTarget | null>(null);
  const openChooser = useCallback((next: ScopeTarget) => setTarget(next), []);
  const closeChooser = useCallback(() => setTarget(null), []);

  return (
    <CoordinatorAuthorContext.Provider value={coordinatorAuthor}>
      <ScopeChooserContext.Provider value={{ openChooser }}>
        {children}
        {target ? <ConfirmLessonDialog target={target} onClose={closeChooser} /> : null}
      </ScopeChooserContext.Provider>
    </CoordinatorAuthorContext.Provider>
  );
}

/** Close on Escape — shared by both dialogs. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/** The shared modal frame (backdrop + click-away). */
function Modal({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div className="w-full max-w-[400px] overflow-hidden rounded-[16px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]">
        {children}
      </div>
    </div>
  );
}

/** The shared footer: Cancel + the confirm button. */
function DialogFooter({
  label,
  busy,
  disabled,
  onCancel,
  onConfirm,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('board');
  return (
    <div className="mt-[16px] flex items-center justify-between border-t border-[#F0EAE1] px-[20px] py-[14px]">
      <button
        type="button"
        onClick={onCancel}
        className="text-[13px] font-medium text-neutral-700 transition-colors hover:text-ink"
      >
        {t('confirm.cancel')}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || disabled}
        className="inline-flex items-center gap-[7px] rounded-[10px] bg-teal px-[17px] py-[10px] text-[13.5px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(31,122,108,0.5)] transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? t('confirm.starting') : label}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Confirm step for a fixed curriculum lesson ("Not started" card). The lesson and
 * its year group are already known, so one confirm binds the plan to the teacher's
 * own class for the slot and opens it. When the teacher teaches several eligible
 * classes they pick one first; when they teach none, creation is blocked with a
 * clear note (no centre plan is ever produced).
 */
function ConfirmLessonDialog({ target, onClose }: { target: ScopeTarget; onClose: () => void }) {
  const t = useTranslations('board');
  const locale = useLocale();
  const router = useRouter();
  const planHref = usePlanHref();
  const coordinatorAuthor = useCoordinatorAuthor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the teacher teaches several classes for this slot — pick one.
  const [classes, setClasses] = useState<EligibleClass[] | null>(null);
  // Set when the teacher teaches no class for this slot — creation is blocked.
  const [blocked, setBlocked] = useState<{ subjectName: string; year: number } | null>(null);
  useEscape(onClose);

  const start = async (classId?: string) => {
    setBusy(true);
    setError(null);
    // A coordinator of the active subject authors a born-approved plan (Save, not
    // Submit) — no class binding, straight into the editor. A teacher binds to one
    // of their own classes for the slot (auto / pick / blocked).
    if (coordinatorAuthor) {
      const res = await createCoordinatorPlan({
        lessonKey: target.lessonKey,
        weekday: target.weekday,
        period: target.period,
      });
      if (res.ok) {
        router.push(planHref(`/plan/${res.planId}`));
        return;
      }
      setBusy(false);
      setError(res.error);
      return;
    }
    const res = await createTeacherPlan({
      lessonKey: target.lessonKey,
      weekday: target.weekday,
      period: target.period,
      classId,
    });
    if (res.ok) {
      // Carry the current week so the new plan's "back to overview" returns here.
      router.push(planHref(`/plan/${res.planId}`));
      return; // keep the dialog up through the navigation
    }
    setBusy(false);
    if (res.reason === 'pick') {
      setBlocked(null);
      setClasses(res.classes);
    } else if (res.reason === 'none') {
      setClasses(null);
      setBlocked({ subjectName: res.subjectName, year: res.year });
    } else {
      setError(res.error);
    }
  };

  const classLabel = (c: EligibleClass): string =>
    `${t('card.year', { n: formatNumber(c.year, locale) })} · ${t(`literacy.${c.literacy}`)}`;

  return (
    <Modal label={t('confirm.ariaLabel')} onClose={onClose}>
      <div className="px-[20px] pt-[18px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{t('confirm.title')}</h2>
        <p className="mt-[5px] text-[12.5px] font-semibold text-text-muted">
          {t('confirm.year', { n: formatNumber(target.year, locale) })}
        </p>
        {target.dailyOutcome ? (
          <p dir="auto" className="mt-[6px] line-clamp-2 text-[12.5px] leading-[1.45] text-text-muted">
            {target.dailyOutcome}
          </p>
        ) : null}
      </div>

      {blocked ? (
        <p
          dir="auto"
          className="mx-[20px] mt-[12px] rounded-[10px] bg-surface-subtle px-[12px] py-[10px] text-[12.5px] leading-[1.45] text-text-muted"
        >
          {t('add.noClass', { subject: blocked.subjectName, year: formatNumber(blocked.year, locale) })}
        </p>
      ) : null}

      {classes ? (
        <div className="mx-[20px] mt-[14px]">
          <p className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.05em] text-text-faint">
            {t('add.chooseClass')}
          </p>
          <div className="flex flex-col gap-[6px]">
            {classes.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => start(cls.id)}
                disabled={busy}
                className={cn(
                  'flex w-full items-center justify-between rounded-[10px] border px-[12px] py-[10px] text-start text-[13px] font-semibold transition-colors',
                  busy
                    ? 'cursor-not-allowed border-border text-text-faint'
                    : 'border-border text-ink hover:border-teal hover:bg-teal-tint hover:text-teal-deep',
                )}
              >
                <span dir="auto">{classLabel(cls)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mx-[20px] mt-[12px] rounded-[10px] bg-status-review-bg px-[12px] py-[8px] text-[12.5px] text-status-review">
          {error}
        </p>
      ) : null}

      {blocked ? (
        <div className="mt-[16px] flex items-center justify-end border-t border-[#F0EAE1] px-[20px] py-[14px]">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-neutral-700 transition-colors hover:text-ink"
          >
            {t('confirm.cancel')}
          </button>
        </div>
      ) : classes ? (
        <div className="mt-[16px] flex items-center justify-start border-t border-[#F0EAE1] px-[20px] py-[14px]">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-neutral-700 transition-colors hover:text-ink"
          >
            {t('confirm.cancel')}
          </button>
        </div>
      ) : (
        <DialogFooter label={t('confirm.start')} busy={busy} onCancel={onClose} onConfirm={() => start()} />
      )}
    </Modal>
  );
}
