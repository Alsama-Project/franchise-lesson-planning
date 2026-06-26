'use client';

// The resource preview popup: a format hero, usage, the full tag detail grid,
// and the primary actions — "Add to a lesson" (records a use, which feeds
// popularity + the user's Most used) and "Save to a folder" (a quick folder
// picker). It also offers Open/Download (signed URL for files, the link for
// URL-backed resources) and, when the viewer may edit, an edit shortcut.

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatNumber } from '@/lib/format';
import type { Folder, ResourceWithTags } from '@/types/resource';
import { resourceView } from '@/components/resources/presentation';
import { previewKind, previewSrc } from '@/components/resources/preview';
import { DownloadIcon, EyeIcon, LinkIcon, PlusIcon, XIcon, EditIcon } from '@/components/resources/icons';

interface PreviewModalProps {
  resource: ResourceWithTags;
  subjectName?: string;
  canEdit: boolean;
  isYours: boolean;
  folders: Folder[];
  onClose: () => void;
  /** Open the draft-lesson picker for this resource (handled by the parent). */
  onAddToLesson: (resource: ResourceWithTags) => void;
  onSaveToFolder: (resource: ResourceWithTags, folderId: string) => Promise<boolean>;
  onEdit: (resource: ResourceWithTags) => void;
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-faint">{k}</div>
      <div dir="auto" className="text-[13.5px] text-ink">{v}</div>
    </div>
  );
}

export function PreviewModal({
  resource,
  subjectName,
  canEdit,
  isYours,
  folders,
  onClose,
  onAddToLesson,
  onSaveToFolder,
  onEdit,
}: PreviewModalProps) {
  const t = useTranslations('resources');
  const locale = useLocale();
  const v = resourceView(resource);
  // Inline preview in the hero: the full image, or the PDF rendered natively in
  // an iframe; falls back to the flat coloured hero on a non-previewable format
  // or a load error.
  const kind = previewKind(resource);
  const [previewFailed, setPreviewFailed] = useState(false);
  const showPreview = kind !== null && !previewFailed;
  const src = previewSrc(resource);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isLink = !!resource.external_url;
  // Server-side route that mints a short-lived signed URL and redirects to it.
  // Plain anchors (not async window.open) keep these in the click gesture so the
  // browser doesn't block the new tab / download.
  const fileHref = `/api/resources/${resource.id}/file`;

  const details: { k: string; v: string }[] = [];
  if (v.formatLabel) details.push({ k: t('preview.detailFormat'), v: v.formatLabel });
  if (resource.year != null)
    details.push({ k: t('preview.detailYear'), v: t('preview.yearValue', { year: formatNumber(resource.year, locale) }) });
  if (subjectName) details.push({ k: t('preview.detailSubject'), v: subjectName });
  if (v.skill) details.push({ k: t('dimensions.skill_type'), v: v.skill });
  if (v.theme) details.push({ k: t('dimensions.theme'), v: v.theme });
  if (v.exercise) details.push({ k: t('dimensions.exercise_type'), v: v.exercise });
  if (v.stage) details.push({ k: t('dimensions.lesson_stage'), v: v.stage });
  if (v.localisation) details.push({ k: t('dimensions.localisation'), v: v.localisation });
  if (v.grammar) details.push({ k: t('dimensions.grammar_content'), v: v.grammar });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(42,36,34,0.5)] p-7"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={resource.title}
        className="max-h-[88vh] w-[540px] max-w-full overflow-auto rounded-[18px] bg-surface shadow-card"
      >
        {/* Hero — a real inline preview when available, otherwise the flat
            format-coloured banner. */}
        <div
          className={`relative flex items-center justify-center ${showPreview ? 'min-h-[150px]' : 'h-[150px]'}`}
          style={{ background: showPreview ? '#2A2422' : v.fmtBg }}
        >
          {showPreview && kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={resource.title}
              className="max-h-[60vh] w-full object-contain"
              onError={() => setPreviewFailed(true)}
            />
          ) : showPreview && kind === 'pdf' ? (
            <iframe
              src={src}
              title={t('preview.previewOf', { title: resource.title })}
              className="h-[60vh] w-full border-0 bg-white"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <span className="text-[20px] font-bold tracking-[0.04em]" style={{ color: v.fmtColor }}>
              {v.formatShort}
            </span>
          )}

          {v.isNew ? (
            <span className="absolute start-[14px] top-[14px] z-10 rounded-badge bg-pink px-[9px] py-[3px] text-[10px] font-bold tracking-[0.04em] text-white">
              {t('preview.new')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('preview.close')}
            className="absolute end-3 top-3 z-10 inline-flex size-[30px] items-center justify-center rounded-[8px] bg-white/85 text-neutral-800"
          >
            <XIcon size={15} />
          </button>
        </div>

        <div className="p-[22px] pt-5">
          <div dir="auto" className="text-[19px] font-semibold leading-[1.25] text-ink">{resource.title}</div>
          {resource.description ? (
            <p dir="auto" className="mt-2 text-[13px] leading-[1.5] text-text-muted">{resource.description}</p>
          ) : null}

          <div className="mt-[9px] inline-flex items-center gap-[6px] rounded-full bg-[#F6ECDA] px-[11px] py-1 text-[12.5px] font-semibold text-[#B0651E]">
            {t('preview.usedInLessons', { count: formatNumber(resource.usage_count, locale) })}
          </div>

          {details.length > 0 ? (
            <div className="mt-[18px] grid grid-cols-2 gap-x-5 gap-y-[13px] border-t border-[#EFE8DD] pt-4">
              {details.map((d) => (
                <Detail key={d.k} k={d.k} v={d.v} />
              ))}
            </div>
          ) : null}

          {isYours ? (
            <div className="mt-4">
              <span className="rounded-badge bg-[#E4F0ED] px-[10px] py-1 text-[11px] font-semibold text-[#186155]">
                {t('preview.yourUploadNote')}
              </span>
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-[9px] bg-[#E2F0E8] px-3 py-2 text-[12px] font-medium text-[#2E7D5B]">
              {message}
            </div>
          ) : null}

          {/* Folder picker */}
          {folderPickerOpen ? (
            <div className="mt-4 rounded-[12px] border border-border bg-surface-subtle p-3">
              <div className="mb-2 text-[12px] font-semibold text-neutral-800">{t('preview.saveToWhichFolder')}</div>
              {folders.length === 0 ? (
                <div className="text-[12px] text-text-faint">
                  {t('preview.noFoldersYet')}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const ok = await onSaveToFolder(resource, f.id);
                          if (ok) {
                            setMessage(t('preview.savedToFolder', { name: f.name }));
                            setFolderPickerOpen(false);
                          }
                        })
                      }
                      className="flex items-center gap-2 rounded-[8px] px-2 py-[6px] text-start text-[12.5px] text-neutral-800 hover:bg-white disabled:opacity-50"
                    >
                      <span className="size-[10px] rounded-[3px] bg-pink" />
                      <span dir="auto">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-5 flex flex-wrap gap-[9px]">
            <button
              type="button"
              onClick={() => onAddToLesson(resource)}
              className="inline-flex flex-1 items-center justify-center gap-[7px] rounded-[10px] bg-teal px-3 py-[11px] text-[13.5px] font-semibold text-white hover:bg-[#1a6a5d] disabled:opacity-60"
            >
              <PlusIcon size={15} strokeWidth={2.2} /> {t('preview.addToLesson')}
            </button>
            <button
              type="button"
              onClick={() => setFolderPickerOpen((o) => !o)}
              className="rounded-[10px] border border-border-strong bg-white px-[15px] py-[11px] text-[13.5px] font-medium text-neutral-900 hover:bg-surface-subtle"
            >
              {t('preview.saveToFolder')}
            </button>
            {isLink ? (
              <a
                href={resource.external_url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('preview.openLink')}
                className="inline-flex items-center justify-center rounded-[10px] border border-border-strong bg-white px-3 py-[11px] text-neutral-800 hover:bg-surface-subtle"
              >
                <LinkIcon size={15} />
              </a>
            ) : (
              <>
                <a
                  href={fileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('preview.previewFile')}
                  className="inline-flex items-center justify-center gap-[7px] rounded-[10px] border border-border-strong bg-white px-[15px] py-[11px] text-[13.5px] font-medium text-neutral-900 hover:bg-surface-subtle"
                >
                  <EyeIcon size={15} /> {t('preview.preview')}
                </a>
                <a
                  href={`${fileHref}?download=1`}
                  aria-label={t('preview.downloadFile')}
                  className="inline-flex items-center justify-center rounded-[10px] border border-border-strong bg-white px-3 py-[11px] text-neutral-800 hover:bg-surface-subtle"
                >
                  <DownloadIcon size={15} />
                </a>
              </>
            )}
            {canEdit ? (
              <button
                type="button"
                onClick={() => onEdit(resource)}
                aria-label={t('preview.editResource')}
                className="inline-flex w-[46px] items-center justify-center rounded-[10px] border border-border-strong bg-white text-[#7A6E62] hover:bg-surface-subtle"
              >
                <EditIcon size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
