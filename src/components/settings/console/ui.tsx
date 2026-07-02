'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

// Shared presentational primitives for the settings console, ported from the
// design export. Colour tokens follow the mockup exactly (see the brief): tabs,
// table chrome, the pink input block, role pills, and the destructive/amber
// accents.

/** A bordered section card (border #DCD2C4). */
export function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[13px] border border-[#DCD2C4] bg-white', className)}>
      {title || action ? (
        <div className="flex items-center justify-between gap-3 border-b border-[#F0EAE1] px-[18px] py-[13px]">
          <h2 className="text-[15px] font-semibold text-[#2A2422]">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Uppercase column-header label (#A79E94). */
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-[18px] py-[10px] text-start text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A79E94]',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  dir,
}: {
  children?: ReactNode;
  className?: string;
  /** Pass `auto` for cells holding user/curriculum data so RTL names orient themselves. */
  dir?: 'auto' | 'ltr' | 'rtl';
}) {
  return (
    <td dir={dir} className={cn('px-[18px] py-[13px] align-middle text-[13.5px]', className)}>
      {children}
    </td>
  );
}

/** Table with row dividers (#F0EAE1). */
export function ConsoleTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="border-b border-[#F0EAE1]">{head}</thead>
        <tbody className="divide-y divide-[#F0EAE1]">{children}</tbody>
      </table>
    </div>
  );
}

export type RoleKind = 'coordinator' | 'teacher' | 'no-access';

const ROLE_STYLE: Record<RoleKind, { bg: string; fg: string; key: string }> = {
  coordinator: { bg: '#E4F0ED', fg: '#186155', key: 'coordinator' },
  teacher: { bg: '#F3ECE2', fg: '#7A7068', key: 'teacher' },
  'no-access': { bg: '#F6ECDA', fg: '#B0651E', key: 'noAccess' },
};

export function RolePill({ kind }: { kind: RoleKind }) {
  const t = useTranslations('settings');
  const s = ROLE_STYLE[kind];
  return (
    <span
      className="inline-flex items-center rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {t(`roles.${s.key}`)}
    </span>
  );
}

/** Status chip for Active / Archived rows. */
export function StatusBadge({ archived }: { archived: boolean }) {
  const t = useTranslations('settings');
  return archived ? (
    <span
      className="inline-flex items-center rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold"
      style={{ background: '#F6ECDA', color: '#B0651E' }}
    >
      {t('status.archived')}
    </span>
  ) : (
    <span
      className="inline-flex items-center rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold"
      style={{ background: '#E4F0ED', color: '#186155' }}
    >
      {t('status.active')}
    </span>
  );
}

/** Initials avatar (teal), matching the shell's avatar. */
export function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length === 0
      ? '?'
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1F7A6C] text-[11px] font-bold text-white">
      {initials}
    </span>
  );
}

/** A pink input block (bg #FBF2F5 / border #F1D8E1) holding a white field. */
export function PinkField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={cn('rounded-[10px] border border-[#F1D8E1] bg-[#FBF2F5] p-[5px]', className)}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="w-full rounded-[7px] border border-[#ECD3DE] bg-white px-[11px] py-[8px] text-[13.5px] text-[#2A2422] outline-none focus:border-[#D9A6BC]"
      />
    </div>
  );
}

/** Teal primary button. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-[9px] bg-[#1F7A6C] px-[15px] py-[8px] text-[13px] font-semibold text-white transition-colors hover:bg-[#1a6a5d] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Subtle (ghost) button. */
export function GhostButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'teal' | 'red' | 'amber';
}) {
  const color =
    tone === 'teal'
      ? 'text-[#186155]'
      : tone === 'red'
        ? 'text-[#B23A2E]'
        : tone === 'amber'
          ? 'text-[#B0651E]'
          : 'text-[#7A7068]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'text-[12.5px] font-semibold transition-opacity hover:opacity-70 disabled:opacity-40',
        color,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A small on/off switch in the console's control palette (teal #1F7A6C on,
 * neutral #D8CFC2 off — matching the checkbox row), not the semantic status
 * system. When `readOnly` it renders as a static, non-interactive state (used for
 * an implied-on control); otherwise it toggles on click and is disabled while a
 * write is in flight.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  readOnly,
  'aria-label': ariaLabel,
  title,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  readOnly?: boolean;
  'aria-label'?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-readonly={readOnly || undefined}
      title={title}
      disabled={disabled || readOnly}
      onClick={readOnly ? undefined : () => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-[#1F7A6C]' : 'bg-[#D8CFC2]',
        readOnly ? 'cursor-default opacity-90' : 'disabled:opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block size-[14px] rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[17px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

/** A modal dialog over a dimmed page. */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#423B35]/45 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className="max-h-[88vh] w-full overflow-y-auto rounded-[15px] border border-[#DCD2C4] bg-white p-[22px] shadow-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="mb-[16px] text-[16px] font-semibold text-[#2A2422]">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
      {children}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mt-[10px] text-[12.5px] font-medium text-[#B23A2E]">{children}</p>;
}

/** Empty-state block inside a card. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-[18px] py-[34px] text-center text-[13px] text-[#A79E94]">{children}</div>;
}
