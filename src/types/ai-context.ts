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
export type AiContextTool = 'worksheet_builder' | 'resource_generator' | 'smartt_checker';

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
