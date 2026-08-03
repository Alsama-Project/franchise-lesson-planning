'use client';

// A confirmation ANCHORED to the card it concerns — never a full-screen modal, so
// the teacher still sees what she is deciding about. Rendered as an overlay pinned
// to the card's own box.
//
// `#B23A2E` (the danger fill on "Regenerate anyway") appears in THIS feature ONLY
// here, and only when `danger` is set — i.e. only when a real edit is at stake.
// Discarding merely-generated content is not her work, so that path stays neutral
// teal.

export function CardConfirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="ws-no-print absolute inset-0 z-20 flex items-center justify-center rounded-[16px] bg-white/70 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-[360px] rounded-[13px] border border-border bg-surface p-[16px] shadow-lg">
        <div className="text-[14px] font-bold text-ink">{title}</div>
        <p className="mt-1.5 text-[12.5px] leading-[1.5] text-neutral-600">{body}</p>
        <div className="mt-3.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-border-strong bg-surface px-[13px] py-[7px] text-[12.5px] font-semibold text-ink hover:bg-surface-subtle"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[8px] px-[13px] py-[7px] text-[12.5px] font-semibold text-white"
            style={{ background: danger ? '#B23A2E' : '#1F7A6C' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
