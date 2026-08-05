'use client';

// A compact prompt popover anchored AT THE CARET (or selection) — the inline
// replacement for the old centred "Generate with AI" modal. Reused for both
// generate ("Describe the resource you need…") and adjust ("How should I change
// this?"). Enter submits, Shift-Enter makes a newline, Escape cancels. It renders
// into a body portal at fixed viewport coordinates, clamped to stay on-screen.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { BRAND } from './theme';

export interface Anchor {
  x: number;
  y: number;
}

export function InlinePromptPopover({
  anchor,
  title,
  placeholder,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
  allowEmpty = false,
}: {
  anchor: Anchor;
  title: string;
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  /** When true, submitting with an empty field is allowed (e.g. regenerate with no
   *  comment). Default false — generate/adjust require a prompt. */
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [pos, setPos] = useState<Anchor>(anchor);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  // Keep the popover inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    let x = anchor.x;
    let y = anchor.y;
    if (x + r.width + margin > window.innerWidth) x = window.innerWidth - r.width - margin;
    if (x < margin) x = margin;
    if (y + r.height + margin > window.innerHeight) y = Math.max(margin, anchor.y - r.height - 28);
    setPos({ x, y });
  }, [anchor]);

  const canSubmit = !busy && (allowEmpty || text.trim().length > 0);
  const submit = () => {
    if (canSubmit) onSubmit(text);
  };

  return createPortal(
    <>
      {/* Click-off / escape layer (does not steal the caret). */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 69 }}
        onMouseDown={(e) => {
          e.preventDefault();
          if (!busy) onCancel();
        }}
      />
      <div
        ref={ref}
        style={{
          position: 'fixed',
          top: pos.y,
          left: pos.x,
          zIndex: 70,
          width: 340,
          maxWidth: 'calc(100vw - 16px)',
          background: '#fff',
          border: '1px solid #E7DECF',
          borderRadius: 12,
          boxShadow: '0 14px 36px -12px rgba(40,30,20,0.4)',
          padding: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', color: BRAND.teal }}>
            <Sparkles size={15} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink }}>{title}</span>
        </div>
        <textarea
          ref={taRef}
          rows={2}
          value={text}
          disabled={busy}
          placeholder={placeholder}
          dir="auto"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              if (!busy) onCancel();
            }
          }}
          style={{
            width: '100%',
            fontFamily: 'inherit',
            fontSize: 13.5,
            lineHeight: 1.5,
            color: BRAND.ink,
            background: busy ? '#F7F5F1' : '#fff',
            border: '1px solid #CFE6E0',
            borderRadius: 9,
            padding: '9px 10px',
            outline: 'none',
            resize: 'vertical',
          }}
        />
        {error ? <div style={{ marginTop: 7, fontSize: 12, color: BRAND.pink }}>{error}</div> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#fff',
              background: BRAND.teal,
              border: 'none',
              padding: '8px 14px',
              borderRadius: 8,
              cursor: canSubmit ? 'pointer' : 'default',
              opacity: canSubmit ? 1 : 0.6,
            }}
          >
            <Sparkles size={13} />
            {busy ? 'Working…' : submitLabel}
          </button>
          <button
            type="button"
            onClick={() => !busy && onCancel()}
            disabled={busy}
            style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, color: BRAND.muted, background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: BRAND.faint }}>↵ to run</span>
        </div>
      </div>
    </>,
    document.body,
  );
}
