'use client';

// Archive confirmation for a context document. Ported from the same destructive
// pattern as the Weekly Overview DeleteLessonDialog: a portalled modal, red
// confirm, pending/error props, Escape + backdrop-click to cancel. The mockup
// draws an Archive button but no confirm step; per the brief the confirmation
// makes the consequence plain — the document stops feeding every future AI call —
// rather than a generic "are you sure".

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

export function ArchiveConfirmDialog({
  docName,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  docName: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('settings');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('aiInstructions.archive.title', { name: docName })}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-[18px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]">
        <div className="px-[28px] pt-[26px] pb-[22px]">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
            {t('aiInstructions.archive.title', { name: docName })}
          </h2>
          <p dir="auto" className="mt-[10px] text-[13.5px] leading-[1.55] text-text-muted">
            {t('aiInstructions.archive.body')}
          </p>
          {error ? (
            <p className="mt-[12px] rounded-[10px] border border-danger-border bg-danger-bg px-[12px] py-[8px] text-[12.5px] text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-[10px] border-t border-border-subtle px-[28px] py-[16px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-[11px] px-[16px] py-[10px] text-[13.5px] font-medium text-neutral-700 transition-colors hover:text-ink disabled:opacity-60"
          >
            {t('aiInstructions.archive.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-[11px] bg-danger px-[20px] py-[10px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(178,58,46,0.5)] transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t('aiInstructions.archive.archiving') : t('aiInstructions.archive.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
