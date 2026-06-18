// Presentation metadata for the five slot statuses — the single place copy,
// glyph and colour-token classes live, shared by the Calendar and Status views.
// Copy is the approved wording: "Needs Review" (not "Returned"), "Not started"
// for the derived empty state. Colours use the status-* tokens from globals.css.

import type { SlotStatus } from '@/types/weekly-overview';

export interface StatusMeta {
  /** Display label for the chip and column heading. */
  label: string;
  /** Leading glyph — filled for real statuses, hollow ring for "Not started". */
  glyph: '●' | '○';
  /** Chip classes: text / background / border tokens. */
  chip: string;
  /** Just the foreground text-colour class (for column headings, etc.). */
  text: string;
  /** Card border class for the Status board. */
  cardBorder: string;
}

export const STATUS_META: Record<SlotStatus, StatusMeta> = {
  not_started: {
    label: 'Not started',
    glyph: '○',
    chip: 'text-status-idle bg-status-idle-bg border-status-idle-border',
    text: 'text-status-idle',
    cardBorder: 'border-border',
  },
  in_progress: {
    label: 'In progress',
    glyph: '●',
    chip: 'text-status-progress bg-status-progress-bg border-status-progress-border',
    text: 'text-status-progress',
    cardBorder: 'border-status-progress-border',
  },
  submitted: {
    label: 'Submitted',
    glyph: '●',
    chip: 'text-status-submitted bg-status-submitted-bg border-status-submitted-border',
    text: 'text-status-submitted',
    cardBorder: 'border-status-submitted-border',
  },
  needs_review: {
    label: 'Needs Review',
    glyph: '●',
    chip: 'text-status-review bg-status-review-bg border-status-review-border',
    text: 'text-status-review',
    cardBorder: 'border-status-review-border',
  },
  approved: {
    label: 'Approved',
    glyph: '●',
    chip: 'text-status-approved bg-status-approved-bg border-status-approved-border',
    text: 'text-status-approved',
    cardBorder: 'border-status-approved-border',
  },
};

/** The order the Status board lays its columns out (left → right). */
export const STATUS_COLUMN_ORDER: SlotStatus[] = [
  'not_started',
  'in_progress',
  'submitted',
  'needs_review',
  'approved',
];
