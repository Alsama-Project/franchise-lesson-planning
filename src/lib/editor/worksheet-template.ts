// Shared helpers for the per-subject Worksheet Master Template (migration 0062).
//
// The template `body` mirrors the SAME unenforced jsonb shape as
// `lesson_plans.worksheet` (the v3 envelope `{ version, doc }`, or a legacy v2
// `{ version, blocks }`). This module is client-safe (no `server-only`) so both the
// server data layer (console.ts / create-lesson.ts) and the settings UI can share
// the "does this template actually carry content?" test.

/**
 * True when a worksheet/template body carries real authored content — i.e. it is
 * worth seeding into a new plan (and, in the console, worth showing as
 * "Configured"). A never-touched template (no row) or one whose body was cleared
 * back to a single empty paragraph counts as "using the default", not configured.
 *
 * Deliberately conservative: unknown / malformed shapes return false so we never
 * seed garbage into a fresh worksheet.
 */
export function worksheetBodyHasContent(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { version?: number; doc?: { content?: unknown[] }; blocks?: unknown[] };

  // v3 envelope — a single tiptap document.
  if (b.doc && typeof b.doc === 'object') {
    const content = Array.isArray(b.doc.content) ? b.doc.content : [];
    if (content.length === 0) return false;
    // The editor's "empty" default is a single empty paragraph — treat that as no content.
    if (content.length === 1) {
      const only = content[0] as { type?: string; content?: unknown[] } | undefined;
      if (only && only.type === 'paragraph' && (!only.content || only.content.length === 0)) {
        return false;
      }
    }
    return true;
  }

  // Legacy v2 envelope — an ordered block list.
  if (Array.isArray(b.blocks)) return b.blocks.length > 0;

  return false;
}
