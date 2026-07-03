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
// Every new plan defaults to the centre year-group scope via the existing scope
// mechanism (createScopedPlan with scope: 'centre'); the teacher drops straight
// into the 5-step wizard.

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
import { createScopedPlan } from '@/lib/actions/create-lesson';
import { formatNumber } from '@/lib/format';

/** A fixed curriculum lesson to plan, with the day placement to write. */
export interface ScopeTarget {
  lessonKey: string;
  year: number;
  /** The centre (school) to create the centre-scoped plan against — the slot's centre. */
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

export function useScopeChooser(): ScopeChooserApi {
  const ctx = useContext(ScopeChooserContext);
  if (!ctx) throw new Error('useScopeChooser must be used within ScopeChooserProvider');
  return ctx;
}

export function ScopeChooserProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ScopeTarget | null>(null);
  const openChooser = useCallback((next: ScopeTarget) => setTarget(next), []);
  const closeChooser = useCallback(() => setTarget(null), []);

  return (
    <ScopeChooserContext.Provider value={{ openChooser }}>
      {children}
      {target ? <ConfirmLessonDialog target={target} onClose={closeChooser} /> : null}
    </ScopeChooserContext.Provider>
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
 * its year group are already known and the scope defaults to the centre, so there
 * is nothing to ask — one confirm creates the centre-scoped plan and opens it.
 */
function ConfirmLessonDialog({ target, onClose }: { target: ScopeTarget; onClose: () => void }) {
  const t = useTranslations('board');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await createScopedPlan({
      lessonKey: target.lessonKey,
      scope: 'centre',
      schoolId: target.centreId,
      weekday: target.weekday,
      period: target.period,
    });
    if (res.ok) {
      router.push(`/plan/${res.planId}`);
      return; // keep the dialog up through the navigation
    }
    setError(res.error);
    setBusy(false);
  };

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

      {error ? (
        <p className="mx-[20px] mt-[12px] rounded-[10px] bg-status-review-bg px-[12px] py-[8px] text-[12.5px] text-status-review">
          {error}
        </p>
      ) : null}

      <DialogFooter label={t('confirm.start')} busy={busy} onCancel={onClose} onConfirm={start} />
    </Modal>
  );
}
