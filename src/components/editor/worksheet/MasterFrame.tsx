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

import type { ReactNode } from 'react';
import type { WorksheetContext } from './context';

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
}: {
  ctx: WorksheetContext;
  children: ReactNode;
}) {
  const dailyOutcome = ctx.dailyOutcome.trim() || 'meet today’s learning outcome';

  return (
    <div
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontFamily: 'var(--font-sacramento), cursive', fontSize: 44, lineHeight: 0.62, color: '#B62A5C' }}>
              Alsama
            </span>
            <span style={{ width: 1, height: 30, background: '#D8C9B4' }} />
            <span style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A18A6E', fontWeight: 700 }}>
              Student worksheet
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2A2422' }}>{titleLine(ctx)}</div>
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
        <span style={{ fontSize: 12, color: '#93826B' }}>Page 1 of 1</span>
      </div>
    </div>
  );
}
