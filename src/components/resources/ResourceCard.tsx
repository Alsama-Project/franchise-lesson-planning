'use client';

// A single resource card in the results grid: a tinted format thumbnail (with a
// NEW badge + usage count), title, tag chips, a meta line, and a permission-aware
// footer. Per the design, uploaded-by is never shown on the browse — only a
// "Your upload" chip and edit/delete controls appear, and only on resources the
// viewer may edit.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ResourceWithTags } from '@/types/resource';
import { resourceView } from '@/components/resources/presentation';
import { previewKind, previewSrc } from '@/components/resources/preview';
import { EditIcon, TrashIcon, TrendingUp } from '@/components/resources/icons';

// Client-only: pdfjs uses canvas + a Web Worker, so it must never render on the
// server. Loaded lazily so the renderer is fetched only for cards that need it.
const PdfThumbnail = dynamic(
  () => import('@/components/resources/PdfThumbnail').then((m) => m.PdfThumbnail),
  { ssr: false },
);

interface ResourceCardProps {
  resource: ResourceWithTags;
  /** May the viewer edit/delete this resource (uploader, or any if coordinator)? */
  canEdit: boolean;
  /** Did the viewer upload this resource? */
  isYours: boolean;
  onOpen: (resource: ResourceWithTags) => void;
  onEdit: (resource: ResourceWithTags) => void;
  onDelete: (resource: ResourceWithTags) => void;
}

export function ResourceCard({
  resource,
  canEdit,
  isYours,
  onOpen,
  onEdit,
  onDelete,
}: ResourceCardProps) {
  const v = resourceView(resource);

  // Inline preview: an image or first-page PDF thumbnail when previewable,
  // falling back to the flat format-coloured block on a non-previewable format
  // or any load/render error.
  const kind = previewKind(resource);
  const [previewFailed, setPreviewFailed] = useState(false);
  const showPreview = kind !== null && !previewFailed;

  return (
    <button
      type="button"
      onClick={() => onOpen(resource)}
      className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
    >
      {/* Format thumbnail — a real preview when one is available, otherwise the
          flat format-coloured block. Badges overlay either way. */}
      <div
        className="relative flex h-20 items-center justify-center overflow-hidden"
        style={{ background: v.fmtBg }}
      >
        {showPreview ? (
          <div className="absolute inset-0">
            {kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc(resource)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <PdfThumbnail
                src={previewSrc(resource)}
                onError={() => setPreviewFailed(true)}
              />
            )}
          </div>
        ) : null}

        {v.isNew ? (
          <span className="absolute left-2 top-2 z-10 rounded-badge bg-pink px-[7px] py-0.5 text-[9.5px] font-bold tracking-[0.04em] text-white">
            NEW
          </span>
        ) : null}
        <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-[3px] rounded-badge bg-white/80 px-[7px] py-0.5 text-[10px] font-semibold text-neutral-800">
          <TrendingUp size={11} style={{ color: '#B0651E' }} strokeWidth={2.2} />
          {resource.usage_count}
        </span>
        {!showPreview ? (
          <span
            className="text-[11px] font-bold tracking-[0.04em]"
            style={{ color: v.fmtColor }}
          >
            {v.formatShort}
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-[9px] p-[13px]">
        <div className="text-[13.5px] font-semibold leading-[1.3] text-ink">
          {resource.title}
        </div>

        {v.chips.length > 0 ? (
          <div className="flex flex-wrap gap-[5px]">
            {v.chips.map((chip, i) => (
              <span
                key={`${chip.label}-${i}`}
                className="rounded-badge px-[7px] py-0.5 text-[10px] font-semibold"
                style={{ color: chip.c, background: chip.bg }}
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}

        {v.meta ? <div className="text-[10.5px] text-text-faint">{v.meta}</div> : null}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#F4EFE7] pt-[9px]">
          <div className="flex min-w-0 items-center gap-[6px]">
            {isYours ? (
              <span className="rounded-badge bg-[#E4F0ED] px-2 py-[3px] text-[10px] font-semibold text-[#186155]">
                Your upload
              </span>
            ) : null}
          </div>

          {canEdit ? (
            <div className="flex flex-shrink-0 items-center gap-1">
              <span
                role="button"
                tabIndex={0}
                aria-label={`Edit ${resource.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(resource);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(resource);
                  }
                }}
                className="inline-flex size-[26px] items-center justify-center rounded-[7px] border border-[#E0D6C7] bg-white text-[#7A6E62] hover:bg-surface-subtle"
              >
                <EditIcon size={13} />
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Delete ${resource.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(resource);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(resource);
                  }
                }}
                className="inline-flex size-[26px] items-center justify-center rounded-[7px] border border-[#E0D6C7] bg-white text-[#B5566A] hover:bg-surface-subtle"
              >
                <TrashIcon size={13} />
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
