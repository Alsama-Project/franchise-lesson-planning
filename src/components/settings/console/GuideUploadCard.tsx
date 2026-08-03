'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/format';
import { ErrorText, GhostButton, SectionCard } from './ui';
import { Stat, UploadProgressBar, UploadStatusBadge, hhmm, timeAgo } from './upload';

/** The active guide version this card displays — filename (when captured) + date. */
export interface GuideVersionInfo {
  /** Original uploaded filename, or null on versions predating capture (0021). */
  originalFilename: string | null;
  /** Upload timestamp (`created_at`). */
  createdAt: string;
  /** True when a retained original file (Branch 2a) is downloadable; false for
   *  versions predating retention, which download as derived `.md`. */
  hasStoredOriginal: boolean;
}

/**
 * The shared admin guidance-upload card — used by both the AI resource guide and
 * the SMARTT objective guide. Visually and behaviourally consistent with the
 * curriculum upload card: a {@link SectionCard} with a header status pill, a
 * stat row (the active document + its upload date), a teal "Upload" action, and a
 * single status element beneath (an indeterminate progress bar while uploading,
 * then a success or error line).
 *
 * No text preview is rendered — by design (Task 2). The stored guide `content` is
 * unchanged and still served to the AI backend through the security-definer read
 * function; this surface shows the original filename and the upload date only,
 * falling back to the date alone when the filename is null (legacy versions).
 *
 * The ingest path is untouched: each upload POSTs the file to `endpoint`
 * (.md/.txt verbatim, .docx → mammoth + turndown), which inserts a new immutable
 * version, then the page refreshes.
 */
export function GuideUploadCard({
  title,
  endpoint,
  active,
  successMessage,
  uploadingLabel,
}: {
  title: string;
  endpoint: string;
  active: GuideVersionInfo | null;
  /** Copy shown on the success line after an upload completes. */
  successMessage: string;
  /** Accessible label for the in-flight progress bar. */
  uploadingLabel: string;
}) {
  const router = useRouter();
  const t = useTranslations('settings');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  // Transient, in-session only: a just-uploaded success flag, or an upload error
  // with the moment it happened (for the "Upload failed · {HH:MM}" badge). Both
  // clear on the next upload; neither survives a reload (the card then re-derives
  // from the active version).
  const [justUploaded, setJustUploaded] = useState(false);
  const [error, setError] = useState<{ message: string; at: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(file: File) {
    setJustUploaded(false);
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, { method: 'POST', body: fd });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError({
            message: data?.error ?? t('guide.uploadFailed'),
            at: new Date().toISOString(),
          });
          return;
        }
        setJustUploaded(true);
        router.refresh();
      } catch {
        setError({ message: t('guide.uploadFailed'), at: new Date().toISOString() });
      }
    });
  }

  // ── Single header badge, derived with the curriculum card's precedence:
  // in-flight → transient result → the persisted active version. ──
  const badge = pending ? (
    <UploadStatusBadge tone="teal" label={t('guide.badge.uploading')} />
  ) : error ? (
    <UploadStatusBadge tone="red" label={t('guide.badge.failed', { time: hhmm(error.at) })} />
  ) : justUploaded ? (
    <UploadStatusBadge tone="teal" label={t('guide.badge.saved')} />
  ) : active ? (
    <UploadStatusBadge tone="teal" label={t('guide.badge.uploaded', { ago: timeAgo(active.createdAt, t) })} />
  ) : (
    <UploadStatusBadge tone="teal" label={t('guide.badge.none')} />
  );

  return (
    <SectionCard title={title} action={badge}>
      <div className="flex flex-wrap items-end justify-between gap-4 px-[18px] py-[16px]">
        <div className="flex min-w-0 flex-wrap gap-x-[28px] gap-y-2 text-[13px]">
          {active ? (
            <>
              {/* Filename is null on versions predating capture (0021) — fall back
                  to the date alone, never a broken/empty label. */}
              {active.originalFilename ? (
                <Stat
                  label={t('guide.document')}
                  value={<span dir="auto">{active.originalFilename}</span>}
                />
              ) : null}
              <Stat
                label={t('guide.uploaded')}
                value={formatDate(active.createdAt, locale, { month: 'short' })}
              />
            </>
          ) : (
            <p className="text-[13px] text-[#A79E94]">
              {t('guide.noGuide')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          {/* Download the guide currently in force. The label reflects what the
              user actually gets: the retained original file when one exists
              (Branch 2a), otherwise the derived current text (Branch 1 fallback). */}
          {active ? (
            <a
              href={endpoint}
              download
              className="text-[12.5px] font-semibold text-[#186155] transition-opacity hover:opacity-70"
            >
              {active.hasStoredOriginal ? t('guide.downloadOriginal') : t('guide.download')}
            </a>
          ) : null}
          <GhostButton tone="teal" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? t('guide.uploading') : t('guide.upload')}
          </GhostButton>
        </div>
      </div>

      {/* Exactly one status element below the stat row, driven by the state. */}
      {pending ? (
        <div className="px-[18px] pb-[16px]">
          <UploadProgressBar label={uploadingLabel} />
        </div>
      ) : justUploaded ? (
        <div className="px-[18px] pb-[14px]">
          <p className="text-[12.5px] font-medium text-[#186155]">{successMessage}</p>
        </div>
      ) : error ? (
        <div className="px-[18px] pb-[14px]">
          <ErrorText>{error.message}</ErrorText>
        </div>
      ) : null}
    </SectionCard>
  );
}
