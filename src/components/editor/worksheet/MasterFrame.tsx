'use client';

// The locked (cream, read-only) "Master" frame of the A4 worksheet page: the
// header, the objective strip, and the footer. The editable BODY is rendered as
// `children` between the objective strip and the footer. (The exit ticket is
// chosen per-lesson in the wizard, not on the worksheet, so it is not a section
// here.)
//
// Every value comes from real lesson/curriculum/class context (WorksheetContext);
// the "Animals / Year 1" copy from the mockup is placeholder only. Colour follows
// the project law: cream surfaces (#F5EDE5 / #FBF6EF) mean curriculum-provided,
// read-only content.

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { WorksheetContext } from './context';

// Auto-fit bounds for the header title. Short titles render at the max; long ones
// shrink to fit one line, dropping to a balanced two-line wrap only at the floor.
const TITLE_MAX = 19;
const TITLE_MIN = 12;

/**
 * The subject·year·theme title, auto-fitted to its column. We measure the text
 * against the available width and pick the largest font (≤ TITLE_MAX) that keeps
 * it on a single line; if even TITLE_MIN overflows, we allow a balanced two-line
 * wrap at the floor. Right padding + the reserved badge column mean the text never
 * touches the page edge or runs under the "Master" badge.
 */
function FitTitle({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ size, wrap }, setFit] = useState<{ size: number; wrap: boolean }>({
    size: TITLE_MAX,
    wrap: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Phase 1 — find the largest size that fits on ONE line (no horizontal
    // overflow). scrollWidth/clientWidth are layout metrics, unaffected by the
    // page's zoom transform, so this measures correctly at any zoom.
    const prevWhiteSpace = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    const fitsOneLine = (fs: number) => {
      el.style.fontSize = `${fs}px`;
      return el.scrollWidth <= el.clientWidth + 0.5;
    };

    let lo = TITLE_MIN;
    let hi = TITLE_MAX;
    let best: number | null = fitsOneLine(TITLE_MIN) ? TITLE_MIN : null;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (fitsOneLine(mid)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    el.style.whiteSpace = prevWhiteSpace;
    el.style.fontSize = '';
    if (best != null) {
      setFit({ size: Math.floor(best * 2) / 2, wrap: false });
    } else {
      // Too long for one line even at the floor — wrap to (at most) two balanced
      // lines at the minimum size.
      setFit({ size: TITLE_MIN, wrap: true });
    }
  }, [text]);

  const style: CSSProperties = {
    fontSize: size,
    lineHeight: 1.2,
    fontWeight: 700,
    color: '#2A2422',
    textAlign: 'right',
    whiteSpace: wrap ? 'normal' : 'nowrap',
    textWrap: 'balance',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
  };

  return (
    <div ref={ref} style={style}>
      {text}
    </div>
  );
}

const LockIcon = ({ stroke = '#A18A6E', size = 12 }: { stroke?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/** "English · Year 1 · Animals", skipping any missing part. */
function titleLine(ctx: WorksheetContext): string {
  return [ctx.subjectName, ctx.year != null ? `Year ${ctx.year}` : '', ctx.theme]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
}

function BlankLine({ width }: { width: number }) {
  return (
    <span style={{ display: 'inline-block', width, borderBottom: '1.5px solid #C9B89F', height: 18 }} />
  );
}

// The body padding — the floating overlay is inset by exactly this so its
// coordinate space matches the editable content box (never the locked chrome).
export const BODY_PAD_TOP = 30;
export const BODY_PAD_X = 52;
export const BODY_PAD_BOTTOM = 16;

export function MasterFrame({
  ctx,
  children,
  pageLabel,
  bodyRef,
}: {
  ctx: WorksheetContext;
  children: ReactNode;
  /** Footer page indicator. Defaults to page 1 of 1 for a single-page render. */
  pageLabel?: { index: number; total: number };
  /** Optional handle on the editable BODY element — used only by the pagination
   *  measurer to derive the per-page content height (chrome = page − body). */
  bodyRef?: React.Ref<HTMLDivElement>;
}) {
  const dailyOutcome = ctx.dailyOutcome.trim() || 'meet today’s learning outcome';

  return (
    <div
      className="ws-page"
      // The A4 page is a CONTENT ISLAND: it carries the student-facing worksheet
      // in the curriculum's language and must stay independent of the surrounding
      // builder-chrome UI direction. `dir="auto"` resolves the page's own
      // direction from its content (the master wordmark is Latin, so an English
      // worksheet stays LTR) rather than inheriting an Arabic UI's `dir="rtl"`,
      // so the locked frame never mirrors. Per-paragraph bidi inside the editable
      // body is handled by `unicode-bidi: plaintext` on `.worksheet-doc` blocks.
      dir="auto"
      style={{
        width: 794,
        minHeight: 1123,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px -22px rgba(40,30,20,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* LOCKED HEADER (master) */}
      <div
        style={{
          flexShrink: 0,
          background: '#F5EDE5',
          borderBottom: '2px solid #E6D9C7',
          padding: '26px 52px 20px',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            fontWeight: 600,
            color: '#A18A6E',
          }}
        >
          <LockIcon /> Master
        </span>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-sacramento), cursive', fontSize: 44, lineHeight: 0.62, color: '#B62A5C' }}>
              Alsama
            </span>
            <span style={{ width: 1, height: 30, background: '#D8C9B4' }} />
            <span style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A18A6E', fontWeight: 700 }}>
              Student worksheet
            </span>
          </div>
          {/* Title is auto-fitted to this column (see FitTitle): the largest font
              that holds one line, falling back to a balanced two-line wrap only at
              the floor. paddingTop reserves the badge's row so the two never touch;
              maxWidth + the header's 52px padding keep text off the page edge. */}
          <div style={{ textAlign: 'right', maxWidth: 360, minWidth: 0, paddingTop: 10 }}>
            <FitTitle text={titleLine(ctx)} />
            {ctx.centreName ? (
              <div style={{ fontSize: 12.5, color: '#93826B', marginTop: 2 }}>{ctx.centreName}</div>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 30, marginTop: 20, fontSize: 15, color: '#6E6052' }}>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>
            Name <BlankLine width={150} />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>
            Date <BlankLine width={110} />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>
            Class <BlankLine width={100} />
          </span>
        </div>
      </div>

      {/* OBJECTIVE STRIP (master) */}
      <div
        style={{
          flexShrink: 0,
          background: '#FBF6EF',
          borderBottom: '1px solid #ECE0CF',
          padding: '13px 52px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#F0E2CF',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B0651E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l3 2" />
          </svg>
        </span>
        <span style={{ fontSize: 14.5, lineHeight: 1.45, color: '#4A4035' }}>
          <b style={{ color: '#2A2422' }}>By the end of this session, I will be able to</b> {dailyOutcome}
          {dailyOutcome.endsWith('.') ? '' : '.'}
        </span>
      </div>

      {/* BODY — the editable exercise area (relative: anchors the floating layer) */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          minHeight: 560,
          padding: `${BODY_PAD_TOP}px ${BODY_PAD_X}px ${BODY_PAD_BOTTOM}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          position: 'relative',
        }}
      >
        {children}
      </div>

      {/* FOOTER (master) */}
      <div
        style={{
          flexShrink: 0,
          background: '#F5EDE5',
          borderTop: '2px solid #E6D9C7',
          padding: '12px 52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 12, color: '#93826B' }}>
          {ctx.lessonCode ? `Lesson ${ctx.lessonCode}` : 'Lesson'}
        </span>
        <span style={{ fontFamily: 'var(--font-sacramento), cursive', fontSize: 22, lineHeight: 0.7, color: '#C58FA4' }}>
          Alsama
        </span>
        <span style={{ fontSize: 12, color: '#93826B' }}>
          Page {pageLabel?.index ?? 1} of {pageLabel?.total ?? 1}
        </span>
      </div>
    </div>
  );
}
