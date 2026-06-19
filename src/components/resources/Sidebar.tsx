'use client';

// The Resource Bank's left sidebar: a "Browse" section that facets the whole
// shared bank by tag (Year, the subject-specific Skill type / Grammar content,
// Theme, Format, plus collapsible Exercise type / Lesson stage / Localisation),
// and a "My folders" section (the auto "Most used" view, the user's custom
// folders, and a "New folder" affordance). Facet options come from the tag
// vocabulary; selecting any facet AND-narrows the results.

import { useState, useTransition } from 'react';
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
      className="flex w-full items-center gap-[9px] py-[3px] text-left"
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
        <span className="ml-auto text-[11px] text-text-faint">{count}</span>
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
  label,
  subjectSpecific,
  defaultCollapsed,
  tags,
  selectedTagIds,
  tagCounts,
  onToggleTag,
}: {
  label: string;
  subjectSpecific?: boolean;
  defaultCollapsed?: boolean;
  tags: ResourceTag[];
  selectedTagIds: Set<string>;
  tagCounts: Map<string, number>;
  onToggleTag: (id: string) => void;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const usePills = label === 'Format' || label === 'Grammar content';

  return (
    <div className="border-t border-[#EFE8DD] py-[13px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-[9px] flex w-full items-center gap-[7px]"
      >
        <span className={SECTION_LABEL}>{label}</span>
        {subjectSpecific ? (
          <span className="rounded-[5px] bg-[#E4F0ED] px-[6px] py-px text-[9px] font-semibold uppercase tracking-[0.02em] text-teal">
            English
          </span>
        ) : null}
        <span className="ml-auto text-[#B6ABA0]">
          {open ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
        </span>
      </button>

      {open ? (
        tags.length === 0 ? (
          <div className="text-[11px] italic text-text-faint">No tags yet.</div>
        ) : usePills ? (
          <div className="flex flex-wrap gap-[6px]">
            {tags.map((t) => (
              <PillToggle
                key={t.id}
                label={t.label}
                active={selectedTagIds.has(t.id)}
                onToggle={() => onToggleTag(t.id)}
              />
            ))}
          </div>
        ) : (
          <div>
            {tags.map((t) => (
              <CheckRow
                key={t.id}
                label={t.label}
                checked={selectedTagIds.has(t.id)}
                count={tagCounts.get(t.id)}
                onToggle={() => onToggleTag(t.id)}
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
          className="min-w-0 flex-1 rounded-[7px] border border-teal bg-white px-2 py-1 text-[12.5px] outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="text-teal disabled:opacity-50"
          aria-label="Save folder name"
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
          aria-label="Cancel rename"
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
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-[9px] text-left">
        <span className="size-[10px] flex-shrink-0 rounded-[3px] bg-pink" />
        <span className={`truncate text-[13px] ${active ? 'font-semibold text-pink' : 'text-neutral-800'}`}>
          {folder.name}
        </span>
      </button>
      <span className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="text-[#7A6E62]"
          aria-label={`Rename ${folder.name}`}
        >
          <EditIcon size={13} />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await onDelete(); })}
          className="text-[#B5566A] disabled:opacity-50"
          aria-label={`Delete ${folder.name}`}
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
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();
  const [yearOpen, setYearOpen] = useState(true);

  return (
    <aside className="border-r border-border bg-surface-subtle">
      {/* ── Browse ─────────────────────────────────────────────── */}
      <div className="px-4 pb-2 pt-[18px]">
        <button type="button" onClick={onSelectBrowse} className="flex items-center gap-2">
          <SearchIcon size={16} className="text-ink" />
          <span className="text-[14px] font-bold text-ink">Browse</span>
        </button>
        <div className="ml-6 mt-[3px] text-[11.5px] text-text-faint">The whole shared bank, by tag</div>
      </div>

      <div className="px-4 pb-[18px] pt-[6px] text-[13px]">
        {/* Year facet */}
        <div className="border-t border-[#EFE8DD] py-[13px]">
          <button
            type="button"
            onClick={() => setYearOpen((o) => !o)}
            className="mb-[9px] flex w-full items-center justify-between"
          >
            <span className={SECTION_LABEL}>Year</span>
            <span className="text-[#B6ABA0]">
              {yearOpen ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
            </span>
          </button>
          {yearOpen
            ? YEAR_OPTIONS.map((year) => (
                <CheckRow
                  key={year}
                  label={`Year ${year}`}
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
            label={facet.label}
            subjectSpecific={facet.subjectSpecific}
            defaultCollapsed={facet.defaultCollapsed}
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
          <span className="text-[14px] font-bold text-ink">My folders</span>
        </div>
        <div className="mb-3 ml-6 mt-[3px] text-[11.5px] leading-[1.4] text-text-faint">
          Your own shortcuts into the bank
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
          <span className="text-[13px] font-semibold text-pink">Most used</span>
          <span className="ml-auto rounded-[5px] bg-white px-[6px] py-px text-[9.5px] font-semibold text-[#B0858F]">
            AUTO
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
              placeholder="Folder name"
              className="min-w-0 flex-1 rounded-[7px] border border-teal bg-white px-2 py-1 text-[12.5px] outline-none"
            />
            <button type="submit" disabled={pending} className="text-teal disabled:opacity-50" aria-label="Create folder">
              <CheckIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                setNewName('');
                setNewOpen(false);
              }}
              className="text-text-faint"
              aria-label="Cancel new folder"
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
            <PlusIcon size={14} /> New folder
          </button>
        )}

        <div className="mt-3 rounded-[9px] bg-[#F6F0E7] px-[11px] py-[9px] text-[10.5px] leading-[1.5] text-[#B0A89E]">
          Folders only hold links to bank resources. To add something new,{' '}
          <b className="text-neutral-600">upload it to the bank</b>.
        </div>
      </div>
    </aside>
  );
}
