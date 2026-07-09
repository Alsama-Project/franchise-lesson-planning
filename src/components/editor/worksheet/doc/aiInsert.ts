'use client';

// AI generation for the document editor, re-housed from the v2 Free block. Both the
// backend contract (`/api/generate-resource`) and the adjust mode are reused
// UNCHANGED — only the entry points and insertion change:
//   • Generate: insert the AI title + body as normal flowing nodes at the cursor
//     (no chrome'd node, no persisted `fromAI`).
//   • Adjust with AI: a SELECTION-level action — serialise the selection to
//     markdown, run the same adjust request, replace the selection with the result.

import type { Editor, JSONContent } from '@tiptap/core';
import type { WorksheetContext } from '../context';
import {
  requestGeneratedResource,
  type GeneratedResource,
} from '@/lib/editor/generate-resource-client';
import { escapeHtml, markdownToHtml, docToMarkdown } from '@/lib/editor/markdown';

/** Build the HTML for a generated resource. The title is a Heading (h2 — there is
 *  no in-body Title style), the body is the converted markdown. */
function generatedHtml(result: GeneratedResource): string {
  return `<h2>${escapeHtml(result.title)}</h2>${markdownToHtml(result.body)}`;
}

/**
 * Generate a resource from a fresh prompt and insert it as flowing content at the
 * current cursor. Returns the (transient, never-persisted) teacher notes so the
 * caller can surface them briefly.
 */
export async function insertGeneratedResource(
  editor: Editor,
  ctx: WorksheetContext,
  prompt: string,
): Promise<{ teacherNotes: string | null }> {
  const result = await requestGeneratedResource(ctx, prompt.trim());
  editor.chain().focus().insertContent(generatedHtml(result)).run();
  return { teacherNotes: result.teacher_notes };
}

/** Serialise the current selection to the markdown subset the adjust backend reads. */
function selectionMarkdown(editor: Editor): string {
  const slice = editor.state.selection.content();
  const doc: JSONContent = { type: 'doc', content: slice.content.toJSON() as JSONContent[] };
  return docToMarkdown(doc);
}

/**
 * Adjust the current selection with AI: send the selected content (as markdown) plus
 * the refinement to the SAME adjust backend, then replace the selection with the
 * refined result. No-op when the selection is empty.
 */
export async function adjustSelectionWithAI(
  editor: Editor,
  ctx: WorksheetContext,
  refinement: string,
): Promise<{ teacherNotes: string | null; changed: boolean }> {
  const change = refinement.trim();
  if (editor.state.selection.empty || change.length === 0) {
    return { teacherNotes: null, changed: false };
  }
  const currentMarkdown = selectionMarkdown(editor);
  const result = await requestGeneratedResource(ctx, '', change, currentMarkdown);
  // Replace just the selection with the refined body (no title heading on adjust —
  // the teacher selected a range, not a whole exercise).
  editor.chain().focus().deleteSelection().insertContent(markdownToHtml(result.body)).run();
  return { teacherNotes: result.teacher_notes, changed: true };
}
