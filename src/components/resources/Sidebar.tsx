'use client';

// The Resource Bank's left sidebar: a "Browse" section that facets the whole
// shared bank by tag (Year, the subject-specific Skill type / Grammar content,
// Theme, Format, plus collapsible Exercise type / Lesson stage / Localisation),
// and a "My folders" section (the auto "Most used" view, the user's custom
// folders, and a "New folder" affordance). Facet options come from the tag
// vocabulary; selecting any facet AND-narrows the results.

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { Folder, ResourceTag, TagDimension, TagsByDimension } from '@/types/resource';
import { BROWSE_FACETS, YEAR_OPTIONS } from '@/components/resources/config';
import type { ActiveView } from '@/components/resources/types';
import {
  BarsIcon,
  CheckIcon,
  ChevronDown,
  ChevronRight,
  EditIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from '@/components/resources/icons';

interface SidebarProps {
  vocabulary: TagsByDimension;
  selectedTagIds: Set<string>;
  onToggleTag: (id: string) => void;
  selectedYear: number | null;
  onToggleYear: (year: number) => void;
  tagCounts: Map<string, number>;
  yearCounts: Map<number, number>;
  folders: Folder[];
  activeView: ActiveView;
  onSelectBrowse: () => void;
  onSelectMostUsed: () => void;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string) => Promise<boolean>;
  onRenameFolder: (id: string, name: string) => Promise<boolean>;
  onDeleteFolder: (id: string) => Promise<boolean>;
}

const SECTION_LABEL =
  'text-[10.5px] font-bold uppercase tracking-[0.05em] text-neutral-600';

/** A tinted checkbox + label + optional count row. */
function CheckRow({
  label,
  checked,
  count,
  onToggle,
}: {
  label: string;
  checked: boolean;
  count?: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-[9px] py-[3px] text-start"
    >
      <span
        className={`inline-flex size-4 flex-shrink-0 items-center justify-center rounded-[5px] ${
          checked ? 'bg-teal' : 'border-[1.5px] border-[#CFC5B8]'
        }`}
      >
        {checked ? <CheckIcon size={11} className="text-white" strokeWidth={3} /> : null}
      </span>
      <span className={checked ? 'font-semibold text-ink' : 'text-neutral-800'}>{label}</span>
      {count != null ? (
        <span className="ms-auto text-[11px] text-text-faint">{count}</span>
      ) : null}
    </button>
  );
}

/** A pill-style toggle (used for Format + Grammar content facets). */
function PillToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-[7px] px-[9px] py-1 text-[11px] font-semibold ${
        active
          ? 'bg-teal text-white'
          : 'border border-border-strong bg-white font-medium text-neutral-800'
      }`}
    >
      {label}
    </button>
  );
}

function FacetSection({
  dimension,
  subjectSpecific,
  defaultCollapsed,
  pills,
  tags,
  selectedTagIds,
  tagCounts,
  onToggleTag,
}: {
  dimension: TagDimension;
  subjectSpecific?: boolean;
  defaultCollapsed?: boolean;
  pills?: boolean;
  tags: ResourceTag[];
  selectedTagIds: Set<string>;
  tagCounts: Map<string, number>;
  onToggleTag: (id: string) => void;
}) {
  const t = useTranslations('resources');
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <div className="border-t border-[#EFE8DD] py-[13px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-[9px] flex w-full items-center gap-[7px]"
      >
        <span className={SECTION_LABEL}>{t(`dimensions.${dimension}`)}</span>
        {subjectSpecific ? (
          <span className="rounded-[5px] bg-[#E4F0ED] px-[6px] py-px text-[9px] font-semibold uppercase tracking-[0.02em] text-teal">
            {t('sidebar.subjectBadge')}
          </span>
        ) : null}
        <span className="ms-auto text-[#B6ABA0]">
          {open ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} className="rtl:-scale-x-100" />}
        </span>
      </button>

      {open ? (
        tags.length === 0 ? (
          <div className="text-[11px] italic text-text-faint">{t('sidebar.noTags')}</div>
        ) : pills ? (
          <div className="flex flex-wrap gap-[6px]">
            {tags.map((tag) => (
              <PillToggle
                key={tag.id}
                label={tag.label}
                active={selectedTagIds.has(tag.id)}
                onToggle={() => onToggleTag(tag.id)}
              />
            ))}
          </div>
        ) : (
          <div>
            {tags.map((tag) => (
              <CheckRow
                key={tag.id}
                label={tag.label}
                checked={selectedTagIds.has(tag.id)}
                count={tagCounts.get(tag.id)}
                onToggle={() => onToggleTag(tag.id)}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

/** A single custom folder row, with inline rename + delete. */
function FolderRow({
  folder,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  folder: Folder;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const t = useTranslations('resources');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [pending, startTransition] = useTransition();

  if (renaming) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const ok = await onRename(name);
            if (ok) setRenaming(false);
          });
        }}
        className="flex items-center gap-2 px-[10px] py-[6px]"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          dir="auto"
          className="min-w-0 flex-1 rounded-[7px] border border-teal bg-white px-2 py-1 text-[12.5px] outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="text-teal disabled:opacity-50"
          aria-label={t('sidebar.saveFolderName')}
        >
          <CheckIcon size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            setName(folder.name);
            setRenaming(false);
          }}
          className="text-text-faint"
          aria-label={t('sidebar.cancelRename')}
        >
          <XIcon size={15} />
        </button>
      </form>
    );
  }

  return (
    <div
      className={`group flex items-center gap-[9px] rounded-[9px] px-[10px] py-[7px] ${
        active ? 'bg-[#FBEFF3]' : ''
      }`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-[9px] text-start">
        <span className="size-[10px] flex-shrink-0 rounded-[3px] bg-pink" />
        <span dir="auto" className={`truncate text-[13px] ${active ? 'font-semibold text-pink' : 'text-neutral-800'}`}>
          {folder.name}
        </span>
      </button>
      <span className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="text-[#7A6E62]"
          aria-label={t('sidebar.renameFolder', { name: folder.name })}
        >
          <EditIcon size={13} />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await onDelete(); })}
          className="text-[#B5566A] disabled:opacity-50"
          aria-label={t('sidebar.deleteFolder', { name: folder.name })}
        >
          <TrashIcon size={13} />
        </button>
      </span>
    </div>
  );
}

export function Sidebar({
  vocabulary,
  selectedTagIds,
  onToggleTag,
  selectedYear,
  onToggleYear,
  tagCounts,
  yearCounts,
  folders,
  activeView,
  onSelectBrowse,
  onSelectMostUsed,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: SidebarProps) {
  const t = useTranslations('resources');
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();
  const [yearOpen, setYearOpen] = useState(true);

  return (
    <aside className="border-e border-border bg-surface-subtle">
      {/* ── Browse ─────────────────────────────────────────────── */}
      <div className="px-4 pb-2 pt-[18px]">
        <button type="button" onClick={onSelectBrowse} className="flex items-center gap-2">
          <SearchIcon size={16} className="text-ink" />
          <span className="text-[14px] font-bold text-ink">{t('sidebar.browse')}</span>
        </button>
        <div className="ms-6 mt-[3px] text-[11.5px] text-text-faint">{t('sidebar.browseHint')}</div>
      </div>

      <div className="px-4 pb-[18px] pt-[6px] text-[13px]">
        {/* Year facet */}
        <div className="border-t border-[#EFE8DD] py-[13px]">
          <button
            type="button"
            onClick={() => setYearOpen((o) => !o)}
            className="mb-[9px] flex w-full items-center justify-between"
          >
            <span className={SECTION_LABEL}>{t('sidebar.year')}</span>
            <span className="text-[#B6ABA0]">
              {yearOpen ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} className="rtl:-scale-x-100" />}
            </span>
          </button>
          {yearOpen
            ? YEAR_OPTIONS.map((year) => (
                <CheckRow
                  key={year}
                  label={t('sidebar.yearOption', { year })}
                  checked={selectedYear === year}
                  count={yearCounts.get(year)}
                  onToggle={() => onToggleYear(year)}
                />
              ))
            : null}
        </div>

        {/* Tag-dimension facets */}
        {BROWSE_FACETS.map((facet) => (
          <FacetSection
            key={facet.dimension}
            dimension={facet.dimension}
            subjectSpecific={facet.subjectSpecific}
            defaultCollapsed={facet.defaultCollapsed}
            pills={facet.pills}
            tags={vocabulary[facet.dimension as TagDimension] ?? []}
            selectedTagIds={selectedTagIds}
            tagCounts={tagCounts}
            onToggleTag={onToggleTag}
          />
        ))}
      </div>

      {/* ── My folders ─────────────────────────────────────────── */}
      <div className="border-t-8 border-[#F1EADE] px-4 pb-[22px] pt-4">
        <div className="flex items-center gap-2">
          <FolderIcon size={16} style={{ color: '#B0651E' }} />
          <span className="text-[14px] font-bold text-ink">{t('sidebar.myFolders')}</span>
        </div>
        <div className="mb-3 ms-6 mt-[3px] text-[11.5px] leading-[1.4] text-text-faint">
          {t('sidebar.myFoldersHint')}
        </div>

        {/* Most used (auto) */}
        <button
          type="button"
          onClick={onSelectMostUsed}
          className={`mb-1 flex w-full items-center gap-[9px] rounded-[9px] px-[10px] py-2 ${
            activeView.kind === 'most-used' ? 'bg-[#FBEFF3]' : ''
          }`}
        >
          <BarsIcon size={15} style={{ color: '#B62A5C' }} />
          <span className="text-[13px] font-semibold text-pink">{t('sidebar.mostUsed')}</span>
          <span className="ms-auto rounded-[5px] bg-white px-[6px] py-px text-[9.5px] font-semibold text-[#B0858F]">
            {t('sidebar.auto')}
          </span>
        </button>

        {folders.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            active={activeView.kind === 'folder' && activeView.id === folder.id}
            onSelect={() => onSelectFolder(folder.id)}
            onRename={(name) => onRenameFolder(folder.id, name)}
            onDelete={() => onDeleteFolder(folder.id)}
          />
        ))}

        {/* New folder */}
        {newOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const ok = await onCreateFolder(newName);
                if (ok) {
                  setNewName('');
                  setNewOpen(false);
                }
              });
            }}
            className="mt-1 flex items-center gap-2 px-[10px] py-2"
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('sidebar.folderNamePlaceholder')}
              dir="auto"
              className="min-w-0 flex-1 rounded-[7px] border border-teal bg-white px-2 py-1 text-[12.5px] outline-none"
            />
            <button type="submit" disabled={pending} className="text-teal disabled:opacity-50" aria-label={t('sidebar.createFolder')}>
              <CheckIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                setNewName('');
                setNewOpen(false);
              }}
              className="text-text-faint"
              aria-label={t('sidebar.cancelNewFolder')}
            >
              <XIcon size={15} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="mt-1 flex items-center gap-2 rounded-[9px] px-[10px] py-2 text-[12.5px] font-semibold text-teal"
          >
            <PlusIcon size={14} /> {t('sidebar.newFolder')}
          </button>
        )}

        <div className="mt-3 rounded-[9px] bg-[#F6F0E7] px-[11px] py-[9px] text-[10.5px] leading-[1.5] text-[#B0A89E]">
          {t.rich('sidebar.tip', {
            b: (chunks) => <b className="text-neutral-600">{chunks}</b>,
          })}
        </div>
      </div>
    </aside>
  );
}
