'use client';

// The confirm-then-commit dialog for the Status board's drag-to-submit. A teacher
// dragging one of their own drafts (In progress / Needs Review) into the
// "Submitted" column opens this FIRST — nothing is written until they confirm.
//
// Body wording reflects the real post-submit semantics (see Phase 0): the plan
// goes to the subject coordinator's review queue; the teacher can still open and
// edit it while it's pending; the coordinator either approves it or sends it back.
// Primary action is teal (the design system's tools/actions colour); Cancel is a
// plain dismissal that leaves the card in its original column.

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';

export function SubmitForApprovalModal({
  year,
  onConfirm,
  onCancel,
}: {
  /** The dragged plan's year band — names the lesson in the confirm copy. */
  year: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('board');
  const locale = useLocale();

  // Close on Escape — same affordance as the New Lesson modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('statusView.submitModal.ariaLabel')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-[18px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]">
        <div className="px-[28px] pt-[26px] pb-[22px]">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
            {t('statusView.submitModal.title')}
          </h2>
          <p className="mt-[10px] text-[13.5px] leading-[1.55] text-text-muted">
            {t('statusView.submitModal.body', { n: formatNumber(year, locale) })}
          </p>
        </div>

        <div className="flex items-center justify-end gap-[10px] border-t border-[#F0EAE1] px-[28px] py-[16px]">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[11px] px-[16px] py-[10px] text-[13.5px] font-medium text-neutral-700 transition-colors hover:text-ink"
          >
            {t('statusView.submitModal.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            // Teal #1F7A6C — the design system's tools/actions colour.
            className="inline-flex items-center justify-center rounded-[11px] bg-teal px-[20px] py-[10px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(31,122,108,0.5)] transition-colors hover:bg-teal-deep"
          >
            {t('statusView.submitModal.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
