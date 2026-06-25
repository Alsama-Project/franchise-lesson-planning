'use client';

// A static, non-editable render of the worksheet used by the print-preview modal
// (and the @media print output). It reuses the locked MasterFrame and renders
// each block without editing chrome: every block shows its auto-numbered
// "Exercise N" heading; Free blocks serialise their stored tiptap doc via
// `generateHTML` (so resizable-image width/align round-trips) and render their
// contained floating elements (text boxes / images) at their block-relative
// positions; From-bank blocks reuse ResourceBlock in chromeless mode.

import { generateHTML, type JSONContent } from '@tiptap/core';
import type { FloatingElement, Worksheet, WorksheetFreeBlock } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import { MasterFrame } from './MasterFrame';
import { ResourceBlock } from './ResourceBlock';
import { ExerciseHeading } from './ExerciseHeading';
import { worksheetEditorExtensions } from './editorExtensions';
import type { WorksheetContext } from './context';

function docHtml(doc: unknown): string {
  if (!doc) return '';
  try {
    return generateHTML(doc as JSONContent, worksheetEditorExtensions());
  } catch {
    return '';
  }
}

/** Static, non-interactive render of one block's contained floating elements. */
function StaticFloatingLayer({ elements }: { elements: FloatingElement[] }) {
  if (elements.length === 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
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
                padding: 10,
                background: el.fill === 'white' ? '#fff' : 'transparent',
                border: el.border ? '1.5px solid #C9B89F' : 'none',
                borderRadius: 6,
              }}
              className="worksheet-doc"
              dangerouslySetInnerHTML={{ __html: docHtml(el.doc) }}
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

/** One Free block in print: heading + flowing doc + contained floating layer. The
 *  padded, relative container mirrors the editor's block content box so the
 *  block-relative element positions print exactly where placed. */
function PrintFreeBlock({ block, index }: { block: WorksheetFreeBlock; index: number }) {
  return (
    <div style={{ position: 'relative', padding: '24px 48px 38px' }}>
      <ExerciseHeading index={index} />
      <div className="worksheet-doc" dangerouslySetInnerHTML={{ __html: docHtml(block.doc) }} />
      <StaticFloatingLayer elements={block.elements} />
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
    <MasterFrame ctx={ctx}>
      {ws.blocks.map((block, i) => (
        // ws-print-block carries break-inside: avoid so a single exercise isn't
        // split across an A4 page boundary mid-line when it prints.
        <div key={block.id} className="ws-print-block">
          {block.kind === 'free' ? (
            <PrintFreeBlock block={block} index={i} />
          ) : (
            <ResourceBlock
              resource={resolved[block.resourceId] ?? null}
              uploaderName={block.uploaderName}
              index={i}
              onDelete={() => {}}
              chromeless
            />
          )}
        </div>
      ))}
    </MasterFrame>
  );
}
