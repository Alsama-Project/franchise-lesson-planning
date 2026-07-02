'use client';

// The upload modal (also reused for editing). A resource is backed by either an
// uploaded file or an external link. The teacher sets ONE thing by hand — the
// Year — and everything else is auto-attributed: the Format is derived from the
// file extension (or pasted link), the Subject from the bank's context, and the
// Title is pre-filled from a cleaned filename (still editable). Uploaded-by,
// popularity and the NEW badge are set server-side. Save is gated only on:
// a file/link present + a title + a year.

import { useMemo, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import {
  MAX_RESOURCE_BYTES,
  MAX_RESOURCE_MB,
  RESOURCE_BUCKET,
  buildResourceStoragePath,
} from '@/lib/resources/storage';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import {
  YEAR_OPTIONS,
  cleanFileNameToTitle,
  formatLabelForFileName,
  formatLabelForUrl,
} from '@/components/resources/config';
import { CheckIcon, LinkIcon, LockIcon, XIcon } from '@/components/resources/icons';

interface UploadModalProps {
  mode: 'create' | 'edit';
  /** The signed-in user's id — keys the direct-upload object path. */
  currentUserId: string;
  /** The bank's subject scope — auto-attributed to new uploads. */
  defaultSubjectId: string | null;
  vocabulary: TagsByDimension;
  existing?: ResourceWithTags;
  onClose: () => void;
  onSubmitCreate: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  onSubmitEdit: (
    id: string,
    input: {
      title: string;
      description: string | null;
      subjectId: string | null;
      year: number | null;
      tagIds: string[];
    }
  ) => Promise<{ ok: boolean; error?: string }>;
}

/** A labelled native select styled to flag required-but-unset (pink) vs set (teal). */
function TagSelect({
  label,
  required,
  value,
  options,
  onChange,
}: {
  label: string;
  required: boolean;
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const t = useTranslations('resources');
  const unset = required && !value;
  return (
    <div>
      <div className="mb-[5px] text-[11px] font-semibold text-text-muted">
        {label} {required ? <span className="text-[#B5566A]">*</span> : null}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-[9px] border bg-white px-[11px] py-[9px] text-[13px] outline-none ${
          unset ? 'border-[1.4px] border-[#E7C3CB] bg-[#FDF7F8] text-[#B08A92]' : 'border-[#CFE6E0] text-ink'
        }`}
      >
        <option value="">{t('upload.choose')}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function UploadModal({
  mode,
  currentUserId,
  defaultSubjectId,
  vocabulary,
  existing,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: UploadModalProps) {
  const t = useTranslations('resources');
  const locale = useLocale();
  const isEdit = mode === 'edit';

  const [sourceMode, setSourceMode] = useState<'file' | 'link'>(
    existing?.external_url ? 'link' : 'file'
  );
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState(existing?.external_url ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [year, setYear] = useState<string>(existing?.year != null ? String(existing.year) : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Subject is auto-attributed from context: an existing resource keeps its own
  // subject; a new upload inherits the bank's subject scope. If neither is known
  // we can't infer it — save is blocked rather than silently dropping it.
  const inferredSubjectId = (isEdit ? existing?.subject_id : null) ?? defaultSubjectId ?? null;
  const canInferSubject = !!inferredSubjectId;

  // Format is auto-attributed too — derived from the file extension or the pasted
  // link — and shown read-only. On edit the source is fixed, so we surface the
  // format already attached to the resource.
  const derivedFormatLabel = useMemo<string | null>(() => {
    if (isEdit) return existing?.tags.find((tag) => tag.dimension === 'format')?.label ?? null;
    if (sourceMode === 'file') return file ? formatLabelForFileName(file.name) : null;
    return link.trim() ? formatLabelForUrl(link.trim()) : null;
  }, [isEdit, existing, sourceMode, file, link]);

  // The tag id for the derived format label (null if the vocabulary has no such
  // tag, e.g. an unrecognised extension) — the only tag a new upload attaches.
  const formatTagId = useMemo<string | null>(() => {
    if (!derivedFormatLabel) return null;
    return (vocabulary.format ?? []).find((tag) => tag.label === derivedFormatLabel)?.id ?? null;
  }, [derivedFormatLabel, vocabulary]);

  const sourceReady = isEdit || (sourceMode === 'file' ? !!file : link.trim().length > 0);

  // Reduced required set: file/link + title + year. Progress counts these three.
  const total = 3;
  const setCount = (sourceReady ? 1 : 0) + (title.trim() ? 1 : 0) + (year ? 1 : 0);
  const remaining = total - setCount;
  const complete = remaining === 0 && canInferSubject;

  function chosenTagIds(): string[] {
    // Edit keeps the resource's existing tags untouched (the modal no longer edits
    // them); create attaches only the auto-derived format tag, when recognised.
    if (isEdit && existing) return existing.tags.map((tag) => tag.id);
    return formatTagId ? [formatTagId] : [];
  }

  function handleFile(f: File | null) {
    setFile(f);
    // Pre-fill (don't lock) the title from a cleaned filename, keeping any edit.
    if (f && !title.trim()) setTitle(cleanFileNameToTitle(f.name));
  }

  function submit() {
    setError(null);
    if (!complete) return;

    if (isEdit && existing) {
      startTransition(async () => {
        const res = await onSubmitEdit(existing.id, {
          title: title.trim(),
          description: description.trim() || null,
          subjectId: inferredSubjectId,
          year: year ? Number(year) : null,
          tagIds: chosenTagIds(),
        });
        if (res.ok) onClose();
        else setError(res.error ?? t('upload.saveChangesError'));
      });
      return;
    }

    // Graceful pre-flight guard: reject an oversized file inline BEFORE any
    // upload, so a too-large file surfaces a message instead of failing the
    // upload round-trip or collapsing the page.
    if (sourceMode === 'file' && file && file.size > MAX_RESOURCE_BYTES) {
      setError(t('upload.tooLarge', { max: formatNumber(MAX_RESOURCE_MB, locale) }));
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('title', title.trim());
      if (description.trim()) fd.set('description', description.trim());
      if (inferredSubjectId) fd.set('subjectId', inferredSubjectId);
      if (year) fd.set('year', year);
      for (const id of chosenTagIds()) fd.append('tagIds', id);

      if (sourceMode === 'file' && file) {
        // Upload the bytes DIRECTLY to Storage (the browser talks to Supabase,
        // not the Next server) and send only the resulting object path to the
        // create action — so the upload isn't bounded by the Server Action body
        // limit, and a storage failure is caught and shown inline.
        const supabase = createClient();
        const path = buildResourceStoragePath(currentUserId, file.name);
        const { error: uploadError } = await supabase.storage
          .from(RESOURCE_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) {
          setError(uploadError.message || t('upload.uploadError'));
          return;
        }
        fd.set('filePath', path);
      } else if (sourceMode === 'link' && link.trim()) {
        fd.set('externalUrl', link.trim());
      }

      const res = await onSubmitCreate(fd);
      if (res.ok) onClose();
      else setError(res.error ?? t('upload.uploadError'));
    });
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(42,36,34,0.5)] p-7"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? t('upload.editTitle') : t('upload.createTitle')}
        className="max-h-[88vh] w-[660px] max-w-full overflow-auto rounded-[18px] bg-surface shadow-card"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#EFE8DD] bg-surface px-[22px] py-[18px]">
          <div>
            <div className="text-[16px] font-semibold text-ink">
              {isEdit ? t('upload.editTitle') : t('upload.createTitle')}
            </div>
            <div className="mt-0.5 text-[12px] text-text-muted">
              {isEdit ? t('upload.editSubtitle') : t('upload.createSubtitle')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('upload.close')}
            className="ms-auto inline-flex size-[30px] items-center justify-center rounded-[8px] border border-border text-neutral-600"
          >
            <XIcon size={15} />
          </button>
        </div>

        <div className="px-[22px] py-5">
          {/* Source: file or link (create only) */}
          {!isEdit ? (
            <>
              {sourceMode === 'file' ? (
                <label className="mb-[6px] flex cursor-pointer items-center gap-[13px] rounded-[12px] border border-[#CFE6E0] bg-[#F4FAF8] px-[15px] py-[13px]">
                  <span className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#FBEFF3] text-[10px] font-bold text-pink">
                    FILE
                  </span>
                  <div className="min-w-0 flex-1">
                    <div dir="auto" className="truncate text-[13.5px] font-semibold text-ink">
                      {file ? file.name : t('upload.chooseFile')}
                    </div>
                    <div className="text-[11.5px] text-text-muted">
                      {file
                        ? t('upload.fileReady', { size: formatNumber(Math.max(1, Math.round(file.size / 1024)), locale) })
                        : t('upload.fileTypes')}
                    </div>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="text-[12px] font-semibold text-teal">{t('upload.browse')}</span>
                </label>
              ) : (
                <div className="mb-[6px] flex items-center gap-[13px] rounded-[12px] border border-[#CFE6E0] bg-[#F4FAF8] px-[15px] py-[13px]">
                  <span className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#E2F0E8] text-[#2E7D5B]">
                    <LinkIcon size={18} />
                  </span>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder={t('upload.linkPlaceholder')}
                    dir="auto"
                    className="min-w-0 flex-1 rounded-[8px] border border-border-strong bg-white px-3 py-2 text-[13px] outline-none"
                  />
                </div>
              )}
              <div className="mb-[18px] text-center text-[11.5px] text-text-faint">
                {sourceMode === 'file' ? (
                  t.rich('upload.orInstead', {
                    action: (chunks) => (
                      <button
                        type="button"
                        onClick={() => setSourceMode('link')}
                        className="font-semibold text-teal"
                      >
                        {chunks}
                      </button>
                    ),
                    label: t('upload.pasteLink'),
                  })
                ) : (
                  t.rich('upload.orInstead', {
                    action: (chunks) => (
                      <button
                        type="button"
                        onClick={() => setSourceMode('file')}
                        className="font-semibold text-teal"
                      >
                        {chunks}
                      </button>
                    ),
                    label: t('upload.uploadFile'),
                  })
                )}
              </div>
            </>
          ) : null}

          {/* Title + description */}
          <div className="mb-3 grid grid-cols-1 gap-3">
            <div>
              <div className="mb-[5px] text-[11px] font-semibold text-text-muted">
                {t('upload.title')} <span className="text-[#B5566A]">*</span>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('upload.titlePlaceholder')}
                dir="auto"
                className="w-full rounded-[9px] border border-border-strong bg-white px-[11px] py-[9px] text-[13px] outline-none focus:border-teal"
              />
            </div>
            <div>
              <div className="mb-[5px] text-[11px] font-semibold text-text-muted">{t('upload.description')}</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder={t('upload.descriptionPlaceholder')}
                dir="auto"
                className="w-full resize-none rounded-[9px] border border-border-strong bg-white px-[11px] py-[9px] text-[13px] outline-none focus:border-teal"
              />
            </div>
          </div>

          {/* The one manual field is Year (pink); format & subject are auto. */}
          <div className="mb-[11px] flex items-center justify-between">
            <div className="text-[13px] text-text-muted">{t('upload.detailsHint')}</div>
            <span
              className={`rounded-full px-[10px] py-[3px] text-[11px] font-semibold ${
                complete ? 'bg-[#E2F0E8] text-[#2E7D5B]' : 'bg-[#F6ECDA] text-[#B0651E]'
              }`}
            >
              {t('upload.progress', {
                set: formatNumber(setCount, locale),
                total: formatNumber(total, locale),
              })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-[10px]">
            <TagSelect
              label={t('upload.year')}
              required
              value={year}
              options={YEAR_OPTIONS.map((y) => ({ id: String(y), label: t('sidebar.yearOption', { year: y }) }))}
              onChange={setYear}
            />
            {/* Format: auto-detected, read-only. */}
            <div>
              <div className="mb-[5px] text-[11px] font-semibold text-text-muted">{t('upload.format')}</div>
              <div className="flex w-full items-center gap-2 rounded-[9px] border border-[#CFE6E0] bg-[#F4FAF8] px-[11px] py-[9px] text-[13px] text-ink">
                {derivedFormatLabel ? (
                  <>
                    <span className="font-medium">{derivedFormatLabel}</span>
                    <span className="text-[11px] text-text-faint">· {t('upload.autoDetected')}</span>
                  </>
                ) : (
                  <span className="text-text-faint">{t('upload.formatPending')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-[14px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-text-muted">
            <LockIcon size={13} className="text-text-faint" />
            {t('upload.setAutomatically')} <b className="text-neutral-800">{t('upload.format')}</b> ·{' '}
            <b className="text-neutral-800">{t('upload.subject')}</b> · <b className="text-neutral-800">{t('upload.uploadedBy')}</b> ·{' '}
            <b className="text-neutral-800">{t('upload.popularity')}</b> · <b className="text-neutral-800">{t('upload.newBadge')}</b>
          </div>

          {error ? (
            <div className="mt-3 rounded-[9px] bg-[#F7E4EB] px-3 py-2 text-[12px] font-medium text-[#B62A5C]">
              {error}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-[#EFE8DD] bg-surface px-[22px] py-[15px]">
          <span className="text-[12px] font-medium text-[#B5566A]">
            {!canInferSubject
              ? t('upload.subjectMissing')
              : complete
                ? t('upload.readyToSave')
                : t('upload.setMoreToSave', { remaining, remainingText: formatNumber(remaining, locale) })}
          </span>
          <div className="ms-auto flex gap-[9px]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[9px] border border-border-strong bg-white px-4 py-[9px] text-[13px] font-medium text-neutral-900 hover:bg-surface-subtle"
            >
              {t('upload.cancel')}
            </button>
            <button
              type="button"
              disabled={!complete || pending}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-[9px] bg-teal px-[18px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#1a6a5d] disabled:cursor-not-allowed disabled:bg-[#BFD6D0]"
            >
              {complete ? <CheckIcon size={14} /> : null}
              {isEdit ? t('upload.saveChanges') : t('upload.saveToBank')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
