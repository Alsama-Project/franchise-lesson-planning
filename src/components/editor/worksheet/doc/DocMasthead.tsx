'use client';

// The single worksheet masthead for the document editor: the Alsama wordmark, the
// subject·year·theme title, the pupil Name/Date/Class lines, and the objective
// strip. Rendered ONCE at the top of the flowing document (never per page) — the
// "Different First Page" behaviour on export falls out naturally because it is a
// normal flow element, so it prints on page 1 only. Mirrors the v2 MasterFrame's
// locked-header styling (cream = curriculum-provided, read-only).

import type { WorksheetContext } from '../context';
import { worksheetArtifactText } from '@/lib/editor/worksheet-content-locale';
import { BRAND } from './theme';

function titleLine(ctx: WorksheetContext): string {
  return [
    ctx.subjectName,
    ctx.year != null ? worksheetArtifactText(ctx.contentLanguage, 'yearLabel', { year: ctx.year }) : '',
    ctx.theme,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
}

function BlankLine({ width }: { width: number }) {
  return <span style={{ display: 'inline-block', width, borderBottom: '1.5px solid #C9B89F', height: 18 }} />;
}

export function DocMasthead({ ctx, templateMode = false }: { ctx: WorksheetContext; templateMode?: boolean }) {
  const t = (key: Parameters<typeof worksheetArtifactText>[1], vars?: Record<string, string | number>) =>
    worksheetArtifactText(ctx.contentLanguage, key, vars);
  // Render the teacher's stored objective remainder verbatim after the fixed
  // first-person stem — no point-of-view rewriting. Empty → placeholder fallback,
  // never the daily outcome. In Template Mode there is no lesson, so the strip shows
  // a muted "the objective appears here when a teacher plans a lesson" hint instead.
  const objectiveText = ctx.smarttObjective.trim() || t('objectiveFallback');
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
              {t('studentWorksheet')}
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
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>{t('name')} <BlankLine width={150} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>{t('date')} <BlankLine width={110} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>{t('class')} <BlankLine width={100} /></span>
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
        {templateMode ? (
          <span style={{ fontSize: 14, lineHeight: 1.45, color: BRAND.faint, fontStyle: 'italic' }}>
            {t('objectiveTemplateHint')}
          </span>
        ) : (
          <span style={{ fontSize: 14, lineHeight: 1.45, color: '#4A4035' }}>
            <b style={{ color: BRAND.ink }}>{t('objectivePrefix')}</b> {objectiveText}
            {objectiveText.endsWith('.') ? '' : '.'}
          </span>
        )}
      </div>
    </div>
  );
}

export function DocFooter({ ctx, className }: { ctx: WorksheetContext; className?: string }) {
  const lessonText = ctx.lessonCode
    ? worksheetArtifactText(ctx.contentLanguage, 'lessonLabel', { code: ctx.lessonCode })
    : worksheetArtifactText(ctx.contentLanguage, 'lessonLabel', { code: '' }).trim();
  return (
    // NOTE: display/flex layout is set via the className's CSS (ws-doc-footer-screen
    // / ws-print-footer), NOT inline — an inline `display` would override the
    // `.ws-print-footer { display:none }` screen rule and the print footer would
    // duplicate on the pageless surface. Keep only visual styling inline here.
    <div
      className={className}
      contentEditable={false}
      style={{
        background: BRAND.cream,
        borderTop: `2px solid ${BRAND.creamBorder}`,
        padding: '10px 52px',
      }}
    >
      <span style={{ fontSize: 12, color: BRAND.faint }}>{lessonText}</span>
      <span style={{ fontFamily: 'var(--font-sacramento), cursive', fontSize: 20, lineHeight: 0.7, color: '#C58FA4' }}>Alsama</span>
    </div>
  );
}
