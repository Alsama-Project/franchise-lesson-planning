'use client';

// The small trash affordance on a Weekly Overview lesson card. The card itself is a
// <Link> (and, on the Status board, a dnd-kit draggable), so this button must
// swallow the click (no navigation) and the pointer-down (no drag start). It opens
// the confirm dialog; on confirm it calls the soft-delete action and refreshes the
// board. Rendered only when the viewer may delete the plan (see `card.canDelete`).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trashLessonPlan } from '@/lib/actions/lesson-trash';
import { DeleteLessonDialog } from '@/components/weekly-overview/DeleteLessonDialog';

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function DeleteLessonControl({
  planId,
  lessonName,
}: {
  planId: string;
  /** Human label of the lesson, for the button aria-label and the confirm copy. */
  lessonName: string;
}) {
  const t = useTranslations('board');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Keep the surrounding card <Link> from navigating and the dnd-kit draggable
  // from starting a drag when the affordance is pressed.
  const swallow = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const confirmDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await trashLessonPlan(planId);
      if (!res.ok) {
        setError(res.error ?? t('deleteLesson.error'));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        aria-label={t('deleteLesson.aria', { name: lessonName })}
        title={t('deleteLesson.button')}
        onClick={(e) => {
          swallow(e);
          setOpen(true);
        }}
        onPointerDown={swallow}
        className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[8px] text-text-faint opacity-0 transition-colors hover:bg-danger-bg hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon />
      </button>

      {open ? (
        <DeleteLessonDialog
          lessonName={lessonName}
          pending={pending}
          error={error}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (pending) return;
            setOpen(false);
            setError(null);
          }}
        />
      ) : null}
    </>
  );
}
