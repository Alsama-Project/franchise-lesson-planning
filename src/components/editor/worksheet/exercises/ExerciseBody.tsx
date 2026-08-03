'use client';

// Read-mode render of one exercise's `body_doc` — a handout, not an editor.
//
// `body_doc` is always produced by `markdownToDoc` (the exercise route), so it is a
// KNOWN, small subset: doc · heading · paragraph · bulletList · orderedList ·
// listItem · text(+bold/italic) · hardBreak, with `[Picture: …]` markers passing
// through as literal text. We render that subset as plain tags inside a `.ws-doc`
// wrapper, so the existing worksheet type scale / list styling (globals.css) applies
// for free and the card reads exactly like the continuous editor's page.
//
// Each `[Picture: …]` marker, in document order, maps to the exercise's
// `image_slots[k]` (the route derives the slots from the same markers in the same
// order). A marker that is its own paragraph becomes the slot's reserved box; an
// inline marker degrades to an inline monospace token (still consuming its slot
// index so the mapping stays aligned). The slot cursor is threaded as a value
// through pure helpers — nothing mutates a captured closure across the render.

import { Fragment, type ReactNode } from 'react';
import type { WorksheetExercise } from '@/types/worksheet-exercise';
import type { WorksheetDoc } from '@/types/lesson';
import { IMAGE_CAP } from './useWorksheetGeneration';
import { ImageSlotView } from './ImageSlotView';

const PICTURE_RE = /\[Picture:\s*([^\]]+)\]/g;
const PICTURE_ONLY_RE = /^\s*\[Picture:\s*[^\]]+\]\s*$/;

interface JNode {
  type?: string;
  text?: string;
  marks?: { type?: string }[];
  attrs?: { level?: number };
  content?: JNode[];
}

/** Plain text of a node's inline content (for detecting a marker-only paragraph). */
function plainText(nodes: JNode[] | undefined): string {
  if (!nodes) return '';
  return nodes.map((n) => (n.type === 'text' ? n.text ?? '' : plainText(n.content))).join('');
}

/** Normalise a title/heading for the leading-title comparison: trimmed,
 *  case-insensitive, with a single trailing colon (ASCII or full-width) tolerated. */
function normaliseTitle(text: string): string {
  return text.trim().replace(/[:：]\s*$/, '').trim().toLowerCase();
}

/**
 * Drop body_doc's FIRST node when it is a heading that merely repeats the
 * exercise title — the card already prints the title as its `<h3>`, and the
 * generator (prompt: "a heading is optional") often opens body_md with that same
 * title. Only the first node, only a heading, only on a trimmed/case-insensitive/
 * trailing-colon-tolerant match; a non-matching heading is a real sub-heading the
 * model sometimes writes and is left untouched. An empty title never strips (the
 * card falls back to "Exercise N"). Leading title headings carry no `[Picture: …]`
 * markers, so removing one never shifts the image-slot cursor mapping below.
 */
function stripLeadingTitleHeading(content: JNode[], title: string): JNode[] {
  const first = content[0];
  if (!first || first.type !== 'heading') return content;
  const key = normaliseTitle(title);
  if (!key || normaliseTitle(plainText(first.content)) !== key) return content;
  return content.slice(1);
}

export function ExerciseBody({
  exercise,
  slotBaseIndex,
  onRegenerateSlot,
  onRetrySlot,
}: {
  exercise: WorksheetExercise;
  /** Whole-worksheet flattened index of this exercise's FIRST slot (for the cap). */
  slotBaseIndex: number;
  onRegenerateSlot: (slotId: string) => void;
  onRetrySlot: (slotId: string) => void;
}) {
  const doc = (exercise.body_doc as WorksheetDoc | null) ?? null;
  const content: JNode[] = Array.isArray((doc as { content?: JNode[] } | null)?.content)
    ? ((doc as { content?: JNode[] }).content as JNode[])
    : [];
  const slots = Array.isArray(exercise.image_slots) ? exercise.image_slots : [];

  // The card's <h3> is the durable title; drop a body_doc leading heading that
  // just repeats it, so the exercise isn't printed with its name twice.
  const bodyContent = stripLeadingTitleHeading(content, exercise.title);

  const rendered: ReactNode[] = [];
  let cursor = 0; // threaded synchronously through this render only
  bodyContent.forEach((node, i) => {
    // A marker-alone paragraph → the slot's reserved box.
    if (node.type === 'paragraph' && PICTURE_ONLY_RE.test(plainText(node.content))) {
      const slot = slots[cursor];
      const index = slotBaseIndex + cursor;
      cursor += 1;
      if (slot) {
        rendered.push(
          <ImageSlotView
            key={`slot-${slot.slot_id}`}
            slot={slot}
            refused={index >= IMAGE_CAP}
            onRegenerate={() => onRegenerateSlot(slot.slot_id)}
            onRetry={() => onRetrySlot(slot.slot_id)}
          />,
        );
      }
      return;
    }
    const r = renderBlock(node, cursor);
    cursor = r.cursor;
    rendered.push(<Fragment key={i}>{r.node}</Fragment>);
  });

  return (
    <div className="ws-doc" dir="auto">
      {rendered}
    </div>
  );
}

/** Render one top-level block of the known subset, threading the slot cursor. */
function renderBlock(node: JNode, cursor: number): { node: ReactNode; cursor: number } {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(2, Number(node.attrs?.level) || 2));
      const r = renderInline(node.content, cursor);
      return { node: level === 3 ? <h3>{r.node}</h3> : <h2>{r.node}</h2>, cursor: r.cursor };
    }
    case 'bulletList':
    case 'orderedList': {
      const items: ReactNode[] = [];
      let c = cursor;
      (node.content ?? []).forEach((li, i) => {
        const r = renderInline(li.content?.[0]?.content, c);
        c = r.cursor;
        items.push(<li key={i}>{r.node}</li>);
      });
      return {
        node: node.type === 'orderedList' ? <ol>{items}</ol> : <ul>{items}</ul>,
        cursor: c,
      };
    }
    default: {
      const r = renderInline(node.content, cursor);
      return { node: <p>{r.node}</p>, cursor: r.cursor };
    }
  }
}

/** Render inline content: text (+bold/italic/hardBreak), with inline `[Picture: …]`
 *  markers degraded to a monospace token (each still consuming a slot index). */
function renderInline(
  nodes: JNode[] | undefined,
  cursor: number,
): { node: ReactNode; cursor: number } {
  if (!nodes) return { node: null, cursor };
  const out: ReactNode[] = [];
  let c = cursor;
  nodes.forEach((n, i) => {
    if (n.type === 'hardBreak') {
      out.push(<br key={`br-${i}`} />);
      return;
    }
    if (n.type !== 'text') return;
    const bold = n.marks?.some((m) => m.type === 'bold');
    const italic = n.marks?.some((m) => m.type === 'italic');
    splitOnMarkers(n.text ?? '').forEach((part, j) => {
      if (part.marker) {
        c += 1; // keep the slot mapping aligned even for an inline marker
        out.push(
          <span key={`m-${i}-${j}`} className="font-mono text-[12.5px] text-neutral-500">
            {part.value}
          </span>,
        );
        return;
      }
      let el: ReactNode = part.value;
      if (bold) el = <strong>{el}</strong>;
      if (italic) el = <em>{el}</em>;
      out.push(<Fragment key={`t-${i}-${j}`}>{el}</Fragment>);
    });
  });
  return { node: out, cursor: c };
}

/** Split a string into plain runs and `[Picture: …]` marker runs, in order. */
function splitOnMarkers(text: string): { value: string; marker: boolean }[] {
  const parts: { value: string; marker: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  PICTURE_RE.lastIndex = 0;
  while ((m = PICTURE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ value: text.slice(last, m.index), marker: false });
    parts.push({ value: m[0], marker: true });
    last = PICTURE_RE.lastIndex;
  }
  if (last < text.length) parts.push({ value: text.slice(last), marker: false });
  return parts.length ? parts : [{ value: text, marker: false }];
}
