'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { PlanOwner } from '@/types/weekly-overview';

/** Sentinel value for the unfiltered (default) state. */
export const EVERYONE = 'everyone';

/**
 * The "Everyone" people dropdown — filters the week's plans by owner (created_by).
 * Lists every owner who has a plan in the loaded week, plus the default
 * "Everyone". A pure view filter over already-loaded data (no re-fetch).
 */
export function PeopleFilter({
  owners,
  value,
  onChange,
}: {
  owners: PlanOwner[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const label = value === EVERYONE ? 'Everyone' : owners.find((o) => o.id === value)?.name ?? 'Everyone';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-[7px] rounded-[9px] border border-border-strong bg-surface px-[12px] py-[8px] text-[12.5px] font-semibold text-neutral-900 transition-colors hover:bg-surface-subtle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8178" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19a6 6 0 0 1 12 0M16 7a3 3 0 0 1 0 6M21 19a6 6 0 0 0-4-5.6" />
        </svg>
        {label}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A79E94" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-[4px] max-h-[260px] min-w-[180px] overflow-y-auto rounded-[10px] border border-border bg-surface py-[4px] shadow-card">
          <Option
            label="Everyone"
            active={value === EVERYONE}
            onClick={() => {
              onChange(EVERYONE);
              setOpen(false);
            }}
          />
          {owners.map((o) => (
            <Option
              key={o.id}
              label={o.name}
              active={value === o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Option({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full px-[12px] py-[7px] text-left text-[12.5px] transition-colors hover:bg-surface-subtle',
        active ? 'font-semibold text-teal-deep' : 'text-neutral-900',
      )}
    >
      {label}
    </button>
  );
}
