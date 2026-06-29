// Per-kind visual styling for lifecycle events in the Activity pane — the dot
// fill, the label/icon colour, and the icon stroke paths. Values are ported
// verbatim from the authoritative "Activity Pane" Claude Design export; where a
// colour equals an existing design token (teal #1F7A6C / deep teal #186155) the
// token's value is reused rather than a new hex invented.
//
// The export depicts five visual kinds (submitted / returned / resubmitted /
// approved / reopened). The recorded data (migration 0027 `plan_events`) only
// distinguishes submitted / returned / approved / reopened / undone — a
// RESUBMIT is stored as a plain `submitted` event. `computeDisplayKinds` recovers
// the export's distinction (a non-first `submitted` reads as a "resubmitted"), and
// `undone` — which the export does not depict — is given the neutral reopened
// palette so it stays consistent with the rest of the rail.

import type { PlanEvent, PlanEventType } from '@/lib/review/timeline';

/** The visual kinds the pane renders — the recorded types plus `resubmitted`,
 *  which is derived (a later `submitted`) rather than stored. */
export type EventDisplayKind = PlanEventType | 'resubmitted';

export interface EventStyle {
  /** The dot's fill. */
  dotBg: string;
  /** The label text + icon stroke colour. */
  color: string;
  /** SVG path `d` strings for the dot's icon (24×24 viewBox). */
  paths: string[];
}

/** The export's `EV` map, keyed by display kind. */
export const EVENT_STYLES: Record<EventDisplayKind, EventStyle> = {
  submitted: {
    dotBg: '#E7EDEA',
    color: '#5C6B66',
    paths: ['M12 19V5', 'M5 12l7-7 7 7'],
  },
  returned: {
    dotBg: '#F6ECDA',
    color: '#9A6312',
    paths: ['M9 14L4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-1'],
  },
  resubmitted: {
    dotBg: '#E7EDEA',
    color: '#5C6B66',
    paths: [
      'M23 4v6h-6',
      'M1 20v-6h6',
      'M3.5 9a9 9 0 0 1 14.9-3.4L23 10',
      'M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
    ],
  },
  approved: {
    dotBg: '#E2EFEB',
    color: '#186155',
    paths: ['M20 6L9 17l-5-5'],
  },
  reopened: {
    dotBg: '#F1ECE3',
    color: '#8A7F70',
    paths: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z'],
  },
  // Not depicted in the export (approval reverted to `submitted`). Reuses the
  // neutral reopened palette with a rotate-back glyph so it reads as an undo.
  undone: {
    dotBg: '#F1ECE3',
    color: '#8A7F70',
    paths: ['M1 4v6h6', 'M3.5 15a9 9 0 1 0 .9-7.4L1 10'],
  },
};

/**
 * Map each event's id to the kind it should RENDER as. Events are scanned oldest
 * → newest so that the first `submitted` reads as "Submitted for review" and every
 * later one as "Resubmitted", recovering the export's distinction from data that
 * stores both as `submitted`. All other types render as themselves.
 */
export function computeDisplayKinds(events: PlanEvent[]): Map<string, EventDisplayKind> {
  const byTime = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const kinds = new Map<string, EventDisplayKind>();
  let seenSubmitted = false;
  for (const e of byTime) {
    if (e.type === 'submitted') {
      kinds.set(e.id, seenSubmitted ? 'resubmitted' : 'submitted');
      seenSubmitted = true;
    } else {
      kinds.set(e.id, e.type);
    }
  }
  return kinds;
}
