// Shared, client-safe model for the plan activity timeline: the chronological
// stream that interleaves coordinator→teacher comments (plan_comments) with the
// plan's lifecycle events (plan_events — submitted / approved / returned / reopened
// / undone). The server fetch lives in `./comments` (server-only); this module
// holds only the event type + the pure merge so both the coordinator review
// sidebar and the teacher's read-only sidebar can render the same stream.

import type { PlanComment } from './comments';

/** Mirror of the `plan_event_type` enum (migration 0027). */
export type PlanEventType = 'submitted' | 'approved' | 'returned' | 'reopened' | 'undone';

/** One recorded lifecycle transition, with the user who made it. */
export interface PlanEvent {
  id: string;
  type: PlanEventType;
  /** ISO timestamp (`created_at`). */
  createdAt: string;
  /** The acting user's id; null only for rows whose actor could not be resolved. */
  actorId: string | null;
  /** The actor's display name, or '' when RLS hides it / it is unknown. */
  actorName: string;
}

/** A single row in the merged timeline — either a comment or a lifecycle event. */
export type TimelineItem =
  | { kind: 'comment'; at: string; id: string; comment: PlanComment }
  | { kind: 'event'; at: string; id: string; event: PlanEvent };

/**
 * Merge comments and events into one chronological stream (oldest → newest).
 * ISO timestamps sort lexicographically, so a string compare on `created_at`
 * orders them correctly; ties keep a stable comment-before-event order (comments
 * are listed first in the source array).
 */
export function mergeTimeline(comments: PlanComment[], events: PlanEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...comments.map((c): TimelineItem => ({ kind: 'comment', at: c.createdAt, id: `c:${c.id}`, comment: c })),
    ...events.map((e): TimelineItem => ({ kind: 'event', at: e.createdAt, id: `e:${e.id}`, event: e })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}
