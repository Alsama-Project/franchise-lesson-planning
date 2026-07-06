'use client';

// The confirm-before-trash dialog for a Weekly Overview lesson card. Rendered
// through a portal to document.body. NOTE: a portal moves the dialog out of the
// anchor's DOM subtree, but React synthetic events still bubble through the REACT
// tree — and this dialog is a React descendant of the card's <Link>. So a click on
// Confirm/Cancel would bubble up to that <Link> and navigate to /plan/[id] (which,
// post-delete, 404s). We stop propagation at the overlay root so no event inside
// the dialog reaches the card link or the dnd-kit draggable.
//
// Destructive framing (red confirm) because it removes the lesson from the board;
// the copy names the lesson and reassures that it goes to the recycle bin, not
// oblivion (soft delete — migration 0048).

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

export function DeleteLessonDialog({
  lessonName,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  /** Human label of the lesson being deleted, shown in the title/body. */
  lessonName: string;
  /** True while the trash action is in flight — disables the buttons. */
  pending: boolean;
  /** Server error to surface inline, or null. */
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('board');

  // Close on Escape — same affordance as the submit-for-approval modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Portals need a document; render nothing during SSR.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('deleteLesson.dialog.title')}
      // Contain every interaction inside the dialog: React bubbles portal events
      // through the component tree to the card's <Link>, so without this a click
      // would navigate to the (now-deleted) plan and 404. Backdrop click cancels.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-[18px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]">
        <div className="px-[28px] pt-[26px] pb-[22px]">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
            {t('deleteLesson.dialog.title')}
          </h2>
          <p dir="auto" className="mt-[10px] text-[13.5px] leading-[1.55] text-text-muted">
            {t.rich('deleteLesson.dialog.body', {
              name: lessonName,
              b: (chunks) => <b className="font-semibold text-ink">{chunks}</b>,
            })}
          </p>
          {error ? (
            <p className="mt-[12px] rounded-[10px] border border-danger-border bg-danger-bg px-[12px] py-[8px] text-[12.5px] text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-[10px] border-t border-[#F0EAE1] px-[28px] py-[16px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-[11px] px-[16px] py-[10px] text-[13.5px] font-medium text-neutral-700 transition-colors hover:text-ink disabled:opacity-60"
          >
            {t('deleteLesson.dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-[11px] bg-danger px-[20px] py-[10px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(178,58,46,0.5)] transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t('deleteLesson.dialog.deleting') : t('deleteLesson.dialog.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
