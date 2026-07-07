'use client';

// The Google-style "add a comment" trigger — a chat bubble with a ＋ inside. It
// replaces the old text "Comment" buttons: one per commentable section (woven into
// PhaseRow / ObjectiveAnnotations) and one at plan level (in the pane) that drops a
// whole-plan comment into the stack. The create behaviour it drives is unchanged —
// only the trigger's look changes.

import { A } from './tokens';

export function ChatPlusIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7.5v5" />
      <path d="M9.5 10h5" />
    </svg>
  );
}

export function AddCommentButton({
  onClick,
  active,
  label,
  size = 15,
}: {
  onClick: () => void;
  active?: boolean;
  /** Accessible name + tooltip (e.g. "Add comment"). */
  label: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[8px] border transition-colors"
      style={
        active
          ? { background: A.suggestionBg, color: A.suggestionFg, borderColor: A.pillTealBorder }
          : { background: 'transparent', color: A.tabIdleFg, borderColor: A.tabBorder }
      }
    >
      <ChatPlusIcon size={size} />
    </button>
  );
}
