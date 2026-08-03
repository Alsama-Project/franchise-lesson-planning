// Export the per-subject Worksheet Master Templates (table `worksheet_template`,
// migration 0062) to markdown — one file per subject — so George can run it once
// and hand the files to Connie to re-upload through the AI-instructions board as
// per-subject `worksheet_builder` documents (the scaffold `compileWorksheet` now
// reads at compile time).
//
// READ-ONLY. This script NEVER writes to the database. It reads `worksheet_template`
// with the service-role key (reads only) and writes markdown files to a local dir.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npm run export:worksheet-templates -- --out ./worksheet-templates-export
//
// Conversion:
//   - The body is migrated to v3 first (`migrateWorksheetToV3`), so a legacy v2 row
//     converts too; the on-disk source version is recorded as a comment.
//   - Headings become markdown headings; stub content beneath a heading is preserved
//     verbatim, via `docToMarkdown` (the same converter the editor uses).
//   - `docToMarkdown` can only express headings, paragraphs, and bullet/ordered
//     lists. Any other node (image, table, callout, resource reference, …) is
//     something markdown cannot carry: rather than drop it silently, the file gets an
//     HTML comment naming what was lost so a human re-adds it by hand.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JSONContent } from '@tiptap/core';
import { migrateWorksheetToV3 } from '../src/lib/editor/worksheet-migrate';
import { docToMarkdown } from '../src/lib/editor/markdown';

interface TemplateRow {
  subject_id: string;
  body: unknown;
  updated_at: string | null;
  subjects: { code: string; name: string } | { code: string; name: string }[] | null;
}

/** Node types `docToMarkdown` serialises faithfully. Everything else is lossy. */
const FAITHFUL_TYPES = new Set(['heading', 'paragraph', 'bulletList', 'orderedList']);

/** Parse `--out <dir>` from argv (default ./worksheet-templates-export). */
function outDir(): string {
  const i = process.argv.indexOf('--out');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : './worksheet-templates-export';
}

/** Walk the doc and tally node types that `docToMarkdown` cannot represent, so the
 *  export can flag them rather than lose them silently. */
function lossyNodeCounts(doc: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: unknown, top: boolean) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: unknown; content?: unknown };
    const type = typeof n.type === 'string' ? n.type : null;
    // A top-level node whose type isn't faithfully serialised is dropped/mangled.
    // `image` is dropped wherever it appears, so flag it at any depth.
    if (type && ((top && !FAITHFUL_TYPES.has(type)) || type === 'image')) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    if (Array.isArray(n.content)) for (const child of n.content) visit(child, false);
  };
  const content = (doc as { content?: unknown })?.content;
  if (Array.isArray(content)) for (const node of content) visit(node, true);
  return counts;
}

/** The on-disk envelope version, for the provenance comment. */
function sourceVersionLabel(body: unknown): string {
  if (!body || typeof body !== 'object') return 'empty/unknown';
  const v = (body as { version?: unknown }).version;
  return typeof v === 'number' ? `v${v}` : 'unknown';
}

async function loadRows(): Promise<TemplateRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Both are required ' +
        'to read worksheet_template (reads only; this script never writes the database).',
    );
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('worksheet_template')
    .select('subject_id, body, updated_at, subjects ( code, name )');
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return (data ?? []) as unknown as TemplateRow[];
}

/** Build one subject's markdown file content from its stored template body. */
function renderFile(subjectCode: string, subjectName: string, updatedAt: string | null, body: unknown): string {
  const { doc } = migrateWorksheetToV3(body);
  // WorksheetDoc is structurally a tiptap doc; docToMarkdown types its input as the
  // editor's JSONContent, so bridge the two named types.
  const markdown = docToMarkdown(doc as unknown as JSONContent);
  const lossy = lossyNodeCounts(doc);

  const header = [
    `<!-- Worksheet scaffold for ${subjectName} (${subjectCode}) -->`,
    `<!-- Exported from worksheet_template on-disk shape ${sourceVersionLabel(body)}${
      updatedAt ? `, last edited ${updatedAt}` : ''
    }. -->`,
  ];
  if (lossy.size > 0) {
    const parts = [...lossy.entries()].map(([type, n]) => `${type} ×${n}`).join(', ');
    header.push(
      `<!-- NOTE: ${parts} could not be represented in markdown and were dropped by this export. -->`,
      `<!-- Re-add them by hand after upload — markdown carries only headings, paragraphs and lists. -->`,
    );
  }
  const bodyText = markdown.trim().length > 0 ? markdown : '<!-- (template had no markdown-expressible content) -->';
  return `${header.join('\n')}\n\n${bodyText}\n`;
}

/** Resolve the embedded subject row (PostgREST returns object or single-element array). */
function subjectOf(row: TemplateRow): { code: string; name: string } | null {
  const s = row.subjects;
  if (!s) return null;
  return Array.isArray(s) ? (s[0] ?? null) : s;
}

async function main() {
  const dir = outDir();
  const rows = await loadRows();
  mkdirSync(dir, { recursive: true });

  let written = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const subject = subjectOf(row);
    if (!subject?.code) {
      skipped.push(row.subject_id);
      continue;
    }
    const file = join(dir, `${subject.code}.md`);
    writeFileSync(file, renderFile(subject.code, subject.name, row.updated_at, row.body));
    console.log(`${subject.code.padEnd(16)} → ${file}`);
    written += 1;
  }

  console.log(`\n${written} template(s) exported to ${dir}.`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} row(s) with no resolvable subject code: ${skipped.join(', ')}`);
  }
  console.log('Read-only: the database was not modified.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
