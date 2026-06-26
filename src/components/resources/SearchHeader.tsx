'use client';

// The Resource Bank's search header: a large search field, the teal "Upload a
// resource" button, and the row of active filter chips with "Clear all".

import { useTranslations } from 'next-intl';
import { SearchIcon, PlusIcon } from '@/components/resources/icons';

export interface FilterChip {
  key: string;
  label: string;
  c: string;
  bg: string;
  xColor: string;
  onRemove: () => void;
}

interface SearchHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  chips: FilterChip[];
  onClearAll: () => void;
  onUpload: () => void;
}

export function SearchHeader({ query, onQueryChange, chips, onClearAll, onUpload }: SearchHeaderProps) {
  const t = useTranslations('resources');
  return (
    <div className="border-b border-border bg-surface px-8 py-5">
      <div className="flex flex-wrap items-center gap-[14px]">
        <div className="relative min-w-[280px] max-w-[720px] flex-1">
          <SearchIcon
            size={19}
            className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-teal"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('bank.searchPlaceholder')}
            dir="auto"
            className="w-full rounded-[12px] border-[1.5px] border-teal bg-surface-subtle py-3 ps-11 pe-4 text-[15px] text-ink outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onUpload}
          className="ms-auto inline-flex items-center gap-[7px] rounded-[9px] bg-teal px-[15px] py-[10px] text-[13px] font-semibold text-white hover:bg-[#1a6a5d]"
        >
          <PlusIcon size={15} strokeWidth={2.2} /> {t('bank.upload')}
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-[7px]">
          <span className="text-[12px] text-text-faint">{t('bank.filteringBy')}</span>
          {chips.map((chip) => (
            <span
              key={chip.key}
              dir="auto"
              className="inline-flex items-center gap-[6px] rounded-full px-[11px] py-1 text-[12px] font-semibold"
              style={{ color: chip.c, background: chip.bg }}
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={t('bank.removeFilter', { label: chip.label })}
                style={{ color: chip.xColor }}
                className="cursor-pointer"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="text-[12px] font-medium text-pink"
          >
            {t('bank.clearAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
