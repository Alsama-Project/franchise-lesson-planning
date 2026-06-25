'use server';

// Server Actions that expose the resource-bank data layer (src/lib/resources)
// to the client. The lib functions are server-only (they bind to the cookie'd,
// RLS-scoped Supabase client); these thin wrappers let the /resources client
// components re-query and mutate without ever touching the service-role key.
//
// Every action runs as the signed-in user, so RLS — not these wrappers —
// enforces who may read, edit or delete what.

import {
  addResourceToFolder,
  createFolder,
  createResource,
  deleteFolder,
  deleteResource,
  getMostUsed,
  getResourceDownloadUrl,
  getResourcesByIds,
  getUploaderNames,
  listFolderResources,
  listResources,
  moveResourceBetweenFolders,
  removeResourceFromFolder,
  renameFolder,
  setResourceTags,
  updateResource,
} from '@/lib/resources';
import { recordUsage } from '@/lib/resources/usage';
import { getResourceTextHtml } from '@/lib/resources/content';
import type { MostUsedResource } from '@/lib/resources/usage';
import type {
  CreateResourceInput,
  Folder,
  ResourceFilters,
  ResourceResult,
  ResourceWithTags,
} from '@/types/resource';

// ── reads ────────────────────────────────────────────────────────────────────

/** Search/list resources with the given filters (text + subject/year + AND tags). */
export async function searchResourcesAction(
  filters: ResourceFilters
): Promise<ResourceWithTags[]> {
  return listResources(filters);
}

/** The current user's most-used resources (their personal "Most used" folder). */
export async function getMostUsedAction(): Promise<MostUsedResource[]> {
  return getMostUsed(50);
}

/** The resources inside one of the current user's folders. */
export async function listFolderResourcesAction(
  folderId: string
): Promise<ResourceWithTags[]> {
  return listFolderResources(folderId);
}

/** A short-lived signed URL for a file-backed resource (null for links). */
export async function getDownloadUrlAction(filePath: string): Promise<string | null> {
  return getResourceDownloadUrl(filePath);
}

/** Resolve a set of resources by id (with their tags) — e.g. a section's attachments. */
export async function getResourcesByIdsAction(
  ids: string[]
): Promise<ResourceWithTags[]> {
  return getResourcesByIds(ids);
}

/**
 * Extract a file-backed resource's text as an HTML fragment, for seeding an
 * editable worksheet free block. Returns null for image/binary/link resources
 * (the worksheet builder handles those separately). Server-only conversion
 * (mammoth) runs behind this wrapper.
 */
export async function getResourceTextHtmlAction(
  resourceId: string
): Promise<{ html: string } | null> {
  return getResourceTextHtml(resourceId);
}

/** Resolve resource uploader ids to display names (for the bank "Shared by" facet). */
export async function getUploaderNamesAction(
  ids: string[]
): Promise<Record<string, string>> {
  return getUploaderNames(ids);
}

// ── folders ────────────────────────────────────────────────────────────────────

export async function createFolderAction(name: string): Promise<ResourceResult<Folder>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the folder a name.' };
  return createFolder(trimmed);
}

export async function renameFolderAction(
  id: string,
  name: string
): Promise<ResourceResult<Folder>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the folder a name.' };
  return renameFolder(id, trimmed);
}

export async function deleteFolderAction(id: string): Promise<ResourceResult> {
  return deleteFolder(id);
}

export async function addResourceToFolderAction(
  folderId: string,
  resourceId: string
): Promise<ResourceResult> {
  return addResourceToFolder(folderId, resourceId);
}

export async function removeResourceFromFolderAction(
  folderId: string,
  resourceId: string
): Promise<ResourceResult> {
  return removeResourceFromFolder(folderId, resourceId);
}

export async function moveResourceBetweenFoldersAction(
  fromFolderId: string,
  toFolderId: string,
  resourceId: string
): Promise<ResourceResult> {
  return moveResourceBetweenFolders(fromFolderId, toFolderId, resourceId);
}

// ── usage ────────────────────────────────────────────────────────────────────

/**
 * Record a use of a resource (bumps its popularity + the user's "Most used"),
 * optionally in the context of a lesson plan — the editor passes the plan id when
 * a teacher attaches a resource to a section.
 */
export async function recordUsageAction(
  resourceId: string,
  lessonPlanId?: string
): Promise<ResourceResult> {
  return recordUsage(resourceId, lessonPlanId);
}

// ── create / edit / delete ─────────────────────────────────────────────────────

/**
 * Create a resource from the upload modal's FormData. Exactly one of an uploaded
 * file or an external URL is provided; all chosen tag ids ride along and are
 * linked on creation. `uploaded_by`, `usage_count` and `created_at` are set
 * server-side by the DB, never the client.
 */
export async function createResourceAction(
  formData: FormData
): Promise<ResourceResult<{ id: string }>> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Give the resource a title.' };

  const description = String(formData.get('description') ?? '').trim() || null;
  const subjectId = (formData.get('subjectId') as string) || null;
  const yearRaw = formData.get('year');
  const year = yearRaw ? Number(yearRaw) : null;
  const externalUrl = String(formData.get('externalUrl') ?? '').trim() || null;
  const file = formData.get('file');
  const tagIds = formData.getAll('tagIds').map(String).filter(Boolean);

  const input: CreateResourceInput = {
    title,
    description,
    subjectId,
    year: year != null && Number.isFinite(year) ? year : null,
    tagIds,
  };

  if (file instanceof File && file.size > 0) {
    input.file = file;
  } else if (externalUrl) {
    input.externalUrl = externalUrl;
  } else {
    return { ok: false, error: 'Attach a file or paste a link.' };
  }

  const result = await createResource(input);
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? 'Could not upload the resource.' };
  }
  return { ok: true, data: { id: result.data.id } };
}

/** Update a resource's metadata and replace its full tag set. */
export async function updateResourceAction(
  id: string,
  input: {
    title: string;
    description?: string | null;
    subjectId?: string | null;
    year?: number | null;
    tagIds: string[];
  }
): Promise<ResourceResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give the resource a title.' };

  const meta = await updateResource(id, {
    title,
    description: input.description ?? null,
    subjectId: input.subjectId ?? null,
    year: input.year ?? null,
  });
  if (!meta.ok) return { ok: false, error: meta.error };

  return setResourceTags(id, input.tagIds);
}

/** Delete a resource (its tags, folder entries and usage rows cascade). */
export async function deleteResourceAction(id: string): Promise<ResourceResult> {
  return deleteResource(id);
}
