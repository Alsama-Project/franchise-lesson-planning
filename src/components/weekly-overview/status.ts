// Presentation metadata for the five slot statuses — the single place copy,
// glyph and colour-token classes live, shared by the Calendar and Status views.
// Copy is the approved wording: "Needs Review" (not "Returned"), "Not started"
// for the derived empty state. Colours use the status-* tokens from globals.css,
// which mirror the design handoff exactly (see README "Status colours").

import type { SlotStatus } from '@/types/weekly-overview';

export interface StatusMeta {
  /** Display label for the chip and column heading. */
  label: string;
  /** Leading glyph — filled for real statuses, hollow ring for "Not started". */
  glyph: '●' | '○';
  /** Badge classes: status fg text + status tint background (flat, no border). */
  badge: string;
  /** Just the foreground text-colour class (for column headings, etc.). */
  text: string;
  /** Border-colour class in the status tint — the 2px column bottom rule. */
  rule: string;
}

export const STATUS_META: Record<SlotStatus, StatusMeta> = {
  not_started: {
    label: 'Not started',
    glyph: '○',
    badge: 'text-status-idle bg-status-idle-bg',
    text: 'text-status-idle',
    rule: 'border-status-idle-bg',
  },
  in_progress: {
    label: 'In progress',
    glyph: '●',
    badge: 'text-status-progress bg-status-progress-bg',
    text: 'text-status-progress',
    rule: 'border-status-progress-bg',
  },
  submitted: {
    label: 'Submitted',
    glyph: '●',
    badge: 'text-status-submitted bg-status-submitted-bg',
    text: 'text-status-submitted',
    rule: 'border-status-submitted-bg',
  },
  needs_review: {
    label: 'Needs Review',
    glyph: '●',
    badge: 'text-status-review bg-status-review-bg',
    text: 'text-status-review',
    rule: 'border-status-review-bg',
  },
  approved: {
    label: 'Approved',
    glyph: '●',
    badge: 'text-status-approved bg-status-approved-bg',
    text: 'text-status-approved',
    rule: 'border-status-approved-bg',
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
