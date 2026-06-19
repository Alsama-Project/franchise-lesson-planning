'use client';

// The upload modal (also reused for editing). A resource is backed by either an
// uploaded file or an external link, and EVERY applicable tag must be set before
// it can be saved: subject, year, and one tag per applicable dimension (format,
// theme, exercise type, lesson stage, localisation, plus the subject-specific
// skill type & grammar content once a subject is chosen). A progress chip shows
// "X of N set" and Save stays disabled until complete.
//
// "Applicable" means a dimension that actually has vocabulary to choose from:
// the coordinator-managed vocabulary seeds theme/grammar empty, so those only
// become required once a coordinator has added tags. Uploaded-by, popularity and
// the NEW badge are set automatically server-side and never appear here.

import { useMemo, useState, useTransition } from 'react';
import type { ResourceWithTags, TagDimension, TagsByDimension } from '@/types/resource';
import {
  DIMENSION_LABEL,
  SUBJECT_SPECIFIC_DIMENSIONS,
  UPLOAD_GLOBAL_DIMENSIONS,
  YEAR_OPTIONS,
} from '@/components/resources/config';
import { CheckIcon, LinkIcon, LockIcon, SparkleIcon, XIcon } from '@/components/resources/icons';

interface UploadModalProps {
  mode: 'create' | 'edit';
  subjects: { id: string; name: string }[];
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
        <option value="">Choose…</option>
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
  subjects,
  defaultSubjectId,
  vocabulary,
  existing,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: UploadModalProps) {
  const isEdit = mode === 'edit';

  // Seed tag selections from the existing resource (one per dimension) in edit mode.
  const initialTagByDim = useMemo(() => {
    const map: Partial<Record<TagDimension, string>> = {};
    if (existing) {
      for (const tag of existing.tags) {
        if (!map[tag.dimension]) map[tag.dimension] = tag.id;
      }
    }
    return map;
  }, [existing]);

  const [sourceMode, setSourceMode] = useState<'file' | 'link'>(
    existing?.external_url ? 'link' : 'file'
  );
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState(existing?.external_url ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [subjectId, setSubjectId] = useState(existing?.subject_id ?? defaultSubjectId ?? '');
  const [year, setYear] = useState<string>(existing?.year != null ? String(existing.year) : '');
  const [tagByDim, setTagByDim] = useState<Partial<Record<TagDimension, string>>>(initialTagByDim);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subjectChosen = !!subjectId;

  // Which dimensions are applicable (have vocabulary to pick from)?
  const applicableGlobal = UPLOAD_GLOBAL_DIMENSIONS.filter((d) => (vocabulary[d]?.length ?? 0) > 0);
  const applicableSubject = subjectChosen
    ? SUBJECT_SPECIFIC_DIMENSIONS.filter((d) => (vocabulary[d]?.length ?? 0) > 0)
    : [];
  const requiredDims = [...applicableGlobal, ...applicableSubject];

  // Progress: subject + year + one tag per applicable dimension.
  const total = 2 + requiredDims.length;
  const setCount =
    (subjectChosen ? 1 : 0) +
    (year ? 1 : 0) +
    requiredDims.filter((d) => !!tagByDim[d]).length;
  const remaining = total - setCount;

  const sourceReady = isEdit || (sourceMode === 'file' ? !!file : link.trim().length > 0);
  const complete = remaining === 0 && !!title.trim() && sourceReady;

  function setDim(dim: TagDimension, value: string) {
    setTagByDim((prev) => ({ ...prev, [dim]: value }));
  }

  function chosenTagIds(): string[] {
    return requiredDims.map((d) => tagByDim[d]).filter((v): v is string => !!v);
  }

  function handleFile(f: File | null) {
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  function submit() {
    setError(null);
    if (!complete) return;

    if (isEdit && existing) {
      startTransition(async () => {
        const res = await onSubmitEdit(existing.id, {
          title: title.trim(),
          description: description.trim() || null,
          subjectId: subjectId || null,
          year: year ? Number(year) : null,
          tagIds: chosenTagIds(),
        });
        if (res.ok) onClose();
        else setError(res.error ?? 'Could not save changes.');
      });
      return;
    }

    const fd = new FormData();
    fd.set('title', title.trim());
    if (description.trim()) fd.set('description', description.trim());
    if (subjectId) fd.set('subjectId', subjectId);
    if (year) fd.set('year', year);
    if (sourceMode === 'file' && file) fd.set('file', file);
    if (sourceMode === 'link' && link.trim()) fd.set('externalUrl', link.trim());
    for (const id of chosenTagIds()) fd.append('tagIds', id);

    startTransition(async () => {
      const res = await onSubmitCreate(fd);
      if (res.ok) onClose();
      else setError(res.error ?? 'Could not upload the resource.');
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
        aria-label={isEdit ? 'Edit resource' : 'Upload to the resource bank'}
        className="max-h-[88vh] w-[660px] max-w-full overflow-auto rounded-[18px] bg-surface shadow-card"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#EFE8DD] bg-surface px-[22px] py-[18px]">
          <div>
            <div className="text-[16px] font-semibold text-ink">
              {isEdit ? 'Edit resource' : 'Upload to the resource bank'}
            </div>
            <div className="mt-0.5 text-[12px] text-text-muted">
              {isEdit
                ? 'Update its details and tags.'
                : 'It goes straight into the shared bank for everyone.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto inline-flex size-[30px] items-center justify-center rounded-[8px] border border-border text-neutral-600"
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
                    <div className="truncate text-[13.5px] font-semibold text-ink">
                      {file ? file.name : 'Choose a file to upload'}
                    </div>
                    <div className="text-[11.5px] text-text-muted">
                      {file
                        ? `${Math.max(1, Math.round(file.size / 1024))} KB · ready to upload`
                        : 'PDF, Word, image, audio or video'}
                    </div>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="text-[12px] font-semibold text-teal">Browse</span>
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
                    placeholder="https://…"
                    className="min-w-0 flex-1 rounded-[8px] border border-border-strong bg-white px-3 py-2 text-[13px] outline-none"
                  />
                </div>
              )}
              <div className="mb-[18px] text-center text-[11.5px] text-text-faint">
                {sourceMode === 'file' ? (
                  <>
                    or{' '}
                    <button
                      type="button"
                      onClick={() => setSourceMode('link')}
                      className="font-semibold text-teal"
                    >
                      paste a link
                    </button>{' '}
                    instead
                  </>
                ) : (
                  <>
                    or{' '}
                    <button
                      type="button"
                      onClick={() => setSourceMode('file')}
                      className="font-semibold text-teal"
                    >
                      upload a file
                    </button>{' '}
                    instead
                  </>
                )}
              </div>
            </>
          ) : null}

          {/* Title + description */}
          <div className="mb-3 grid grid-cols-1 gap-3">
            <div>
              <div className="mb-[5px] text-[11px] font-semibold text-text-muted">
                Title <span className="text-[#B5566A]">*</span>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Family vocabulary flashcards"
                className="w-full rounded-[9px] border border-border-strong bg-white px-[11px] py-[9px] text-[13px] outline-none focus:border-teal"
              />
            </div>
            <div>
              <div className="mb-[5px] text-[11px] font-semibold text-text-muted">Description</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional — a line on what this is and how to use it."
                className="w-full resize-none rounded-[9px] border border-border-strong bg-white px-[11px] py-[9px] text-[13px] outline-none focus:border-teal"
              />
            </div>
          </div>

          {/* Tag-it header + progress */}
          <div className="mb-[11px] flex items-center justify-between">
            <div className="text-[13px] font-semibold text-ink">
              Tag it <span className="font-normal text-text-faint">— every tag is required</span>
            </div>
            <span
              className={`rounded-full px-[10px] py-[3px] text-[11px] font-semibold ${
                complete ? 'bg-[#E2F0E8] text-[#2E7D5B]' : 'bg-[#F6ECDA] text-[#B0651E]'
              }`}
            >
              {setCount} of {total} set
            </span>
          </div>

          <div className="grid grid-cols-2 gap-[10px]">
            <TagSelect
              label="Subject"
              required
              value={subjectId}
              options={subjects.map((s) => ({ id: s.id, label: s.name }))}
              onChange={setSubjectId}
            />
            <TagSelect
              label="Year"
              required
              value={year}
              options={YEAR_OPTIONS.map((y) => ({ id: String(y), label: `Year ${y}` }))}
              onChange={setYear}
            />
            {applicableGlobal.map((dim) => (
              <div key={dim} className={dim === 'localisation' ? 'col-span-2' : undefined}>
                <TagSelect
                  label={DIMENSION_LABEL[dim]}
                  required
                  value={tagByDim[dim] ?? ''}
                  options={(vocabulary[dim] ?? []).map((t) => ({ id: t.id, label: t.label }))}
                  onChange={(v) => setDim(dim, v)}
                />
              </div>
            ))}
          </div>

          {/* Subject-specific group */}
          {subjectChosen && applicableSubject.length > 0 ? (
            <div className="mt-3 rounded-[12px] border border-[#D2E7E1] bg-[#F1F8F6] p-[13px]">
              <div className="mb-[10px] flex items-center gap-[7px]">
                <SparkleIcon size={13} className="text-teal" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-teal">
                  {subjects.find((s) => s.id === subjectId)?.name ?? 'Subject'}-specific tags
                </span>
                <span className="text-[10.5px] text-[#6E9890]">— shown because a subject is chosen</span>
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                {applicableSubject.map((dim) => (
                  <TagSelect
                    key={dim}
                    label={DIMENSION_LABEL[dim]}
                    required
                    value={tagByDim[dim] ?? ''}
                    options={(vocabulary[dim] ?? []).map((t) => ({ id: t.id, label: t.label }))}
                    onChange={(v) => setDim(dim, v)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-[14px] flex items-center gap-2 text-[11.5px] text-text-muted">
            <LockIcon size={13} className="text-text-faint" />
            Set automatically: <b className="text-neutral-800">Uploaded by</b> ·{' '}
            <b className="text-neutral-800">Popularity</b> · <b className="text-neutral-800">New badge</b>
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
            {complete
              ? 'Ready to save'
              : remaining > 0
                ? `Set ${remaining} more ${remaining === 1 ? 'thing' : 'things'} to save`
                : !title.trim()
                  ? 'Add a title to save'
                  : 'Attach a file or link to save'}
          </span>
          <div className="ml-auto flex gap-[9px]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[9px] border border-border-strong bg-white px-4 py-[9px] text-[13px] font-medium text-neutral-900 hover:bg-surface-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!complete || pending}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-[9px] bg-teal px-[18px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#1a6a5d] disabled:cursor-not-allowed disabled:bg-[#BFD6D0]"
            >
              {complete ? <CheckIcon size={14} /> : null}
              {isEdit ? 'Save changes' : 'Save to bank'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
