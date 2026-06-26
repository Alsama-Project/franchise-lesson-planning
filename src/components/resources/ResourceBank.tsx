'use client';

// The Resource Bank page body (client). It owns all interactive state — the
// search text, the active browse facets (year + tags), which folder view is
// open, the preview/upload/edit modals — and talks to the data layer through
// the resource Server Actions. Results, folder contents, popularity and the NEW
// badge are all real data; permissions (edit/delete, "Your upload") are derived
// from the signed-in user's id and role.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatNumber } from '@/lib/format';
import type { Folder, ResourceFilters, ResourceWithTags } from '@/types/resource';
import {
  addResourceToFolderAction,
  createFolderAction,
  createResourceAction,
  deleteFolderAction,
  deleteResourceAction,
  getMostUsedAction,
  listFolderResourcesAction,
  renameFolderAction,
  searchResourcesAction,
  updateResourceAction,
} from '@/lib/actions/resources';
import {
  appendResourceBlocksToLessonAction,
  type DraftLessonSummary,
} from '@/lib/actions/lesson-drafts';
import { buildBlocksFromResource } from '@/lib/editor/resource-to-block';
import type { ActiveView, ResourceBankProps } from '@/components/resources/types';
import { SearchHeader, type FilterChip } from '@/components/resources/SearchHeader';
import { Sidebar } from '@/components/resources/Sidebar';
import { ResourceCard } from '@/components/resources/ResourceCard';
import { PreviewModal } from '@/components/resources/PreviewModal';
import { LessonPickerModal } from '@/components/resources/LessonPickerModal';
import { UploadModal } from '@/components/resources/UploadModal';
import { ChevronDown } from '@/components/resources/icons';

/** Most-used sort: usage_count desc, newest first as a tiebreak. */
function byMostUsed(a: ResourceWithTags, b: ResourceWithTags): number {
  if (b.usage_count !== a.usage_count) return b.usage_count - a.usage_count;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function ResourceBank({
  role,
  currentUserId,
  subjects,
  defaultSubjectId,
  vocabulary,
  initialResources,
  initialFolders,
}: ResourceBankProps) {
  const t = useTranslations('resources');
  const locale = useLocale();

  // ── filter state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [subjectActive, setSubjectActive] = useState(!!defaultSubjectId);

  // ── view + data state ───────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>({ kind: 'browse' });
  const [browseResults, setBrowseResults] = useState<ResourceWithTags[]>(initialResources);
  const [folderResults, setFolderResults] = useState<ResourceWithTags[]>([]);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [loading, setLoading] = useState(false);
  const [searching, startSearch] = useTransition();

  // ── modals ──────────────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<ResourceWithTags | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceWithTags | null>(null);
  // "Add to a lesson": the resource awaiting a draft-lesson pick, plus a transient
  // confirmation toast (the teacher isn't in the editor to see it land).
  const [addingTo, setAddingTo] = useState<ResourceWithTags | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const subjectName = subjects.find((s) => s.id === defaultSubjectId)?.name ?? t('bank.defaultSubject');

  // Debounce the search text.
  useEffect(() => {
    const t = setTimeout(() => setAppliedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Auto-dismiss the "Added to …" confirmation toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const currentFilters = useCallback(
    (): ResourceFilters => ({
      q: appliedQuery || undefined,
      subjectId: subjectActive && defaultSubjectId ? defaultSubjectId : undefined,
      year: selectedYear ?? undefined,
      tagIds: selectedTagIds.size > 0 ? [...selectedTagIds] : undefined,
    }),
    [appliedQuery, subjectActive, defaultSubjectId, selectedYear, selectedTagIds]
  );

  // Re-run the browse search whenever filters change (only while browsing).
  // `currentFilters` is memoised on the filter inputs, so depending on it (plus
  // the active view) retriggers exactly when a filter changes. The fetch runs in
  // a transition so the list stays interactive and loading is derived, not set
  // synchronously in the effect body.
  useEffect(() => {
    if (activeView.kind !== 'browse') return;
    let cancelled = false;
    const filters = currentFilters();
    startSearch(async () => {
      const rows = await searchResourcesAction(filters);
      if (!cancelled) setBrowseResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [currentFilters, activeView]);

  // ── folder views ────────────────────────────────────────────────────────────
  const openMostUsed = useCallback(() => {
    setActiveView({ kind: 'most-used' });
    setLoading(true);
    getMostUsedAction()
      .then((rows) => setFolderResults(rows.map((m) => m.resource)))
      .finally(() => setLoading(false));
  }, []);

  const openFolder = useCallback((id: string) => {
    setActiveView({ kind: 'folder', id });
    setLoading(true);
    listFolderResourcesAction(id)
      .then((rows) => setFolderResults(rows))
      .finally(() => setLoading(false));
  }, []);

  const refreshActiveView = useCallback(() => {
    if (activeView.kind === 'browse') {
      searchResourcesAction(currentFilters()).then(setBrowseResults);
    } else if (activeView.kind === 'most-used') {
      getMostUsedAction().then((rows) => setFolderResults(rows.map((m) => m.resource)));
    } else {
      listFolderResourcesAction(activeView.id).then(setFolderResults);
    }
  }, [activeView, currentFilters]);

  // ── facet handlers (selecting a facet returns to browse) ───────────────────
  const toggleTag = useCallback((id: string) => {
    setActiveView({ kind: 'browse' });
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleYear = useCallback((year: number) => {
    setActiveView({ kind: 'browse' });
    setSelectedYear((prev) => (prev === year ? null : year));
  }, []);

  const clearAll = useCallback(() => {
    setActiveView({ kind: 'browse' });
    setQuery('');
    setAppliedQuery('');
    setSelectedYear(null);
    setSelectedTagIds(new Set());
    setSubjectActive(false);
  }, []);

  // ── derived: displayed list + counts ────────────────────────────────────────
  const displayed = useMemo(() => {
    const list = activeView.kind === 'browse' ? browseResults : folderResults;
    return [...list].sort(byMostUsed);
  }, [activeView, browseResults, folderResults]);

  // Facet counts reflect the current browse result set.
  const { tagCounts, yearCounts } = useMemo(() => {
    const tags = new Map<string, number>();
    const years = new Map<number, number>();
    for (const r of browseResults) {
      if (r.year != null) years.set(r.year, (years.get(r.year) ?? 0) + 1);
      for (const t of r.tags) tags.set(t.id, (tags.get(t.id) ?? 0) + 1);
    }
    return { tagCounts: tags, yearCounts: years };
  }, [browseResults]);

  // ── permissions ──────────────────────────────────────────────────────────────
  const isYours = useCallback(
    (r: ResourceWithTags) => r.uploaded_by === currentUserId,
    [currentUserId]
  );
  const canEdit = useCallback(
    (r: ResourceWithTags) => role === 'coordinator' || r.uploaded_by === currentUserId,
    [role, currentUserId]
  );

  // ── active filter chips ───────────────────────────────────────────────────────
  const tagLabelById = useMemo(() => {
    const map = new Map<string, { label: string; dimension: string }>();
    for (const list of Object.values(vocabulary)) {
      for (const t of list) map.set(t.id, { label: t.label, dimension: t.dimension });
    }
    return map;
  }, [vocabulary]);

  const chips: FilterChip[] = useMemo(() => {
    const out: FilterChip[] = [];
    const teal = { c: '#186155', bg: '#E4F0ED', x: '#8FBDB4' };
    const pink = { c: '#B62A5C', bg: '#FBEFF3', x: '#E1A8BD' };

    if (subjectActive && defaultSubjectId) {
      out.push({
        key: 'subject',
        label: t('bank.subjectChip', { subject: subjectName }),
        c: teal.c,
        bg: teal.bg,
        xColor: teal.x,
        onRemove: () => setSubjectActive(false),
      });
    }
    if (selectedYear != null) {
      out.push({
        key: 'year',
        label: t('bank.yearChip', { year: formatNumber(selectedYear, locale) }),
        c: teal.c,
        bg: teal.bg,
        xColor: teal.x,
        onRemove: () => setSelectedYear(null),
      });
    }
    for (const id of selectedTagIds) {
      const meta = tagLabelById.get(id);
      if (!meta) continue;
      const isTheme = meta.dimension === 'theme';
      const palette = isTheme ? pink : teal;
      out.push({
        key: id,
        label: meta.label,
        c: palette.c,
        bg: palette.bg,
        xColor: palette.x,
        onRemove: () => toggleTag(id),
      });
    }
    return out;
  }, [subjectActive, defaultSubjectId, subjectName, selectedYear, selectedTagIds, tagLabelById, toggleTag, t, locale]);

  // ── mutations ─────────────────────────────────────────────────────────────────
  const handleCreate = useCallback(
    async (formData: FormData) => {
      const res = await createResourceAction(formData);
      if (res.ok) refreshActiveView();
      return res;
    },
    [refreshActiveView]
  );

  const handleEdit = useCallback(
    async (
      id: string,
      input: {
        title: string;
        description: string | null;
        subjectId: string | null;
        year: number | null;
        tagIds: string[];
      }
    ) => {
      const res = await updateResourceAction(id, input);
      if (res.ok) {
        refreshActiveView();
        setPreview(null);
      }
      return res;
    },
    [refreshActiveView]
  );

  const handleDelete = useCallback(
    async (r: ResourceWithTags) => {
      if (!window.confirm(t('bank.deleteConfirm', { title: r.title }))) return;
      const res = await deleteResourceAction(r.id);
      if (res.ok) {
        if (preview?.id === r.id) setPreview(null);
        refreshActiveView();
      } else {
        window.alert(res.error ?? t('bank.deleteError'));
      }
    },
    [preview, refreshActiveView, t]
  );

  // Opening the picker: choose which draft lesson to add the resource to.
  const handleAddToLesson = useCallback((r: ResourceWithTags) => {
    setPreview(null);
    setAddingTo(r);
  }, []);

  // The chosen lesson: convert the resource into editable free block(s) — the same
  // conversion the in-editor rail uses — and append them to that lesson's
  // worksheet, then confirm with a toast and refresh popularity.
  const handlePickLesson = useCallback(
    async (lesson: DraftLessonSummary): Promise<{ ok: boolean; error?: string }> => {
      const resource = addingTo;
      if (!resource) return { ok: false, error: t('bank.noResourceSelected') };
      let blocks;
      try {
        blocks = await buildBlocksFromResource(resource);
      } catch {
        return { ok: false, error: t('bank.prepareError') };
      }
      const res = await appendResourceBlocksToLessonAction(lesson.id, resource.id, blocks);
      if (!res.ok) return { ok: false, error: res.error };
      setAddingTo(null);
      setToast(t('bank.addedToast', { title: resource.title, lesson: res.lessonLabel ?? lesson.title }));
      refreshActiveView();
      return { ok: true };
    },
    [addingTo, refreshActiveView, t]
  );

  const handleSaveToFolder = useCallback(
    async (r: ResourceWithTags, folderId: string) => {
      const res = await addResourceToFolderAction(folderId, r.id);
      if (res.ok && activeView.kind === 'folder' && activeView.id === folderId) {
        refreshActiveView();
      }
      return res.ok;
    },
    [activeView, refreshActiveView]
  );

  // ── folder CRUD (local list kept in sync) ───────────────────────────────────
  const createFolder = useCallback(async (name: string) => {
    const res = await createFolderAction(name);
    if (res.ok && res.data) setFolders((prev) => [res.data!, ...prev]);
    return res.ok;
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const res = await renameFolderAction(id, name);
    if (res.ok && res.data) {
      setFolders((prev) => prev.map((f) => (f.id === id ? res.data! : f)));
    }
    return res.ok;
  }, []);

  const deleteFolder = useCallback(
    async (id: string) => {
      const res = await deleteFolderAction(id);
      if (res.ok) {
        setFolders((prev) => prev.filter((f) => f.id !== id));
        if (activeView.kind === 'folder' && activeView.id === id) {
          setActiveView({ kind: 'browse' });
        }
      }
      return res.ok;
    },
    [activeView]
  );

  // ── header copy ────────────────────────────────────────────────────────────
  const headerLabel = useMemo(() => {
    if (activeView.kind === 'most-used') return t('bank.inMostUsed');
    if (activeView.kind === 'folder') {
      const f = folders.find((x) => x.id === activeView.id);
      return f ? t('bank.inFolder', { name: f.name }) : t('bank.inThisFolder');
    }
    return t('bank.inBank');
  }, [activeView, folders, t]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <SearchHeader
        query={query}
        onQueryChange={setQuery}
        chips={chips}
        onClearAll={clearAll}
        onUpload={() => setUploadOpen(true)}
      />

      <div className="grid grid-cols-[286px_1fr]">
        <Sidebar
          vocabulary={vocabulary}
          selectedTagIds={selectedTagIds}
          onToggleTag={toggleTag}
          selectedYear={selectedYear}
          onToggleYear={toggleYear}
          tagCounts={tagCounts}
          yearCounts={yearCounts}
          folders={folders}
          activeView={activeView}
          onSelectBrowse={() => setActiveView({ kind: 'browse' })}
          onSelectMostUsed={openMostUsed}
          onSelectFolder={openFolder}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
        />

        {/* Results */}
        <div className="px-8 pb-8 pt-[18px]">
          <div className="mb-[14px] flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] text-text-muted">
              <b className="text-ink">
                {t('bank.count', {
                  count: displayed.length,
                  countText: formatNumber(displayed.length, locale),
                })}
              </b>{' '}
              {headerLabel}
            </div>
            <div className="inline-flex items-center gap-[6px] text-[12.5px] text-neutral-600">
              {t('bank.sort')} <span className="font-semibold text-neutral-900">{t('bank.sortMostUsed')}</span>
              <ChevronDown size={13} className="text-text-faint" />
            </div>
          </div>

          {(loading || searching) && displayed.length === 0 ? (
            <div className="py-20 text-center text-[13px] text-text-faint">{t('bank.loading')}</div>
          ) : displayed.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-border-strong py-20 text-center">
              <div className="text-[14px] font-semibold text-neutral-800">{t('bank.emptyTitle')}</div>
              <div className="mt-1 text-[12.5px] text-text-faint">
                {activeView.kind === 'browse'
                  ? t('bank.emptyBrowse')
                  : t('bank.emptyFolder')}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[14px]">
              {displayed.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  canEdit={canEdit(r)}
                  isYours={isYours(r)}
                  onOpen={setPreview}
                  onEdit={(res) => {
                    setPreview(null);
                    setEditing(res);
                  }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {preview ? (
        <PreviewModal
          resource={preview}
          subjectName={preview.subject_id ? subjectName : undefined}
          canEdit={canEdit(preview)}
          isYours={isYours(preview)}
          folders={folders}
          onClose={() => setPreview(null)}
          onAddToLesson={handleAddToLesson}
          onSaveToFolder={handleSaveToFolder}
          onEdit={(res) => {
            setPreview(null);
            setEditing(res);
          }}
        />
      ) : null}

      {uploadOpen ? (
        <UploadModal
          mode="create"
          subjects={subjects}
          defaultSubjectId={defaultSubjectId}
          vocabulary={vocabulary}
          onClose={() => setUploadOpen(false)}
          onSubmitCreate={handleCreate}
          onSubmitEdit={handleEdit}
        />
      ) : null}

      {editing ? (
        <UploadModal
          mode="edit"
          subjects={subjects}
          defaultSubjectId={defaultSubjectId}
          vocabulary={vocabulary}
          existing={editing}
          onClose={() => setEditing(null)}
          onSubmitCreate={handleCreate}
          onSubmitEdit={handleEdit}
        />
      ) : null}

      {addingTo ? (
        <LessonPickerModal
          resourceTitle={addingTo.title}
          onClose={() => setAddingTo(null)}
          onPick={handlePickLesson}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-[10px] bg-[#1F2421] px-4 py-[10px] text-[13px] font-medium text-white shadow-card">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
