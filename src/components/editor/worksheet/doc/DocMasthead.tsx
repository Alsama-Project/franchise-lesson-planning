'use client';

// The single worksheet masthead for the document editor: the Alsama wordmark, the
// subject·year·theme title, the pupil Name/Date/Class lines, and the objective
// strip. Rendered ONCE at the top of the flowing document (never per page) — the
// "Different First Page" behaviour on export falls out naturally because it is a
// normal flow element, so it prints on page 1 only. Mirrors the v2 MasterFrame's
// locked-header styling (cream = curriculum-provided, read-only).

import type { WorksheetContext } from '../context';
import { BRAND } from './theme';

function titleLine(ctx: WorksheetContext): string {
  return [ctx.subjectName, ctx.year != null ? `Year ${ctx.year}` : '', ctx.theme]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
}

function BlankLine({ width }: { width: number }) {
  return <span style={{ display: 'inline-block', width, borderBottom: '1.5px solid #C9B89F', height: 18 }} />;
}

export function DocMasthead({ ctx }: { ctx: WorksheetContext }) {
  const dailyOutcome = ctx.dailyOutcome.trim() || 'meet today’s learning outcome';
  return (
    <div className="ws-doc-masthead" dir="auto" contentEditable={false}>
      {/* Header band */}
      <div
        style={{
          background: BRAND.cream,
          borderBottom: `2px solid ${BRAND.creamBorder}`,
          padding: '24px 52px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-sacramento), cursive', fontSize: 42, lineHeight: 0.62, color: BRAND.pink }}>
              Alsama
            </span>
            <span style={{ width: 1, height: 28, background: '#D8C9B4' }} />
            <span style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND.faint, fontWeight: 700 }}>
              Student worksheet
            </span>
          </div>
          <div style={{ textAlign: 'right', maxWidth: 340, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.ink, lineHeight: 1.2, textWrap: 'balance' }}>
              {titleLine(ctx)}
            </div>
            {ctx.centreName ? (
              <div style={{ fontSize: 12.5, color: BRAND.faint, marginTop: 2 }}>{ctx.centreName}</div>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 30, marginTop: 18, fontSize: 15, color: BRAND.muted }}>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>Name <BlankLine width={150} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>Date <BlankLine width={110} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>Class <BlankLine width={100} /></span>
        </div>
      </div>

      {/* Objective strip — travels with the page-1 masthead */}
      <div
        style={{
          background: BRAND.creamSoft,
          borderBottom: '1px solid #ECE0CF',
          padding: '12px 52px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#F0E2CF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B0651E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l3 2" />
          </svg>
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.45, color: '#4A4035' }}>
          <b style={{ color: BRAND.ink }}>By the end of this session, I will be able to</b> {dailyOutcome}
          {dailyOutcome.endsWith('.') ? '' : '.'}
        </span>
      </div>
    </div>
  );
}

export function DocFooter({ ctx, className }: { ctx: WorksheetContext; className?: string }) {
  return (
    <div
      className={className}
      contentEditable={false}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: BRAND.cream,
        borderTop: `2px solid ${BRAND.creamBorder}`,
        padding: '10px 52px',
      }}
    >
      <span style={{ fontSize: 12, color: BRAND.faint }}>{ctx.lessonCode ? `Lesson ${ctx.lessonCode}` : 'Lesson'}</span>
      <span style={{ fontFamily: 'var(--font-sacramento), cursive', fontSize: 20, lineHeight: 0.7, color: '#C58FA4' }}>Alsama</span>
      <span className="ws-print-pageno" style={{ fontSize: 12, color: BRAND.faint }} />
    </div>
  );
}
