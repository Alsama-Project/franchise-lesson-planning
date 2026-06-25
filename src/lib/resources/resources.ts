// Resource-bank CRUD and search. All reads/writes go through the auth'd,
// cookie-bound Supabase client so RLS scopes them: any authenticated user can
// read resources, but only the uploader (or a coordinator) may edit or delete
// one. Uploaded files live in the private 'resources' storage bucket; a resource
// is backed by EXACTLY ONE of an uploaded file or an external URL.

import { createClient } from '@/lib/supabase/server';
import type {
  CreateResourceInput,
  Resource,
  ResourceFilters,
  ResourceResult,
  ResourceTag,
  ResourceWithTags,
  UpdateResourceInput,
} from '@/types/resource';

const STORAGE_BUCKET = 'resources';

const RESOURCE_COLUMNS =
  'id, title, description, subject_id, year, file_path, external_url, uploaded_by, usage_count, created_at';

/** Attach each resource's tags (one round-trip via the link table). */
async function attachTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resources: Resource[]
): Promise<ResourceWithTags[]> {
  if (resources.length === 0) return [];

  const ids = resources.map((r) => r.id);
  const { data: links } = await supabase
    .from('resource_tag_links')
    .select(
      'resource_id, resource_tags ( id, dimension, label, subject_id, sort_order, created_at )'
    )
    .in('resource_id', ids);

  // Supabase types an embedded one-to-one relation as an array; normalise it to
  // the single related tag (or null) per link row.
  const byResource = new Map<string, ResourceTag[]>();
  for (const link of (links ?? []) as unknown as Array<{
    resource_id: string;
    resource_tags: ResourceTag | ResourceTag[] | null;
  }>) {
    const tag = Array.isArray(link.resource_tags)
      ? link.resource_tags[0]
      : link.resource_tags;
    if (!tag) continue;
    const list = byResource.get(link.resource_id) ?? [];
    list.push(tag);
    byResource.set(link.resource_id, list);
  }

  return resources.map((r) => ({ ...r, tags: byResource.get(r.id) ?? [] }));
}

/**
 * Resolve which resource ids carry ALL of the given tags (AND semantics across
 * dimensions). Returns null when no tag filter is requested, or an array (which
 * may be empty) when one is.
 */
async function resourceIdsMatchingAllTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tagIds: string[]
): Promise<string[]> {
  const { data } = await supabase
    .from('resource_tag_links')
    .select('resource_id, tag_id')
    .in('tag_id', tagIds);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ resource_id: string; tag_id: string }>) {
    counts.set(row.resource_id, (counts.get(row.resource_id) ?? 0) + 1);
  }

  const required = new Set(tagIds).size;
  return [...counts.entries()]
    .filter(([, n]) => n >= required)
    .map(([resourceId]) => resourceId);
}

/**
 * List/search resources newest-first, with optional text, subject, year and tag
 * filters. Tag filtering is AND across the supplied tag ids. Results carry their
 * resolved tags.
 */
export async function listResources(
  filters: ResourceFilters = {}
): Promise<ResourceWithTags[]> {
  const supabase = await createClient();

  // Narrow by tags first, short-circuiting when none match.
  let tagMatchIds: string[] | null = null;
  if (filters.tagIds && filters.tagIds.length > 0) {
    tagMatchIds = await resourceIdsMatchingAllTags(supabase, filters.tagIds);
    if (tagMatchIds.length === 0) return [];
  }

  let query = supabase
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .order('created_at', { ascending: false });

  if (filters.q) {
    const term = `%${filters.q}%`;
    query = query.or(`title.ilike.${term},description.ilike.${term}`);
  }
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.year !== undefined) query = query.eq('year', filters.year);
  if (tagMatchIds) query = query.in('id', tagMatchIds);

  const from = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  query = query.range(from, from + limit - 1);

  const { data, error } = await query;
  if (error || !data) return [];

  return attachTags(supabase, data as Resource[]);
}

/**
 * Fetch a set of resources by id (with their tags), preserving newest-first
 * order. RLS still applies, so only visible rows come back.
 */
export async function getResourcesByIds(ids: string[]): Promise<ResourceWithTags[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .in('id', ids)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return attachTags(supabase, data as Resource[]);
}

/**
 * Resolve resource uploader ids to display names via `profiles`. RLS exposes
 * `id` + `full_name` for co-members (migration 0013), so non-visible uploaders
 * simply fall out of the map. Used by the worksheet bank modal's "Shared by"
 * facet and the From-bank block badge.
 */
export async function getUploaderNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', unique);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (row.full_name) map[row.id] = row.full_name;
  }
  return map;
}

/** Fetch a single resource with its tags, or null if not visible/found. */
export async function getResource(id: string): Promise<ResourceWithTags | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  const [withTags] = await attachTags(supabase, [data as Resource]);
  return withTags ?? null;
}

/** Build a unique-ish object path for an upload, keyed by the current user. */
function buildStoragePath(userId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/${crypto.randomUUID()}-${safe}`;
}

/**
 * Create a resource. Provide EXACTLY ONE of `file` (uploaded to the 'resources'
 * bucket) or `externalUrl`. Any `tagIds` are linked after the row is created.
 * If a file upload succeeds but the row insert fails, the orphaned object is
 * cleaned up.
 */
export async function createResource(
  input: CreateResourceInput
): Promise<ResourceResult<Resource>> {
  const hasFile = !!input.file;
  const hasUrl = !!input.externalUrl;
  if (hasFile === hasUrl) {
    return {
      ok: false,
      error: 'Provide exactly one of an uploaded file or an external URL.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  let filePath: string | null = null;
  if (input.file) {
    filePath = buildStoragePath(user.id, input.file.name);
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      // Set contentType from the file's MIME type so the object isn't stored as a
      // generic binary blob — without it previews (PDFs, images) won't render
      // inline when opened. Fall back to storage-js inference when unknown.
      .upload(filePath, input.file, {
        upsert: false,
        contentType: input.file.type || undefined,
      });
    if (uploadError) return { ok: false, error: uploadError.message };
  }

  const { data, error } = await supabase
    .from('resources')
    .insert({
      title: input.title,
      description: input.description ?? null,
      subject_id: input.subjectId ?? null,
      year: input.year ?? null,
      file_path: filePath,
      external_url: input.externalUrl ?? null,
      uploaded_by: user.id,
    })
    .select(RESOURCE_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    // Roll back the orphaned upload so we don't leak storage objects.
    if (filePath) await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    return { ok: false, error: error?.message ?? 'Failed to create resource.' };
  }

  const resource = data as Resource;
  if (input.tagIds && input.tagIds.length > 0) {
    await setResourceTags(resource.id, input.tagIds);
  }

  return { ok: true, data: resource };
}

/**
 * Update a resource's metadata and, when `tagIds` is provided, replace its full
 * tag set. RLS allows this only for the uploader or a coordinator.
 */
export async function updateResource(
  id: string,
  input: UpdateResourceInput
): Promise<ResourceResult<Resource>> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.subjectId !== undefined) patch.subject_id = input.subjectId;
  if (input.year !== undefined) patch.year = input.year;

  const supabase = await createClient();

  // Only touch the row if there is metadata to change; either way we may still
  // be replacing tags below.
  let resource: Resource | null = null;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase
      .from('resources')
      .update(patch)
      .eq('id', id)
      .select(RESOURCE_COLUMNS)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'Resource not found or not permitted.' };
    resource = data as Resource;
  }

  if (input.tagIds !== undefined) {
    const result = await setResourceTags(id, input.tagIds);
    if (!result.ok) return { ok: false, error: result.error };
  }

  if (!resource) {
    const { data } = await supabase
      .from('resources')
      .select(RESOURCE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    resource = (data as Resource) ?? null;
  }

  return { ok: true, data: resource ?? undefined };
}

/**
 * Delete a resource (its tag links, folder entries and usage rows cascade). Also
 * removes the backing storage object when the resource was a file. RLS allows
 * this only for the uploader or a coordinator.
 */
export async function deleteResource(id: string): Promise<ResourceResult> {
  const supabase = await createClient();

  // Look up the file path before deleting so we can clean up storage.
  const { data: existing } = await supabase
    .from('resources')
    .select('file_path')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('resources').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  const filePath = (existing as { file_path: string | null } | null)?.file_path;
  if (filePath) {
    await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
  }
  return { ok: true };
}

/**
 * Replace a resource's full tag set with `tagIds` (a no-op-safe "set"): clears
 * the existing links then inserts the new ones. RLS allows this only when the
 * caller may edit the parent resource.
 */
export async function setResourceTags(
  resourceId: string,
  tagIds: string[]
): Promise<ResourceResult> {
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from('resource_tag_links')
    .delete()
    .eq('resource_id', resourceId);
  if (clearError) return { ok: false, error: clearError.message };

  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return { ok: true };

  const { error: insertError } = await supabase
    .from('resource_tag_links')
    .insert(unique.map((tagId) => ({ resource_id: resourceId, tag_id: tagId })));
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true };
}

/**
 * Create a short-lived signed URL for downloading a file-backed resource's
 * object from the private bucket. Returns null for URL-backed resources.
 */
export async function getResourceDownloadUrl(
  filePath: string,
  expiresInSeconds = 60 * 60
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
