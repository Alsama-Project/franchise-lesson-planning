'use client';

// Screen 3 — the document popup. Two panels per the mockup: the document's stored
// text (the admin's exact view of what this document contributes to the prompt,
// rendered verbatim — never summarised, truncated, or restyled) and the version
// history stacked beside it. Replace uploads a new active version; Restore
// reactivates an older one; Archive hands off to the parent's confirm dialog.

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { AiContextDocView } from '@/types/ai-context';
import { fullDate } from './helpers';
import { useDocUpload, useFilePicker } from './useDocUpload';
import { UploadProgressBar } from '../upload';

/** Ladder position for the layer badge — 1 org · 2 academic · 3 subject · 4 tool. */
const LAYER_RANK: Record<AiContextDocView['layer'], number> = {
  org: 1,
  academic: 2,
  subject: 3,
  tool: 4,
};

export function DocumentPopup({
  doc,
  layerLabel,
  groupLabel,
  onClose,
  onArchive,
}: {
  doc: AiContextDocView;
  /** e.g. "Tool instructions" — the layer's name. */
  layerLabel: string;
  /** e.g. "Worksheet builder" or "English"; null for org / academic layers. */
  groupLabel: string | null;
  onClose: () => void;
  onArchive: () => void;
}) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const router = useRouter();

  const { pending: replacing, error: replaceError, upload } = useDocUpload();
  const { input, open } = useFilePicker((file) =>
    upload(`/api/admin/context-docs/${doc.id}/versions`, file),
  );

  const [restoring, startRestore] = useTransition();
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function restore(versionId: string) {
    setRestoreError(null);
    startRestore(async () => {
      try {
        const res = await fetch(
          `/api/admin/context-docs/${doc.id}/versions/${versionId}/activate`,
          { method: 'POST' },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setRestoreError(data?.error ?? t('aiInstructions.upload.failed'));
          return;
        }
        router.refresh();
      } catch {
        setRestoreError(t('aiInstructions.upload.failed'));
      }
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const busy = replacing || restoring;
  const metaBits = [
    doc.originalFilename,
    `v${doc.activeVersion}`,
    doc.uploaderName,
    fullDate(doc.updatedAt, locale),
  ].filter(Boolean);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={doc.name}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 py-[34px]"
      style={{ background: 'rgba(42,36,34,0.45)' }}
    >
      {input}
      <div className="w-full max-w-[900px] overflow-hidden rounded-[14px] border border-border-strong bg-surface shadow-[0_22px_44px_-18px_rgba(42,30,22,0.45)]">
        {/* Header: identity + Replace / Archive / close */}
        <div className="flex items-start gap-[14px] border-b border-border-subtle px-[22px] pt-[20px] pb-[16px]">
          <div className="min-w-0 flex-1">
            <div className="mb-[7px] flex items-center gap-[9px]">
              <span className="inline-flex size-[20px] items-center justify-center rounded-full bg-teal text-[10px] font-bold text-white">
                {LAYER_RANK[doc.layer]}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-teal-deepest">
                {groupLabel ? `${layerLabel} · ${groupLabel}` : layerLabel}
              </span>
            </div>
            <div dir="auto" className="text-[18px] font-semibold text-ink">
              {doc.name}
            </div>
            <div dir="auto" className="mt-[6px] text-[12px] text-text-faint">
              {metaBits.join(' · ')}
            </div>
          </div>
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              onClick={open}
              disabled={busy}
              className="rounded-[9px] border border-teal-tint-border bg-surface px-[13px] py-[8px] text-[12.5px] font-semibold text-teal transition-colors hover:bg-teal-tint disabled:opacity-50"
            >
              {replacing ? t('aiInstructions.popup.replacing') : t('aiInstructions.popup.replace')}
            </button>
            <button
              type="button"
              onClick={onArchive}
              disabled={busy}
              className="rounded-[9px] border border-danger-border bg-surface px-[13px] py-[8px] text-[12.5px] font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
            >
              {t('aiInstructions.popup.archive')}
            </button>
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
        </div>

        {/* Body: text panel + version history */}
        <div className="flex flex-col items-stretch sm:flex-row">
          <div className="min-w-0 flex-1">
            {busy ? (
              <div className="px-[22px] pt-[16px]">
                <UploadProgressBar label={t('aiInstructions.popup.replacing')} />
              </div>
            ) : null}
            {replaceError || restoreError ? (
              <p className="mx-[22px] mt-[16px] rounded-[10px] border border-danger-border bg-danger-bg px-[12px] py-[8px] text-[12.5px] font-medium text-danger">
                {replaceError ?? restoreError}
              </p>
            ) : null}
            <div
              dir="auto"
              className="max-h-[420px] overflow-auto whitespace-pre-wrap px-[22px] pt-[18px] pb-[24px] font-mono text-[12px] leading-[1.8] text-neutral-900"
            >
              {doc.bodyMd}
            </div>
          </div>

          <div className="flex-none border-t border-border-subtle bg-surface-warm px-[16px] pt-[16px] pb-[20px] sm:w-[280px] sm:border-t-0 sm:border-l">
            <div className="mb-[12px] text-[11px] font-bold uppercase tracking-[0.1em] text-text-faint">
              {t('aiInstructions.popup.versionHistory')}
            </div>
            <div className="flex flex-col gap-[8px]">
              {doc.versions.map((v) => (
                <div
                  key={v.id}
                  className={
                    v.isActive
                      ? 'rounded-[10px] border border-teal-tint-border bg-surface px-[12px] py-[11px]'
                      : 'flex items-center gap-[10px] rounded-[10px] border border-border-subtle bg-surface px-[12px] py-[11px]'
                  }
                >
                  {v.isActive ? (
                    <>
                      <div className="flex items-center gap-[8px]">
                        <span className="text-[12.5px] font-bold text-ink">v{v.version}</span>
                        <span className="rounded-[5px] bg-teal-tint px-[7px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-teal-deep">
                          {t('aiInstructions.popup.inUse')}
                        </span>
                      </div>
                      <div dir="auto" className="mt-[6px] text-[11.5px] text-text-faint">
                        {[v.uploaderName, fullDate(v.createdAt, locale)].filter(Boolean).join(' · ')}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold text-ink">v{v.version}</div>
                        <div dir="auto" className="mt-[6px] text-[11.5px] text-text-faint">
                          {[v.uploaderName, fullDate(v.createdAt, locale)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => restore(v.id)}
                        disabled={busy}
                        className="rounded-[8px] border border-teal-tint-border bg-surface px-[11px] py-[7px] text-[12px] font-semibold text-teal transition-colors hover:bg-teal-tint disabled:opacity-50"
                      >
                        {t('aiInstructions.popup.restore')}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
