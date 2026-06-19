'use client';

// The resource preview popup: a format hero, usage, the full tag detail grid,
// and the primary actions — "Add to a lesson" (records a use, which feeds
// popularity + the user's Most used) and "Save to a folder" (a quick folder
// picker). It also offers Open/Download (signed URL for files, the link for
// URL-backed resources) and, when the viewer may edit, an edit shortcut.

import { useState, useTransition } from 'react';
import type { Folder, ResourceWithTags } from '@/types/resource';
import { resourceView } from '@/components/resources/presentation';
import { DownloadIcon, LinkIcon, PlusIcon, XIcon, EditIcon } from '@/components/resources/icons';

interface PreviewModalProps {
  resource: ResourceWithTags;
  subjectName?: string;
  canEdit: boolean;
  isYours: boolean;
  folders: Folder[];
  onClose: () => void;
  onAddToLesson: (resource: ResourceWithTags) => Promise<boolean>;
  onSaveToFolder: (resource: ResourceWithTags, folderId: string) => Promise<boolean>;
  onOpenResource: (resource: ResourceWithTags) => Promise<void>;
  onEdit: (resource: ResourceWithTags) => void;
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-faint">{k}</div>
      <div className="text-[13.5px] text-ink">{v}</div>
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
  onOpenResource,
  onEdit,
}: PreviewModalProps) {
  const v = resourceView(resource);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isLink = !!resource.external_url;

  const details: { k: string; v: string }[] = [];
  if (v.formatLabel) details.push({ k: 'Format', v: v.formatLabel });
  if (resource.year != null) details.push({ k: 'Year', v: `Year ${resource.year}` });
  if (subjectName) details.push({ k: 'Subject', v: subjectName });
  if (v.skill) details.push({ k: 'Skill type', v: v.skill });
  if (v.theme) details.push({ k: 'Theme', v: v.theme });
  if (v.exercise) details.push({ k: 'Exercise type', v: v.exercise });
  if (v.stage) details.push({ k: 'Lesson stage', v: v.stage });
  if (v.localisation) details.push({ k: 'Localisation', v: v.localisation });
  if (v.grammar) details.push({ k: 'Grammar content', v: v.grammar });

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
        {/* Hero */}
        <div
          className="relative flex h-[150px] items-center justify-center"
          style={{ background: v.fmtBg }}
        >
          {v.isNew ? (
            <span className="absolute left-[14px] top-[14px] rounded-badge bg-pink px-[9px] py-[3px] text-[10px] font-bold tracking-[0.04em] text-white">
              NEW
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="absolute right-3 top-3 inline-flex size-[30px] items-center justify-center rounded-[8px] bg-white/85 text-neutral-800"
          >
            <XIcon size={15} />
          </button>
          <span className="text-[20px] font-bold tracking-[0.04em]" style={{ color: v.fmtColor }}>
            {v.formatShort}
          </span>
        </div>

        <div className="p-[22px] pt-5">
          <div className="text-[19px] font-semibold leading-[1.25] text-ink">{resource.title}</div>
          {resource.description ? (
            <p className="mt-2 text-[13px] leading-[1.5] text-text-muted">{resource.description}</p>
          ) : null}

          <div className="mt-[9px] inline-flex items-center gap-[6px] rounded-full bg-[#F6ECDA] px-[11px] py-1 text-[12.5px] font-semibold text-[#B0651E]">
            Used {resource.usage_count}× in lessons
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
                Your upload — you can edit or delete it
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
              <div className="mb-2 text-[12px] font-semibold text-neutral-800">Save to which folder?</div>
              {folders.length === 0 ? (
                <div className="text-[12px] text-text-faint">
                  You have no folders yet — create one in the sidebar first.
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
                            setMessage(`Saved to "${f.name}".`);
                            setFolderPickerOpen(false);
                          }
                        })
                      }
                      className="flex items-center gap-2 rounded-[8px] px-2 py-[6px] text-left text-[12.5px] text-neutral-800 hover:bg-white disabled:opacity-50"
                    >
                      <span className="size-[10px] rounded-[3px] bg-pink" />
                      {f.name}
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
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const ok = await onAddToLesson(resource);
                  if (ok) setMessage('Added — recorded as a use for this resource.');
                })
              }
              className="inline-flex flex-1 items-center justify-center gap-[7px] rounded-[10px] bg-teal px-3 py-[11px] text-[13.5px] font-semibold text-white hover:bg-[#1a6a5d] disabled:opacity-60"
            >
              <PlusIcon size={15} strokeWidth={2.2} /> Add to a lesson
            </button>
            <button
              type="button"
              onClick={() => setFolderPickerOpen((o) => !o)}
              className="rounded-[10px] border border-border-strong bg-white px-[15px] py-[11px] text-[13.5px] font-medium text-neutral-900 hover:bg-surface-subtle"
            >
              Save to a folder
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => { await onOpenResource(resource); })}
              aria-label={isLink ? 'Open link' : 'Download file'}
              className="inline-flex items-center justify-center rounded-[10px] border border-border-strong bg-white px-3 py-[11px] text-neutral-800 hover:bg-surface-subtle disabled:opacity-60"
            >
              {isLink ? <LinkIcon size={15} /> : <DownloadIcon size={15} />}
            </button>
            {canEdit ? (
              <button
                type="button"
                onClick={() => onEdit(resource)}
                aria-label="Edit resource"
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
