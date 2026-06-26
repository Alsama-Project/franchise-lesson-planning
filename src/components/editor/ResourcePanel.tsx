'use client';

// The embedded Resource Bank panel shown on the right of editor steps 2 & 3.
// It is a compact, self-contained mirror of the full bank (/resources): a header
// with an "Open full →" link, two tabs (Search · Folders), and a row list. A row
// opens the shared preview popup; "+ Add" attaches the resource to the current
// section (writing its id onto the block and recording a use).
//
// Search runs the real text + tag filters. Folders shows the user's "Most used"
// plus their custom folders. All data comes through the resource Server Actions
// (RLS).

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { formatNumber } from '@/lib/format';
import type { Folder, ResourceWithTags, TagsByDimension } from '@/types/resource';
import {
  addResourceToFolderAction,
  getMostUsedAction,
  listFolderResourcesAction,
  searchResourcesAction,
} from '@/lib/actions/resources';
import { resourceView } from '@/components/resources/presentation';
import { PreviewModal } from '@/components/resources/PreviewModal';
import {
  BarsIcon,
  CheckIcon,
  ChevronRight,
  FolderIcon,
  PlusIcon,
  SearchIcon,
} from '@/components/resources/icons';

type Tab = 'search' | 'folders';

const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'search', labelKey: 'panel.tabSearch' },
  { id: 'folders', labelKey: 'panel.tabFolders' },
];

/** The Search tab's filter chips are drawn from these vocabulary dimensions. */
const FILTER_DIMENSIONS = ['theme', 'skill_type', 'format', 'exercise_type'] as const;

export interface ResourcePanelProps {
  subjectId: string | null;
  vocabulary: TagsByDimension;
  folders: Folder[];
  /** Resource ids attached to the current section (drives the ✓ Added state). */
  attachedIds: string[];
  /** Attach a resource to the current section (persists + records usage + caches). */
  onAttach: (resource: ResourceWithTags) => void;
}

/** One compact resource row in the panel list. */
function ResourceRow({
  resource,
  added,
  onPreview,
  onAdd,
}: {
  resource: ResourceWithTags;
  added: boolean;
  onPreview: (r: ResourceWithTags) => void;
  onAdd: (r: ResourceWithTags) => void;
}) {
  const t = useTranslations('resources');
  const locale = useLocale();
  const v = resourceView(resource);
  return (
    <div className="rounded-[11px] border border-border bg-surface p-[11px]">
      <div className="flex items-start gap-[10px]">
        <button
          type="button"
          onClick={() => onPreview(resource)}
          className="flex min-w-0 flex-1 flex-col items-start gap-[6px] text-start"
        >
          <div className="flex flex-wrap items-center gap-[7px]">
            <span
              className="inline-flex h-[18px] items-center rounded-[5px] px-[6px] text-[9.5px] font-bold tracking-[0.04em]"
              style={{ color: v.fmtColor, background: v.fmtBg }}
            >
              {v.formatShort}
            </span>
            <span className="text-[11px] font-semibold text-[#B0651E]">
              {t('panel.usedCount', { count: formatNumber(resource.usage_count, locale) })}
            </span>
          </div>
          <div dir="auto" className="text-[13px] font-semibold leading-[1.3] text-ink">{resource.title}</div>
          {v.chips.length > 0 ? (
            <div className="flex flex-wrap gap-[5px]">
              {v.chips.slice(0, 3).map((chip, i) => (
                <span
                  key={`${chip.label}-${i}`}
                  className="rounded-badge px-[6px] py-[1px] text-[9.5px] font-semibold"
                  style={{ color: chip.c, background: chip.bg }}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
        </button>
        <div className="flex-shrink-0">
          {added ? (
            <span className="inline-flex items-center gap-[4px] rounded-[7px] border border-[#C9E4D5] bg-[#E2F0E8] px-[9px] py-[6px] text-[11.5px] font-semibold text-[#2E7D5B]">
              <CheckIcon size={13} strokeWidth={2.4} /> {t('panel.added')}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onAdd(resource)}
              className="inline-flex items-center gap-[3px] rounded-[7px] bg-teal px-[10px] py-[6px] text-[11.5px] font-semibold text-white hover:bg-[#1a6a5d]"
            >
              <PlusIcon size={13} strokeWidth={2.4} /> {t('panel.add')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[11px] border border-dashed border-border-strong px-3 py-10 text-center text-[12px] text-text-faint">
      {children}
    </div>
  );
}

export function ResourcePanel({
  subjectId,
  vocabulary,
  folders,
  attachedIds,
  onAttach,
}: ResourcePanelProps) {
  const t = useTranslations('resources');
  const [tab, setTab] = useState<Tab>('search');
  const [preview, setPreview] = useState<ResourceWithTags | null>(null);

  const addedSet = useMemo(() => new Set(attachedIds), [attachedIds]);

  // ── Search ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<ResourceWithTags[]>([]);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => setAppliedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const tagKey = useMemo(() => [...selectedTagIds].sort().join(','), [selectedTagIds]);

  useEffect(() => {
    if (tab !== 'search') return;
    let cancelled = false;
    startSearch(async () => {
      const rows = await searchResourcesAction({
        q: appliedQuery || undefined,
        subjectId: subjectId ?? undefined,
        tagIds: selectedTagIds.size > 0 ? [...selectedTagIds] : undefined,
        limit: 30,
      });
      if (!cancelled) setSearchResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, appliedQuery, tagKey, subjectId, selectedTagIds]);

  const filterChips = useMemo(
    () => FILTER_DIMENSIONS.flatMap((d) => vocabulary[d] ?? []),
    [vocabulary]
  );

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Folders ───────────────────────────────────────────────────────────────
  const [folderView, setFolderView] = useState<'most-used' | string | null>(null);
  const [folderResults, setFolderResults] = useState<ResourceWithTags[]>([]);
  const [loadingFolder, startFolder] = useTransition();

  const openMostUsed = useCallback(() => {
    setFolderView('most-used');
    startFolder(async () => {
      const rows = await getMostUsedAction();
      setFolderResults(rows.map((m) => m.resource));
    });
  }, []);

  const openFolder = useCallback((id: string) => {
    setFolderView(id);
    startFolder(async () => {
      setFolderResults(await listFolderResourcesAction(id));
    });
  }, []);

  // ── preview wiring (reuses the full-bank popup) ─────────────────────────────
  const handleAttach = useCallback(
    (r: ResourceWithTags) => {
      onAttach(r);
    },
    [onAttach]
  );

  const handleAddFromPreview = useCallback(
    async (r: ResourceWithTags) => {
      onAttach(r);
      return true;
    },
    [onAttach]
  );

  const handleSaveToFolder = useCallback(async (r: ResourceWithTags, folderId: string) => {
    const res = await addResourceToFolderAction(folderId, r.id);
    return res.ok;
  }, []);

  const renderRows = (rows: ResourceWithTags[]) =>
    rows.map((resource) => (
      <ResourceRow
        key={resource.id}
        resource={resource}
        added={addedSet.has(resource.id)}
        onPreview={setPreview}
        onAdd={handleAttach}
      />
    ));

  return (
    <div className="flex h-full flex-col border-s border-[#EFE8DD] bg-surface-subtle">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-[18px] pb-[10px] pt-[18px]">
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-neutral-700">
          {t('panel.title')}
        </span>
        <Link
          href="/resources"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal hover:text-[#186155]"
        >
          {t('panel.openFull')} <span aria-hidden className="rtl:-scale-x-100">→</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-[3px] border-b border-[#EFE8DD] px-[14px]">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={
              'relative px-[10px] py-[9px] text-[12.5px] font-semibold ' +
              (tab === tabItem.id
                ? 'text-teal after:absolute after:inset-x-[6px] after:bottom-[-1px] after:h-[2px] after:rounded-full after:bg-teal'
                : 'text-neutral-600 hover:text-ink')
            }
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-[14px]">
        {/* Search */}
        {tab === 'search' ? (
          <div className="flex flex-col gap-[11px]">
            <div className="flex items-center gap-[8px] rounded-[9px] border border-border-strong bg-surface px-[10px] py-[8px]">
              <SearchIcon size={15} className="text-text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('panel.searchPlaceholder')}
                dir="auto"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-neutral-400"
              />
            </div>
            {filterChips.length > 0 ? (
              <div className="flex flex-wrap gap-[5px]">
                {filterChips.map((t) => {
                  const on = selectedTagIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={
                        'rounded-badge border px-[8px] py-[3px] text-[10.5px] font-semibold ' +
                        (on
                          ? 'border-teal bg-[#E4F0ED] text-[#186155]'
                          : 'border-border-strong bg-surface text-neutral-600 hover:border-teal')
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {searching && searchResults.length === 0 ? (
              <EmptyState>{t('panel.searching')}</EmptyState>
            ) : searchResults.length === 0 ? (
              <EmptyState>
                {appliedQuery || selectedTagIds.size > 0
                  ? t('panel.noMatches')
                  : t('panel.searchHint')}
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-[9px]">
                {renderRows(searchResults)}
              </div>
            )}
          </div>
        ) : null}

        {/* Folders */}
        {tab === 'folders' ? (
          <div className="flex flex-col gap-[9px]">
            {folderView ? (
              <>
                <button
                  type="button"
                  onClick={() => setFolderView(null)}
                  className="inline-flex items-center gap-1 self-start text-[12px] font-semibold text-teal hover:text-[#186155]"
                >
                  <span aria-hidden className="rtl:-scale-x-100">←</span> {t('panel.allFolders')}
                </button>
                {loadingFolder && folderResults.length === 0 ? (
                  <EmptyState>{t('panel.loading')}</EmptyState>
                ) : folderResults.length === 0 ? (
                  <EmptyState>{t('panel.folderEmpty')}</EmptyState>
                ) : (
                  renderRows(folderResults)
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openMostUsed}
                  className="flex items-center justify-between rounded-[11px] border border-border bg-surface px-[12px] py-[11px] text-start hover:border-teal"
                >
                  <span className="inline-flex items-center gap-[8px] text-[13px] font-semibold text-ink">
                    <BarsIcon size={15} className="text-[#B0651E]" /> {t('panel.mostUsed')}
                  </span>
                  <ChevronRight size={15} className="text-text-faint rtl:-scale-x-100" />
                </button>
                {folders.length === 0 ? (
                  <EmptyState>{t('panel.noFolders')}</EmptyState>
                ) : (
                  folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => openFolder(f.id)}
                      className="flex items-center justify-between rounded-[11px] border border-border bg-surface px-[12px] py-[11px] text-start hover:border-teal"
                    >
                      <span dir="auto" className="inline-flex items-center gap-[8px] text-[13px] font-semibold text-ink">
                        <FolderIcon size={15} className="text-teal" /> {f.name}
                      </span>
                      <ChevronRight size={15} className="text-text-faint rtl:-scale-x-100" />
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        ) : null}
      </div>

      {preview ? (
        <PreviewModal
          resource={preview}
          canEdit={false}
          isYours={false}
          folders={folders}
          onClose={() => setPreview(null)}
          onAddToLesson={handleAddFromPreview}
          onSaveToFolder={handleSaveToFolder}
          onEdit={() => {}}
        />
      ) : null}
    </div>
  );
}
