'use client';

// One image slot on an exercise's paper. The slot's box is ALWAYS reserved (from
// the very first frame), so a picture landing — or failing — never shifts the text
// around it.
//
// A `ready` slot DISPLAYS its generated picture, resolved from `storage_path`
// through the auth'd, re-signing GET /api/worksheet-image route (never a persisted
// signed URL). The picture is contained within the reserved box — same height in
// every state — with its aspect ratio kept and no cropping. Every OTHER state, and
// a `ready` slot whose object turns out unreachable (`onError`), falls back to the
// `[Picture: …]` token in monospace — ON SCREEN ONLY. The token is `ws-no-print`, so
// the printed student sheet shows just the empty framed box (the image's footprint):
// an image-generation brief must never reach a worksheet's reader.
//
// State → controls beneath the box (a teal strip, never a menu):
//   • ready    → Regenerate image · Replace image
//   • failed   → Try again · Replace image   (a FAILED slot never fails its exercise)
//   • refused  → nothing   (cap reached; retrying refuses again — no Try again, no error)
//   • pending  → nothing   (image gen skipped/disabled; the sheet still carries the token)

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ImageSlot } from '@/types/worksheet-exercise';
import { resolveImageSrc } from '../resizableImage';
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

  // A slot can be `ready` in the row while the object is unreachable (deleted file,
  // storage outage, bad path). On the <img>'s error we revert THIS slot to the token
  // — a broken-image icon on the worksheet paper is a worse failure than the token,
  // which at least tells the teacher what was meant to be there.
  const [imgError, setImgError] = useState(false);
  const showImage = state === 'ready' && !imgError;

  return (
    <div className="my-[14px]">
      {/* Reserved box — SAME height in every state (IMAGE_SLOT_HEIGHT), so a landing
          or failing picture never shifts the text. When it holds a picture the box
          reads as content (no dashed reservation border, no fill); otherwise it shows
          the `[Picture: …]` token, exactly the images-off print form. */}
      <div
        className={
          showImage
            ? 'flex items-center justify-center rounded-[10px] px-4 text-center'
            : 'flex items-center justify-center rounded-[10px] border border-dashed border-[#E6D9C7] bg-[#FBF8F3] px-4 text-center'
        }
        style={{ height: IMAGE_SLOT_HEIGHT }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageSrc('', slot.storage_path)}
            alt={slot.brief}
            onError={() => setImgError(true)}
            style={{ maxHeight: '100%', maxWidth: '100%', display: 'block' }}
          />
        ) : (
          // The brief token is EDITOR CHROME (ws-no-print): the teacher sees what the
          // image will be, but the printed student sheet shows only the empty framed
          // box — an image-generation brief must never reach a worksheet's reader.
          <span className="ws-no-print font-mono text-[12.5px] text-neutral-500" dir="auto">
            [Picture: {slot.brief}]
          </span>
        )}
      </div>

      {state === 'ready' ? (
        <SlotStrip>
          <SlotButton onClick={onRegenerate}>{t('image.regenerate')}</SlotButton>
          <SlotButton onClick={onReplace} deferredTitle={t('image.replaceDeferred')}>
            {t('image.replace')}
          </SlotButton>
        </SlotStrip>
      ) : state === 'failed' ? (
        <>
          <SlotStrip>
            <SlotButton onClick={onRetry}>{t('image.tryAgain')}</SlotButton>
            <SlotButton onClick={onReplace} deferredTitle={t('image.replaceDeferred')}>
              {t('image.replace')}
            </SlotButton>
          </SlotStrip>
          {/* The captured failure reason, so the teacher sees WHY without a SQL query.
              Editor chrome only (ws-no-print): the printed sheet never carries it. The
              text is the route's message (redacted/truncated at the write site), not a
              translated UI string. */}
          {slot.error ? (
            <p className="ws-no-print mt-[5px] text-[11px] leading-snug text-neutral-500" dir="auto">
              {slot.error}
            </p>
          ) : null}
        </>
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
