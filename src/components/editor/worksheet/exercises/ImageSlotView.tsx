'use client';

// One image slot on an exercise's paper. The slot's box is ALWAYS reserved (from
// the very first frame), so a picture landing — or failing — never shifts the text
// around it.
//
// On THIS branch a ready slot cannot yet DISPLAY its picture (the render wiring —
// resolving `storage_path` through `/api/worksheet-image` inside the image node —
// lands in the next image branch). So every state shows the `[Picture: …]` token
// in monospace on the paper: this is exactly the printed form with images off, so
// it reads as deliberate, not as missing work.
//
// State → controls beneath the box (a teal strip, never a menu):
//   • ready    → Regenerate image · Replace image
//   • failed   → Try again · Replace image   (a FAILED slot never fails its exercise)
//   • refused  → nothing   (cap reached; retrying refuses again — no Try again, no error)
//   • pending  → nothing   (image gen skipped/disabled; the sheet still carries the token)

import { useTranslations } from 'next-intl';
import type { ImageSlot } from '@/types/worksheet-exercise';
import { IMAGE_SLOT_HEIGHT } from './heights';

export type SlotDisplayState = 'ready' | 'failed' | 'refused' | 'pending';

/** Derive the render state: refusal is POSITIONAL (index ≥ cap), so it is passed in
 *  rather than read off the slot; otherwise the slot's own status decides. */
export function slotDisplayState(slot: ImageSlot, refused: boolean): SlotDisplayState {
  if (refused) return 'refused';
  if (slot.status === 'ready' && slot.storage_path) return 'ready';
  if (slot.status === 'failed') return 'failed';
  return 'pending';
}

export function ImageSlotView({
  slot,
  refused,
  onRegenerate,
  onRetry,
  onReplace,
}: {
  slot: ImageSlot;
  refused: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
  /** Replace-with-upload binds a slot to an uploaded image — that wiring lands with
   *  image rendering in the next branch; undefined here renders it as deferred. */
  onReplace?: () => void;
}) {
  const t = useTranslations('worksheetGen');
  const state = slotDisplayState(slot, refused);

  return (
    <div className="my-[14px]">
      {/* Reserved box — the token on the paper, exactly the images-off print form. */}
      <div
        className="flex items-center justify-center rounded-[10px] border border-dashed border-[#E6D9C7] bg-[#FBF8F3] px-4 text-center"
        style={{ height: IMAGE_SLOT_HEIGHT }}
      >
        <span className="font-mono text-[12.5px] text-neutral-500" dir="auto">
          [Picture: {slot.brief}]
        </span>
      </div>

      {state === 'ready' ? (
        <SlotStrip>
          <SlotButton onClick={onRegenerate}>{t('image.regenerate')}</SlotButton>
          <SlotButton onClick={onReplace} deferredTitle={t('image.replaceDeferred')}>
            {t('image.replace')}
          </SlotButton>
        </SlotStrip>
      ) : state === 'failed' ? (
        <SlotStrip>
          <SlotButton onClick={onRetry}>{t('image.tryAgain')}</SlotButton>
          <SlotButton onClick={onReplace} deferredTitle={t('image.replaceDeferred')}>
            {t('image.replace')}
          </SlotButton>
        </SlotStrip>
      ) : null}
    </div>
  );
}

function SlotStrip({ children }: { children: React.ReactNode }) {
  return <div className="ws-no-print mt-[7px] flex items-center gap-[14px]">{children}</div>;
}

/** A quiet teal text control. When `onClick` is absent the control is a deferred
 *  affordance (Replace-with-upload, next branch): shown, disabled, and titled. */
function SlotButton({
  onClick,
  deferredTitle,
  children,
}: {
  onClick?: () => void;
  deferredTitle?: string;
  children: React.ReactNode;
}) {
  const disabled = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? deferredTitle : undefined}
      className={
        'text-[12px] font-semibold text-teal hover:underline disabled:cursor-not-allowed disabled:text-neutral-300 disabled:no-underline'
      }
    >
      {children}
    </button>
  );
}
