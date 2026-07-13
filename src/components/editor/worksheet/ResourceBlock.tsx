'use client';

// A "From bank" exercise: a reference to a shared resource inserted via the bank
// modal. Only the resource id is persisted; the resolved resource is passed in
// from the builder. Image-backed resources render an inline preview (resolved
// through a short-lived signed URL); other formats show a titled card with the
// format badge and an open link.

import { useEffect, useState } from 'react';
import type { HTMLAttributes } from 'react';
import type { ResourceWithTags } from '@/types/resource';
import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';
import { BlockBar } from './BlockBar';
import { ExerciseHeading } from './ExerciseHeading';
import { resourceFormat, formatColors } from './resourceFormat';
import { getDownloadUrlAction } from '@/lib/actions/resources';

export function ResourceBlock({
  resource,
  uploaderName,
  index,
  language,
  loading,
  onDelete,
  dragHandleProps,
  chromeless,
}: {
  resource: ResourceWithTags | null;
  uploaderName: string | null;
  index: number;
  /** The subject's content language — drives the "Exercise N" artifact heading. */
  language: WorksheetContentLanguage;
  loading?: boolean;
  onDelete: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
  /** Print/preview render: drop the block bar and card border for a clean page. */
  chromeless?: boolean;
}) {
  // Cache the signed preview URL alongside the path it was signed for, so a stale
  // URL is never shown after the resource changes (and so the effect never calls
  // setState synchronously).
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const format = resource ? resourceFormat(resource) : 'FILE';
  const isImage = format === 'IMG';
  const filePath = resource?.file_path ?? null;

  useEffect(() => {
    if (!filePath || !isImage) return;
    let active = true;
    getDownloadUrlAction(filePath).then((url) => {
      if (active && url) setPreview({ path: filePath, url });
    });
    return () => {
      active = false;
    };
  }, [filePath, isImage]);

  const previewUrl = preview && preview.path === filePath ? preview.url : null;

  const badgeText = uploaderName ? `From bank · ${uploaderName}` : 'From bank';
  const colors = formatColors(format);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={
        chromeless
          ? { background: '#fff' }
          : { border: '1px solid #E7DECF', borderRadius: 14, background: '#fff', overflow: 'hidden' }
      }
    >
      {chromeless ? null : (
        <BlockBar
          badge={{ text: badgeText, variant: 'bank' }}
          onDelete={onDelete}
          dragHandleProps={dragHandleProps}
        />
      )}
      <div style={{ padding: chromeless ? 0 : '16px 20px' }}>
        <ExerciseHeading index={index} language={language} />
        {!resource ? (
          <div style={{ fontSize: 14, color: '#8A8178' }}>
            {loading ? 'Loading resource…' : 'This resource is no longer available.'}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{resource.title}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.color, background: colors.bg, borderRadius: 5, padding: '2px 7px' }}>
                {format}
              </span>
            </div>

            {isImage && previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={resource.title}
                style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid #E4DACB', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  border: '1px solid #E4DACB',
                  borderRadius: 8,
                  padding: '12px 14px',
                  background: '#FBF8F3',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: colors.color, background: colors.bg, borderRadius: 6, padding: '6px 10px' }}>
                  {format}
                </span>
                <span style={{ flex: 1, fontSize: 13.5, color: '#5C544E' }}>
                  {resource.description || 'Shared resource attached to this worksheet.'}
                </span>
                {resource.external_url ? (
                  <a
                    href={resource.external_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1F7A6C' }}
                  >
                    Open ↗
                  </a>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
