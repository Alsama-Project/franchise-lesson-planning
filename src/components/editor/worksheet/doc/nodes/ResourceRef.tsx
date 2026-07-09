'use client';

// A `resourceRef` node: a RENDER-ONLY reference to a bank resource, produced by the
// v2→v3 migration for legacy `kind:'resource'` blocks. Per the approved plan we do
// NOT invest in browser-side lazy resolution of these into editable content yet —
// the node simply resolves the resource by id and renders a clean, read-only card
// (image preview or titled card) inside the flowing document. It is an atom (no
// editable content) and downgrades to a placeholder paragraph in the kill-switch.

import { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { ResourceWithTags } from '@/types/resource';
import { getResourcesByIdsAction, getDownloadUrlAction } from '@/lib/actions/resources';
import { resourceFormat, formatColors } from '../../resourceFormat';
import { BRAND } from '../theme';

function ResourceRefView({ node }: NodeViewProps) {
  const resourceId = node.attrs.resourceId as string | null;
  const uploaderName = node.attrs.uploaderName as string | null;
  const [resource, setResource] = useState<ResourceWithTags | null>(null);
  const [tried, setTried] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!resourceId) return;
    let active = true;
    getResourcesByIdsAction([resourceId]).then((rows) => {
      if (!active) return;
      setResource(rows[0] ?? null);
      setTried(true);
    });
    return () => {
      active = false;
    };
  }, [resourceId]);

  useEffect(() => {
    if (!resource || resourceFormat(resource) !== 'IMG' || !resource.file_path) return;
    let active = true;
    getDownloadUrlAction(resource.file_path).then((url) => {
      if (active && url) setPreviewUrl(url);
    });
    return () => {
      active = false;
    };
  }, [resource]);

  const format = resource ? resourceFormat(resource) : 'FILE';
  const colors = formatColors(format);

  return (
    <NodeViewWrapper
      className="ws-resource-ref"
      data-drag-handle
      contentEditable={false}
      style={{
        border: `1px solid ${BRAND.creamBorder}`,
        borderRadius: 12,
        background: '#fff',
        padding: '14px 16px',
        margin: '14px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.teal }}>
          {uploaderName ? `Attached · ${uploaderName}` : 'Attached resource'}
        </span>
        {resource ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: colors.color, background: colors.bg, borderRadius: 5, padding: '2px 7px' }}>
            {format}
          </span>
        ) : null}
      </div>
      {!resource ? (
        <div style={{ fontSize: 13.5, color: BRAND.faint }}>
          {tried ? 'This resource is no longer available.' : 'Loading resource…'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, marginBottom: previewUrl ? 8 : 4 }}>
            {resource.title}
          </div>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={resource.title}
              style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #E4DACB', display: 'block' }}
            />
          ) : (
            <div style={{ fontSize: 13.5, color: BRAND.muted }}>
              {resource.description || 'Shared resource attached to this worksheet.'}
              {resource.external_url ? (
                <a href={resource.external_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontWeight: 600, color: BRAND.teal }}>
                  Open ↗
                </a>
              ) : null}
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}

export const ResourceRef = Node.create({
  name: 'resourceRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      resourceId: { default: null },
      uploaderName: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-resource-ref]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // Static fallback (print/generateHTML without a live NodeView): a titled card.
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-resource-ref': (node.attrs.resourceId as string) ?? '',
        class: 'ws-resource-ref',
      }),
      ['span', { class: 'ws-resource-ref__label' }, node.attrs.uploaderName ? `Attached · ${node.attrs.uploaderName}` : 'Attached resource'],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceRefView);
  },
});
