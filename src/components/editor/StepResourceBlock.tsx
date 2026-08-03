'use client';

// The teaching-step resource block, shared by New content and Independent
// practice. It shows the resources attached to the block (AttachedList) and two
// sibling add affordances:
//   • a DIRECT upload — drag a file onto the dashed drop-zone, or click to pick.
//     The bytes go straight to the private `resources` bucket (browser → Supabase,
//     like the resource-bank UploadModal — NOT through a Server Action body, and
//     NOT through uploadWorksheetImageAction, which embeds an expiring signed URL
//     in the worksheet doc). A `resources` row is created, scoped to the plan's
//     subject/year, and its id is attached to the block via `onAttach` (which also
//     caches it and records a usage). File-type + size validation reuse the same
//     rules as UploadModal (resource config + storage caps).
//   • "Add from bank" — opens the shared ResourceBankModal, unchanged.
//
// Both add paths funnel through `onAttach`, so `resourceIds`, the attach cache and
// usage tracking are handled identically to the existing bank flow.

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  MAX_RESOURCE_BYTES,
  MAX_RESOURCE_MB,
  RESOURCE_BUCKET,
  buildResourceStoragePath,
} from '@/lib/resources/storage';
import { createResourceAction, getResourcesByIdsAction } from '@/lib/actions/resources';
import { formatLabelForFileName, cleanFileNameToTitle } from '@/components/resources/config';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { AttachedList } from '@/components/editor/AttachedList';
import { ResourceBankModal } from '@/components/editor/worksheet/ResourceBankModal';
import type { WorksheetContext } from '@/components/editor/worksheet/context';

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4m0 0L7 9m5-5l5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function StepResourceBlock({
  attachedResources,
  onAttach,
  onRemove,
  worksheetContext,
  vocabulary,
  locked = false,
}: {
  attachedResources: ResourceWithTags[];
  /** Attach a resource to the block — appends its id, caches it, records a usage.
   *  Shared by the upload and the bank flows. */
  onAttach: (resource: ResourceWithTags) => void;
  onRemove: (resourceId: string) => void;
  /** Scopes the bank modal and the created resource row (subject/year). */
  worksheetContext: WorksheetContext;
  vocabulary: TagsByDimension;
  /** When true the plan is locked: the add controls are inert. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard');
  const [bankOpen, setBankOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploadError(null);
    // Reuse UploadModal's validation: format is derived from the extension (an
    // unknown extension has no matching format tag → reject), size is capped at
    // the shared storage limit.
    const formatLabel = formatLabelForFileName(file.name);
    if (!formatLabel) {
      setUploadError(t('resource.badType'));
      return;
    }
    if (file.size > MAX_RESOURCE_BYTES) {
      setUploadError(t('resource.tooLarge', { max: MAX_RESOURCE_MB }));
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUploadError(t('resource.uploadFailed'));
        return;
      }

      // Bytes go straight to Storage (RLS authorises on owner = auth.uid()).
      const path = buildResourceStoragePath(user.id, file.name);
      const { error: upErr } = await supabase.storage
        .from(RESOURCE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) {
        setUploadError(upErr.message || t('resource.uploadFailed'));
        return;
      }

      // Create the bank row scoped to the plan's subject/year (both nullable —
      // createResource accepts null and simply leaves the row unscoped).
      const fd = new FormData();
      fd.set('title', cleanFileNameToTitle(file.name));
      fd.set('filePath', path);
      if (worksheetContext.subjectId) fd.set('subjectId', worksheetContext.subjectId);
      if (worksheetContext.year != null) fd.set('year', String(worksheetContext.year));
      const formatTagId = (vocabulary.format ?? []).find((tag) => tag.label === formatLabel)?.id;
      if (formatTagId) fd.append('tagIds', formatTagId);

      const res = await createResourceAction(fd);
      if (!res.ok || !res.data) {
        setUploadError(res.error ?? t('resource.uploadFailed'));
        return;
      }

      // Resolve the created row (with tags) and attach it exactly like a bank pick.
      const [resource] = await getResourcesByIdsAction([res.data.id]);
      if (resource) onAttach(resource);
      else setUploadError(t('resource.uploadFailed'));
    } catch {
      setUploadError(t('resource.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  const disabled = locked || uploading;

  return (
    <div>
      <AttachedList
        resources={attachedResources}
        onRemove={onRemove}
        showEmptyState={false}
        downloadLabel={t('resource.downloadFile')}
      />

      <div className="mt-[10px] flex flex-col gap-[9px]">
        {/* Direct upload — the dashed drop-zone doubles as the click-to-pick target. */}
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-label={t('resource.upload')}
          onClick={() => {
            if (!disabled) inputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            if (disabled) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (disabled) return;
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={
            'flex cursor-pointer flex-col items-center gap-[5px] rounded-[10px] border border-dashed px-3 py-[16px] text-center transition-colors ' +
            (disabled ? 'cursor-not-allowed opacity-60 ' : '') +
            (dragOver
              ? 'border-teal bg-[#d8ebe6] text-teal'
              : 'border-teal-tint-border bg-teal-tint text-teal')
          }
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so re-picking the same file fires change again.
              e.target.value = '';
              if (file) void handleFile(file);
            }}
          />
          <span className="inline-flex items-center gap-[6px] text-[13px] font-semibold">
            <UploadIcon />
            {uploading ? t('resource.uploading') : t('resource.upload')}
          </span>
          <span className="text-[11.5px] font-medium text-[#4E8C81]">{t('resource.dropHint')}</span>
        </div>

        {uploadError ? (
          <div dir="auto" className="text-[12px] font-medium text-pink">
            {uploadError}
          </div>
        ) : null}

        {/* Add from bank — unchanged sibling affordance. */}
        <button
          type="button"
          onClick={() => setBankOpen(true)}
          className="inline-flex items-center gap-[6px] self-start rounded-[9px] border border-dashed border-teal-tint-border bg-teal-tint px-[12px] py-[8px] text-[13px] font-semibold text-teal hover:bg-[#d8ebe6]"
        >
          <PlusIcon />
          {t('teach.addFromBank')}
        </button>
      </div>

      {/* The bank picker only ever opens while the plan is unlocked (the button is
          disabled by the enclosing fieldset when locked). */}
      {bankOpen ? (
        <ResourceBankModal
          ctx={worksheetContext}
          vocabulary={vocabulary}
          onClose={() => setBankOpen(false)}
          onAdd={(resource) => {
            onAttach(resource);
            setBankOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
