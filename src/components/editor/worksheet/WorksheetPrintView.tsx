'use client';

// A static, non-editable render of the worksheet used by the print-preview modal
// (and the @media print output) and the read-only views. It reuses the locked
// MasterFrame and renders each block without editing chrome: every block shows
// its auto-numbered "Exercise N" heading; Free blocks serialise their stored
// tiptap doc via `generateHTML` (so resizable-image width/align round-trips) and
// render their contained floating elements (text boxes / images) at their
// block-relative positions; From-bank blocks reuse ResourceBlock in chromeless
// mode.
//
// Pagination: content auto-flows onto multiple A4 pages. The page assignment is
// computed by the SHARED `paginateBlocks` from measured block heights (via
// WorksheetMeasurer) — the SAME logic the on-screen builder uses — so the printed
// worksheet paginates identically to the editor. Whole blocks only; a block that
// would cross a boundary moves to the next page, and one taller than a page is
// kept whole and flagged.

import { useState } from 'react';
import { generateHTML, type JSONContent } from '@tiptap/core';
import type { FloatingElement, Worksheet, WorksheetBlock, WorksheetFreeBlock } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import type { PaginationResult } from '@/lib/editor/pagination';
import { MasterFrame } from './MasterFrame';
import { ResourceBlock } from './ResourceBlock';
import { ExerciseHeading } from './ExerciseHeading';
import { WorksheetMeasurer } from './WorksheetMeasurer';
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

/** One worksheet block in its static (print/read-only) form. Shared by the print
 *  render AND the hidden pagination measurer so both measure/print the same DOM. */
export function PrintBlock({
  block,
  index,
  resolved,
}: {
  block: WorksheetBlock;
  index: number;
  resolved: Record<string, ResourceWithTags>;
}) {
  if (block.kind === 'free') return <PrintFreeBlock block={block} index={index} />;
  return (
    <ResourceBlock
      resource={resolved[block.resourceId] ?? null}
      uploaderName={block.uploaderName}
      index={index}
      onDelete={() => {}}
      chromeless
    />
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
  // Until the first measurement settles, fall back to a single page holding every
  // block (never blank). The measurer then drives the real page assignment.
  const [result, setResult] = useState<PaginationResult>(() => ({
    pages: [ws.blocks.map((_, i) => i)],
    overflow: ws.blocks.map(() => false),
  }));
  const total = result.pages.length;

  return (
    <>
      <WorksheetMeasurer ws={ws} ctx={ctx} resolved={resolved} onResult={setResult} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {result.pages.map((indices, p) => (
          <MasterFrame key={p} ctx={ctx} pageLabel={{ index: p + 1, total }}>
            {indices.map((i) =>
              ws.blocks[i] ? (
                // ws-print-block carries break-inside: avoid so a single exercise
                // isn't split across a sheet mid-line if a page is slightly over.
                <div key={ws.blocks[i].id} className="ws-print-block">
                  <PrintBlock block={ws.blocks[i]} index={i} resolved={resolved} />
                </div>
              ) : null,
            )}
          </MasterFrame>
        ))}
      </div>
    </>
  );
}
