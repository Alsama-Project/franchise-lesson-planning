// Hand-authored domain types for the resource bank.
//
// These mirror the resource-bank tables added in
// supabase/migrations/0008_resource_bank.sql, which is the locked source of
// truth. Generated row types live in src/types/database.types.ts
// (see `npm run gen:types`); until that runs against a live DB the query layer
// hand-narrows rows to these shapes.

/**
 * The tag dimensions a resource can be classified along. `theme` and
 * `grammar_content` start with no seeded vocabulary; `skill_type` is scoped to a
 * subject (English first).
 */
export type TagDimension =
  | 'theme'
  | 'format'
  | 'exercise_type'
  | 'lesson_stage'
  | 'skill_type'
  | 'grammar_content'
  | 'localisation';

/** A single entry in the coordinator-managed tag vocabulary. */
export interface ResourceTag {
  id: string;
  dimension: TagDimension;
  label: string;
  /** Null for global dimensions; set for subject-specific ones (e.g. skill_type). */
  subject_id: string | null;
  sort_order: number;
  created_at: string;
}

/** Tag vocabulary grouped by dimension, for building filter UIs. */
export type TagsByDimension = Record<TagDimension, ResourceTag[]>;

/**
 * A shareable teaching resource. Exactly one of `file_path` (an object in the
 * private 'resources' storage bucket) or `external_url` is set.
 */
export interface Resource {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  year: number | null;
  file_path: string | null;
  external_url: string | null;
  uploaded_by: string;
  usage_count: number;
  created_at: string;
  /**
   * How the resource is backed (migration 0067): `upload` (file_path) | `link`
   * (external_url) | `ai_generated` (body_md/body_doc, written back from an
   * approved worksheet exercise). `resources_one_source` guarantees exactly one
   * backing.
   */
  origin: 'upload' | 'link' | 'ai_generated';
  /** Markdown body for ai_generated (body-backed) resources; null for file/link. */
  body_md: string | null;
  /** Rich-text (tiptap) body for ai_generated resources; null for file/link. */
  body_doc: unknown | null;
}

/** A resource with its attached tags resolved (used by list/search results). */
export interface ResourceWithTags extends Resource {
  tags: ResourceTag[];
}

/** A teacher's personal folder of resources. */
export interface Folder {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

/** A recorded use of a resource by a teacher, optionally tied to a lesson plan. */
export interface ResourceUsage {
  id: string;
  resource_id: string;
  used_by: string;
  lesson_plan_id: string | null;
  used_at: string;
}

/**
 * Filters for listing/searching resources. `tagIds` matches resources carrying
 * ALL of the given tags (AND semantics); `q` is a case-insensitive match on
 * title/description.
 */
export interface ResourceFilters {
  q?: string;
  subjectId?: string;
  year?: number;
  /** Resources must carry every tag id listed (AND across dimensions). */
  tagIds?: string[];
  limit?: number;
  offset?: number;
}

/** Input for creating a resource. Provide exactly one of filePath or externalUrl. */
export interface CreateResourceInput {
  title: string;
  description?: string | null;
  subjectId?: string | null;
  year?: number | null;
  /**
   * The object path of a file ALREADY uploaded to the 'resources' bucket (the
   * browser uploads directly to Storage and passes the path). Mutually exclusive
   * with externalUrl.
   */
  filePath?: string | null;
  /** An external link. Mutually exclusive with filePath. */
  externalUrl?: string | null;
  /** Tag ids to attach on creation. */
  tagIds?: string[];
}

/** Input for updating a resource's metadata and/or tag set. */
export interface UpdateResourceInput {
  title?: string;
  description?: string | null;
  subjectId?: string | null;
  year?: number | null;
  /** When provided, replaces the resource's full tag set with these ids. */
  tagIds?: string[];
}

/** Input for creating a coordinator-managed tag. */
export interface CreateTagInput {
  dimension: TagDimension;
  label: string;
  subjectId?: string | null;
  sortOrder?: number;
}

/** Input for updating a coordinator-managed tag. */
export interface UpdateTagInput {
  label?: string;
  sortOrder?: number;
}

/** Standard result envelope for resource mutations. */
export interface ResourceResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}
