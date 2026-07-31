// Hand-authored domain types for the layered AI context stack.
//
// These mirror the `ai_context_doc` / `ai_context_doc_version` tables and the
// `get_active_context_stack()` return shape introduced in migration
// 0063_ai_context_stack.sql. The database schema (supabase/migrations) is the
// locked source of truth; these types must be kept in sync with it by hand — the
// generated row types in src/types/database.types.ts are a placeholder stub
// (`Record<string, never>`) and do not cover these tables.
//
// Deliberately isolated in this file (NOT src/types/lesson.ts, NOT the generated
// src/types/database.types.ts stub) so a parallel branch editing lesson.ts and
// this branch cannot collide.

/**
 * The four STORED layers of the instruction ladder, in ascending authority. The
 * runtime layers 5 (curriculum context) and 6 (the teacher's lesson plan) are
 * request data, not stored, and so are not part of this enum. Mirrors the
 * `ai_context_layer` Postgres enum.
 */
export type AiContextLayer = 'org' | 'academic' | 'subject' | 'tool';

/**
 * The AI tools a layer-4 (`tool`) document can target. Mirrors the
 * `ai_context_tool` Postgres enum.
 */
export type AiContextTool =
  | 'worksheet_builder'
  | 'resource_generator'
  | 'smartt_checker'
  | 'worksheet_image';

/**
 * One context document's identity — a row of `ai_context_doc`. Many documents may
 * live in one layer; each carries an immutable version history in
 * `ai_context_doc_version` (see {@link AiContextDocVersion}).
 *
 * Scope is constrained in the DB by the `ai_context_doc_scope` CHECK:
 *  - `org` / `academic` → `subject_id` null and `tool` null (global);
 *  - `subject`          → `subject_id` set and `tool` null;
 *  - `tool`             → `tool` set, with `subject_id` null (applies to every
 *    subject) or set (a per-subject override of that tool's instructions).
 */
export interface AiContextDoc {
  id: string;
  layer: AiContextLayer;
  /** Set for `subject` docs and for per-subject `tool` overrides; null otherwise. */
  subject_id: string | null;
  /** Set for `tool` docs; null otherwise. */
  tool: AiContextTool | null;
  /** Admin-facing document name (e.g. "Resource generation guide (Connie)"). */
  name: string;
  /** Tie-break ordering within a (layer, tool, subject) group; lower composes first. */
  sort_order: number;
  is_archived: boolean;
  created_by: string;
  created_at: string;
}

/**
 * One immutable version of a document — a row of `ai_context_doc_version`.
 * Re-uploading inserts a new version and deactivates the previous one; exactly
 * one version per doc has `is_active = true` (enforced by a partial unique index).
 */
export interface AiContextDocVersion {
  id: string;
  doc_id: string;
  version: number;
  /** The instruction prose, in markdown. */
  body_md: string;
  original_filename: string | null;
  uploaded_by: string;
  created_at: string;
  is_active: boolean;
}

/**
 * One row returned by `get_active_context_stack(tool, subject_id)`: the active
 * version of each in-scope document, already ordered for composition
 * (`layer_rank`, then each document's `sort_order`, then `created_at`).
 *
 * `layer_rank` is the numeric ladder position — 1 org, 2 academic, 3 subject,
 * 4 tool — derived from {@link AiContextLayer} by the RPC.
 */
export interface ActiveContextStackRow {
  layer_rank: number;
  layer: AiContextLayer;
  doc_id: string;
  doc_name: string;
  version: number;
  body_md: string;
}

// ── Admin "AI instructions" board view models ────────────────────────────────
//
// The shapes the admin surface renders. Assembled server-side by
// `getAiContextBoard()` (src/lib/ai-context.ts): the raw `ai_context_doc` /
// `ai_context_doc_version` rows are joined to their active version, their
// `auth.users` ids resolved to display names, and grouped by layer. Display
// concerns only — never the composition path (that stays in src/lib/ai/*).

/**
 * The fixed layer-4 tools, in the order the board lists them. Mirrors the mockup:
 * worksheet builder · resource generator · objective checker · worksheet image.
 * `smartt_checker` is labelled "Objective checker" in the UI.
 */
export const AI_CONTEXT_TOOLS: readonly AiContextTool[] = [
  'worksheet_builder',
  'resource_generator',
  'smartt_checker',
  'worksheet_image',
];

/**
 * One version in a document's history, as the popup lists it. Metadata only — the
 * body is carried on the active version alone (see {@link AiContextDocView}), so
 * an inactive version never ships its `body_md` to the client.
 */
export interface AiContextVersionView {
  id: string;
  version: number;
  /** Resolved uploader display name, or null when the profile is missing/hidden. */
  uploaderName: string | null;
  createdAt: string;
  isActive: boolean;
}

/**
 * A document flattened to what the board and popup need: its identity plus its
 * ACTIVE version's text and metadata, and the full version list (metadata only).
 */
export interface AiContextDocView {
  id: string;
  layer: AiContextLayer;
  subjectId: string | null;
  tool: AiContextTool | null;
  name: string;
  sortOrder: number;
  /** Active version number (the one composed into prompts and shown by default). */
  activeVersion: number;
  /** Active version's original upload filename, or null (legacy / not captured). */
  originalFilename: string | null;
  /** Active version's stored markdown — rendered verbatim in the popup text panel. */
  bodyMd: string;
  /** Active version's uploader display name, or null when unresolved. */
  uploaderName: string | null;
  /** Active version's upload timestamp (`created_at`). */
  updatedAt: string;
  /** Full history, newest version first; the active one is flagged. */
  versions: AiContextVersionView[];
}

/** A layer-3 row: one subject and the documents scoped to it (may be empty). */
export interface AiContextSubjectGroup {
  subjectId: string;
  name: string;
  docs: AiContextDocView[];
}

/** A layer-4 row: one tool and its documents (may be empty). */
export interface AiContextToolGroup {
  tool: AiContextTool;
  docs: AiContextDocView[];
}

/**
 * The whole board, as one server-assembled payload passed to the client tab.
 * `subjects` lists every active subject (a subject with no documents is a normal
 * "None" row, not an error); `tools` lists the fixed three in {@link AI_CONTEXT_TOOLS}
 * order. `lastChange` is the most recent version upload across all documents.
 */
export interface AiContextBoard {
  org: AiContextDocView[];
  academic: AiContextDocView[];
  subjects: AiContextSubjectGroup[];
  tools: AiContextToolGroup[];
  /** Total non-archived documents across every layer (the header count). */
  totalDocs: number;
  /** Most recent change across the board, for the header line; null when empty. */
  lastChange: { at: string; uploaderName: string | null } | null;
}
