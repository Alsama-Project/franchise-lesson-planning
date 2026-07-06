'use client';

// The per-teacher recycle bin. Lists the signed-in user's soft-deleted lessons and
// lets them Restore (put it back on the board) or Delete permanently (a guarded hard
// delete). Both go through the RPC-backed server actions (migration 0048); restore
// can fail if the freed slot was re-planned, which is surfaced in the banner.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { StatusChip } from '@/components/weekly-overview/StatusChip';
import { restoreLessonPlan, purgeLessonPlan, type TrashedLesson } from '@/lib/actions/lesson-trash';

export function TrashView({ lessons }: { lessons: TrashedLesson[] }) {
  const t = useTranslations('board');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TrashedLesson | null>(null);
  const [, startTransition] = useTransition();

  const runRestore = (lesson: TrashedLesson) => {
    setError(null);
    setPendingId(lesson.id);
    startTransition(async () => {
      const res = await restoreLessonPlan(lesson.id);
      setPendingId(null);
      if (!res.ok) {
        setError(res.error ?? t('trash.restoreError'));
        return;
      }
      router.refresh();
    });
  };

  const runPurge = (lesson: TrashedLesson) => {
    setError(null);
    setPendingId(lesson.id);
    startTransition(async () => {
      const res = await purgeLessonPlan(lesson.id);
      setPendingId(null);
      setConfirm(null);
      if (!res.ok) {
        setError(res.error ?? t('trash.purgeError'));
        return;
      }
      router.refresh();
    });
  };

  if (lessons.length === 0) {
    return (
      <div className="rounded-[14px] border border-border px-6 py-16 text-center">
        <p className="text-[15px] font-semibold text-ink">{t('trash.empty.title')}</p>
        <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
          {t('trash.empty.body')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-[18px] text-[13.5px] text-text-muted">{t('trash.hint')}</p>

      {error ? (
        <div className="mb-[14px] rounded-[10px] border border-danger-border bg-danger-bg px-[12px] py-[9px] text-[12.5px] text-danger">
          {error}
        </div>
      ) : null}

      <ul className="flex flex-col gap-[10px]">
        {lessons.map((lesson) => (
          <li
            key={lesson.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-[10px] rounded-[14px] border border-border bg-surface px-[16px] py-[13px]"
          >
            <div className="min-w-[180px] flex-1">
              <div className="flex items-center gap-[8px]">
                <span className="text-[15px] font-bold text-ink">{lesson.title}</span>
                <StatusChip status={lesson.status} />
              </div>
              <p dir="auto" className="mt-[3px] line-clamp-1 text-[13px] text-text-muted">
                {lesson.subtitle}
              </p>
            </div>

            <div className="flex flex-shrink-0 items-center gap-[8px]">
              <button
                type="button"
                onClick={() => runRestore(lesson)}
                disabled={pendingId === lesson.id}
                className="inline-flex items-center rounded-[9px] border border-action-border px-[14px] py-[7px] text-[12.5px] font-semibold text-teal transition-colors hover:bg-teal-tint disabled:opacity-60"
              >
                {t('trash.restore')}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(lesson)}
                disabled={pendingId === lesson.id}
                className="inline-flex items-center rounded-[9px] px-[14px] py-[7px] text-[12.5px] font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-60"
              >
                {t('trash.purge')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {confirm ? (
        <PurgeConfirmDialog
          lessonName={`${confirm.title} · ${confirm.subtitle}`}
          pending={pendingId === confirm.id}
          onConfirm={() => runPurge(confirm)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

/** The destructive confirm for a permanent (hard) delete from the bin. */
function PurgeConfirmDialog({
  lessonName,
  pending,
  onConfirm,
  onCancel,
}: {
  lessonName: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('board');
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('trash.purgeDialog.title')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(42,36,34,0.55)' }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-[18px] bg-surface shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55)]">
        <div className="px-[28px] pt-[26px] pb-[22px]">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
            {t('trash.purgeDialog.title')}
          </h2>
          <p dir="auto" className="mt-[10px] text-[13.5px] leading-[1.55] text-text-muted">
            {t.rich('trash.purgeDialog.body', {
              name: lessonName,
              b: (chunks) => <b className="font-semibold text-ink">{chunks}</b>,
            })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-[10px] border-t border-[#F0EAE1] px-[28px] py-[16px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-[11px] px-[16px] py-[10px] text-[13.5px] font-medium text-neutral-700 transition-colors hover:text-ink disabled:opacity-60"
          >
            {t('trash.purgeDialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-[11px] bg-danger px-[20px] py-[10px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(178,58,46,0.5)] transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t('trash.purgeDialog.deleting') : t('trash.purgeDialog.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
