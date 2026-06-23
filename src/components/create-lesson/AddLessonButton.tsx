'use client';

import { useCreateLesson } from '@/components/create-lesson/CreateLessonContext';

/**
 * The teal "+ Lesson" hero button in the home header action row. Opens the create
 * dialog with nothing pre-selected (anchored to the home's shown week).
 */
export function AddLessonButton() {
  const { openCreate } = useCreateLesson();
  return (
    <button
      type="button"
      onClick={() => openCreate()}
      className="inline-flex items-center gap-[7px] rounded-[10px] bg-teal px-[17px] py-[10px] text-[14px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(31,122,108,0.5)] transition-colors hover:bg-teal-deep"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      Lesson
    </button>
  );
}
