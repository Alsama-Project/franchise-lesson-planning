'use client';

// A small, self-contained "i" affordance for a chart panel header. Reveals a short
// description of what the chart shows, on hover (pointer devices), tap (touch) and keyboard
// focus. There is no shared tooltip/popover primitive in the codebase, so this is bespoke —
// but deliberately tiny and dependency-free.
//
// Behaviour:
//  · pointer (mouse/pen) → opens on hover, closes on leave;
//  · touch → hover is ignored (would fire alongside the tap); the tap toggles instead;
//  · keyboard → opens on focus (but NOT the focus that a pointer press incidentally triggers,
//    so a tap doesn't focus-open then click-close itself);
//  · closes on Escape, outside click/tap, and blur.
//
// a11y: a real <button> with an aria-label, `aria-expanded`, and `aria-describedby` pointing
// at the popover, which carries `role="tooltip"`. The popover is anchored to the button's
// inline-end edge with logical insets so it flips correctly under RTL and never clips past
// the card edge (it opens downward, into the card body, and toward the inline-start).

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/** Teal — this is a tool/action affordance (no pink, no destructive red). */
const TEAL = '#1F7A6C';

export function InfoButton({ description }: { description: string }) {
  const t = useTranslations('insights');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  // True between a pointer press and its click, so the incidental focus doesn't also open
  // (which on touch would then be toggled straight back closed by the click).
  const pointerActive = useRef(false);
  const popoverId = useId();

  // Close on outside click/tap and on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex shrink-0"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={t('infoLabel')}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onPointerDown={() => {
          pointerActive.current = true;
        }}
        onFocus={() => {
          if (!pointerActive.current) setOpen(true);
        }}
        onClick={() => {
          setOpen((v) => !v);
          pointerActive.current = false;
        }}
        onBlur={() => {
          setOpen(false);
          pointerActive.current = false;
        }}
        className="inline-flex size-[18px] items-center justify-center leading-none transition-opacity hover:opacity-70 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal/60"
        style={{ color: TEAL }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-5" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open ? (
        <span
          id={popoverId}
          role="tooltip"
          dir="auto"
          className="absolute z-30 w-[248px] max-w-[248px] rounded-[10px] border border-[#ECE3D5] bg-surface p-[12px] text-[12px] leading-[1.5] font-normal text-[#5C544E] shadow-card"
          style={{ top: 'calc(100% + 6px)', insetInlineEnd: 0 }}
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}
