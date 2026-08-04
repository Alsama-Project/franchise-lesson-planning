'use client';

// Read-only preview of the fully composed system prompt each tool receives. Opened
// from the AI-instructions board header; composes through the REAL composeContextStack
// server-side (GET /api/admin/context-docs/preview) and renders the result verbatim.
//
// It exists because a doc filed against the wrong tool — or a stack left empty —
// is invisible until output goes wrong. This surface makes "what does this tool
// actually receive?" answerable at a glance. No editing from here; matches the
// board's visual treatment (teal chrome, the DocumentPopup modal shell) — no new
// colours or layout primitives.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  AI_CONTEXT_TOOLS,
  type AiContextLayer,
  type AiContextPreviewPayload,
  type AiContextPreviewTool,
  type AiContextTool,
} from '@/types/ai-context';

/** Ladder position for the layer badge — 1 org · 2 academic · 3 subject · 4 tool. */
const LAYER_RANK: Record<AiContextLayer, number> = { org: 1, academic: 2, subject: 3, tool: 4 };

export function ComposedPromptPreview({
  subjects,
  onClose,
}: {
  subjects: { subjectId: string; name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations('settings');

  // Default to the first real subject so layer 3 is exercised out of the gate; an
  // empty value is the explicit "global only" selection.
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.subjectId ?? '');
  // The fetch outcome, tagged with the subject it was fetched FOR. `loading` and
  // `loadError` are derived from this (never set synchronously in an effect): the
  // result lags one render behind a subject change, so `forSubject !== subjectId`
  // reads as "loading" until the new fetch resolves. `forSubject: null` is the
  // pre-fetch sentinel (no real subject id — '' or a uuid — ever equals null).
  const [result, setResult] = useState<{
    forSubject: string | null;
    payload: AiContextPreviewPayload | null;
    failed: boolean;
  }>({ forSubject: null, payload: null, failed: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const qs = subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : '';
    fetch(`/api/admin/context-docs/preview${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('preview failed');
        return (await res.json()) as AiContextPreviewPayload;
      })
      .then((data) => {
        if (!cancelled) setResult({ forSubject: subjectId, payload: data, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ forSubject: subjectId, payload: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  if (typeof document === 'undefined') return null;

  // Derived (no setState-in-effect): a result for a stale subject reads as loading.
  const loading = result.forSubject !== subjectId;
  const loadError = !loading && result.failed;
  const payload = !loading && !result.failed ? result.payload : null;

  const toolLabel = (tool: AiContextTool): string => t(`aiInstructions.tools.${tool}`);
  const layerLabel = (layer: AiContextLayer): string => t(`aiInstructions.layers.${layer}`);
  // Keep the payload's tools in the canonical board order even if the API drifts.
  const orderedTools: AiContextPreviewTool[] = payload
    ? AI_CONTEXT_TOOLS.map((tool) => payload.tools.find((p) => p.tool === tool)).filter(
        (p): p is AiContextPreviewTool => Boolean(p),
      )
    : [];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('aiInstructions.preview.title')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 py-[34px]"
      style={{ background: 'rgba(42,36,34,0.45)' }}
    >
      <div className="w-full max-w-[900px] overflow-hidden rounded-[14px] border border-border-strong bg-surface shadow-[0_22px_44px_-18px_rgba(42,30,22,0.45)]">
        {/* Header: title + subject selector + close */}
        <div className="flex items-start gap-[14px] border-b border-border-subtle px-[22px] pt-[20px] pb-[16px]">
          <div className="min-w-0 flex-1">
            <div className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.06em] text-teal-deepest">
              {t('aiInstructions.preview.eyebrow')}
            </div>
            <div className="text-[18px] font-semibold text-ink">{t('aiInstructions.preview.title')}</div>
            <p dir="auto" className="mt-[6px] text-[12px] text-text-faint">
              {t('aiInstructions.preview.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('aiInstructions.popup.close')}
            className="inline-flex size-[32px] items-center justify-center rounded-[9px] border border-border text-neutral-700 transition-colors hover:bg-surface-warm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Subject selector — layer 3 is subject-scoped, so the composed stack changes
            with the subject. The current selection is shown in the control and echoed
            in the caption below. */}
        <div className="flex flex-wrap items-center gap-[10px] border-b border-border-subtle bg-surface-warm px-[22px] py-[13px]">
          <label htmlFor="preview-subject" className="text-[12px] font-semibold text-neutral-700">
            {t('aiInstructions.preview.subjectLabel')}
          </label>
          <select
            id="preview-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="min-w-[180px] rounded-[9px] border border-teal-tint-border bg-surface px-[10px] py-[8px] text-[12.5px] font-semibold text-ink"
          >
            <option value="">{t('aiInstructions.preview.noSubject')}</option>
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.name}
              </option>
            ))}
          </select>
          {payload ? (
            <span dir="auto" className="text-[11.5px] text-text-faint">
              {payload.subjectId
                ? t('aiInstructions.preview.showingSubject', {
                    subject: payload.subjectName ?? '—',
                    lang: payload.contentLanguage,
                  })
                : t('aiInstructions.preview.showingGlobal')}
            </span>
          ) : null}
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-[22px] pt-[18px] pb-[24px]">
          {loading ? (
            <p className="py-[24px] text-center text-[12.5px] text-text-faint">
              {t('aiInstructions.preview.loading')}
            </p>
          ) : loadError ? (
            <p className="rounded-[10px] border border-danger-border bg-danger-bg px-[12px] py-[10px] text-[12.5px] font-medium text-danger">
              {t('aiInstructions.preview.loadError')}
            </p>
          ) : (
            <div className="flex flex-col gap-[18px]">
              {orderedTools.map((toolResult) => (
                <ToolPanel
                  key={toolResult.tool}
                  result={toolResult}
                  toolLabel={toolLabel(toolResult.tool)}
                  layerLabel={layerLabel}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One tool's composed prompt, or its fail-closed state. */
function ToolPanel({
  result,
  toolLabel,
  layerLabel,
}: {
  result: AiContextPreviewTool;
  toolLabel: string;
  layerLabel: (layer: AiContextLayer) => string;
}) {
  const t = useTranslations('settings');
  return (
    <section className="overflow-hidden rounded-[12px] border border-border [border-top:3px_solid_var(--color-teal)] bg-surface">
      <div className="flex items-center gap-[9px] bg-teal-tint px-[14px] py-[11px]">
        <span className="text-[13.5px] font-bold text-teal-deepest">{toolLabel}</span>
        {result.ok ? (
          <span className="ms-auto text-[11px] font-semibold text-teal">
            {t('aiInstructions.preview.docCount', { count: result.docsUsed.length })}
          </span>
        ) : (
          <span className="ms-auto rounded-full bg-surface px-[9px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-neutral-700">
            {t('aiInstructions.preview.failClosedBadge')}
          </span>
        )}
      </div>

      {result.ok ? (
        <div className="flex flex-col gap-[10px] px-[14px] pt-[12px] pb-[14px]">
          {/* Source-document legend for layers 1-4, in composition order. */}
          {result.docsUsed.length > 0 ? (
            <div className="flex flex-wrap items-center gap-[6px]">
              {result.docsUsed.map((doc, i) => (
                <span
                  key={`${doc.layer}-${i}`}
                  dir="auto"
                  className="rounded-full bg-teal-tint px-[9px] py-[3px] text-[10.5px] font-semibold text-teal-deep"
                  title={`${layerLabel(doc.layer)} · v${doc.version}`}
                >
                  {LAYER_RANK[doc.layer]} · {doc.name} · v{doc.version}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-[11px] text-text-faint">{t('aiInstructions.preview.codeSideNote')}</p>
          {/* The composed system prompt, verbatim — role → precedence → layers 1-4
              (each headed with its source doc name) → the code-side response contract.
              Rendered exactly as the model receives it, never summarised. */}
          <div
            dir="auto"
            className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border-subtle bg-surface-raised px-[14px] py-[13px] font-mono text-[12px] leading-[1.8] text-neutral-900"
          >
            {result.system}
          </div>
        </div>
      ) : (
        // Fail-closed — the composer threw rather than compose a stripped prompt.
        // Surfaced as a first-class not-configured state (the board's dashed idiom),
        // never a blank panel.
        <div className="m-[14px] rounded-[10px] border border-dashed border-border-strong bg-surface-warm px-[14px] py-[13px]">
          <div className="text-[12.5px] font-semibold text-neutral-800">
            {t('aiInstructions.preview.failClosedTitle')}
          </div>
          <p dir="auto" className="mt-[5px] text-[12px] text-neutral-700">
            {result.error}
          </p>
          <p className="mt-[6px] text-[11.5px] text-text-faint">
            {t('aiInstructions.preview.failClosedHint')}
          </p>
        </div>
      )}
    </section>
  );
}
