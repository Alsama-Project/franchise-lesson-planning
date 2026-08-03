'use client';

// "Attached from the bank" — the resources a teacher has added to a section,
// resolved with their tags (getResourcesByIds, upstream). Each row shows the
// format badge + title and a remove control that detaches it from the block.

import type { ResourceWithTags } from '@/types/resource';
import { resourceView } from '@/components/resources/presentation';
import { DownloadIcon, XIcon } from '@/components/resources/icons';

export function AttachedList({
  resources,
  onRemove,
  showEmptyState = true,
  downloadLabel,
}: {
  resources: ResourceWithTags[];
  onRemove: (resourceId: string) => void;
  /** When false the "none yet" dashed box is suppressed — used where an upload
   *  drop-zone already serves as the empty-state affordance below this list. */
  showEmptyState?: boolean;
  /** When provided, file-backed rows show a download control with this accessible
   *  label. The label is passed in because this component is translation-free;
   *  its caller owns the i18n namespace. */
  downloadLabel?: string;
}) {
  return (
    <div>
      <div className="mb-[8px] flex items-center gap-[8px]">
        <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-neutral-700">
          Attached
        </span>
        <span className="text-[11px] text-text-faint">
          {resources.length === 0 ? 'none yet' : `${resources.length} attached`}
        </span>
      </div>
      {resources.length === 0 ? (
        showEmptyState ? (
          <div className="rounded-[10px] border border-dashed border-border-strong px-3 py-[14px] text-center text-[12px] text-text-faint">
            Add resources from the bank — they appear here.
          </div>
        ) : null
      ) : (
        <div className="flex flex-col gap-[7px]">
          {resources.map((r) => {
            const v = resourceView(r);
            return (
              <div
                key={r.id}
                className="flex items-center gap-[10px] rounded-[10px] border border-border bg-surface px-[11px] py-[8px]"
              >
                <span
                  className="inline-flex h-[18px] flex-shrink-0 items-center rounded-[5px] px-[6px] text-[9.5px] font-bold tracking-[0.04em]"
                  style={{ color: v.fmtColor, background: v.fmtBg }}
                >
                  {v.formatShort}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                  {r.title}
                </span>
                {/* Download the file currently in place — only for file-backed
                    rows (link / AI-generated resources have no file to fetch). */}
                {downloadLabel && r.file_path ? (
                  <a
                    href={`/api/resources/${r.id}/file?download=1`}
                    download
                    aria-label={downloadLabel}
                    title={downloadLabel}
                    className="flex-shrink-0 text-neutral-300 hover:text-teal"
                  >
                    <DownloadIcon size={15} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemove(r.id)}
                  aria-label={`Remove ${r.title}`}
                  className="flex-shrink-0 text-neutral-300 hover:text-pink"
                >
                  <XIcon size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
