'use client';

// The slim top bar shared by every worksheet exercise block: a drag handle, the
// "Exercise N" label, a kind badge (pink "Free block" or teal "From bank · …"),
// and the right-aligned action icons (delete, plus an optional duplicate). Drag
// listeners come from the parent sortable wrapper and attach to the ⠿ handle.

import type { HTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';

export interface BlockBadge {
  text: string;
  variant: 'free' | 'bank';
}

function DuplicateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8178" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B62A5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

const ACTION_STYLE = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 5,
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
} as const;

export function BlockBar({
  badge,
  onDelete,
  onDuplicate,
  dragHandleProps,
}: {
  badge: BlockBadge;
  onDelete: () => void;
  onDuplicate?: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
}) {
  const t = useTranslations('worksheet');
  const isFree = badge.variant === 'free';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: '#FBF8F3',
        borderBottom: '1px solid #EFE8DD',
      }}
    >
      <span
        {...dragHandleProps}
        title={t('block.dragToReorder')}
        style={{ color: '#C7BCAE', cursor: 'grab', letterSpacing: '-2px', touchAction: 'none' }}
      >
        ⠿
      </span>
      <span
        style={
          isFree
            ? {
                fontSize: 10,
                fontWeight: 700,
                color: '#B62A5C',
                background: '#FBF2F5',
                border: '1px solid #F1D8E1',
                borderRadius: 5,
                padding: '2px 7px',
              }
            : {
                fontSize: 10,
                fontWeight: 700,
                color: '#1F7A6C',
                background: '#E4F0ED',
                border: '1px solid #CFE6E0',
                borderRadius: 5,
                padding: '2px 7px',
              }
        }
      >
        {badge.text}
      </span>
      <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 2 }}>
        {onDuplicate ? (
          <button type="button" title={t('block.duplicate')} onClick={onDuplicate} style={ACTION_STYLE}>
            <DuplicateIcon />
          </button>
        ) : null}
        <button type="button" title={t('block.delete')} onClick={onDelete} style={ACTION_STYLE}>
          <TrashIcon />
        </button>
      </span>
    </div>
  );
}
