'use client';

// A static, non-editable render of the worksheet used by the print-preview modal
// (and the @media print output). It reuses the locked MasterFrame and renders
// each block without editing chrome: Free blocks are serialised from their stored
// tiptap doc via `generateHTML` (so the resizable-image width/align styles
// round-trip), and From-bank blocks reuse ResourceBlock in chromeless mode.

import { generateHTML, type JSONContent } from '@tiptap/core';
import type { Worksheet } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import { MasterFrame } from './MasterFrame';
import { ResourceBlock } from './ResourceBlock';
import { worksheetEditorExtensions } from './editorExtensions';
import type { WorksheetContext } from './context';

function freeBlockHtml(doc: unknown): string {
  if (!doc) return '';
  try {
    return generateHTML(doc as JSONContent, worksheetEditorExtensions());
  } catch {
    return '';
  }
}

/** Static, non-interactive render of the floating layer for print/preview. */
function StaticFloatingLayer({ elements }: { elements: Worksheet['elements'] }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {elements.map((el) => {
        const base: React.CSSProperties = {
          position: 'absolute',
          left: el.x,
          top: el.y,
          width: el.w,
          height: el.h,
          zIndex: el.z,
        };
        if (el.kind === 'textbox') {
          return (
            <div
              key={el.id}
              style={{
                ...base,
                boxSizing: 'border-box',
                overflow: 'hidden',
                padding: '8px 10px',
                background: el.fill === 'white' ? '#fff' : 'transparent',
                border: el.border ? '1.5px solid #C9B89F' : 'none',
                borderRadius: 6,
              }}
              className="worksheet-doc"
              dangerouslySetInnerHTML={{ __html: freeBlockHtml(el.doc) }}
            />
          );
        }
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={el.id}
            src={el.src}
            alt={el.alt ?? ''}
            style={{ ...base, objectFit: 'contain', borderRadius: 6 }}
          />
        );
      })}
    </div>
  );
}

export function WorksheetPrintView({
  ws,
  ctx,
  resolved,
}: {
  ws: Worksheet;
  ctx: WorksheetContext;
  resolved: Record<string, ResourceWithTags>;
}) {
  return (
    <MasterFrame ctx={ctx} overlay={<StaticFloatingLayer elements={ws.elements} />}>
      {ws.blocks.map((block, i) => {
        if (block.kind === 'free') {
          const html = freeBlockHtml(block.doc);
          return (
            <div
              key={block.id}
              className="worksheet-doc"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        return (
          <ResourceBlock
            key={block.id}
            resource={resolved[block.resourceId] ?? null}
            uploaderName={block.uploaderName}
            index={i}
            onDelete={() => {}}
            chromeless
          />
        );
      })}
    </MasterFrame>
  );
}
