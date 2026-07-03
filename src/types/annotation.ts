// Domain model for the inline coordinator-review annotation layer (migration
// 0045). Postgres can't enforce JSONB/row shapes, so these types mirror the
// plan_annotations / plan_annotation_replies schema by hand — keep them in sync.
//
// Part A ships comments + dur/enum suggestions + replies. The `text` suggestion
// shape and the anchor_quote/prefix/suffix span fields are declared here but stay
// null until Part B (tracked prose edits) makes them live.

/** A row is either an anchored comment or a structured suggestion. */
export type AnnotationKind = 'comment' | 'suggestion';

/**
 * Where an annotation attaches on the plan:
 *  - `objective`        — the SMARTT objective card.
 *  - `phase`            — a whole phase/block row (a plain "comment on this line").
 *  - `phase_duration`   — a phase's duration cell (a `dur` suggestion's anchor).
 *  - `phase_enum`       — a phase's I/WE/YOU grouping tag (an `enum` suggestion's anchor).
 *  - `phase_description` — a phase's description text (Part B text-suggestion target).
 *  - `worksheet_block`  — a worksheet block (Part A anchors at the worksheet level).
 *  - `general`          — whole-plan feedback (retired plan_comments land here).
 */
export type AnchorType =
  | 'objective'
  | 'phase'
  | 'phase_description'
  | 'phase_duration'
  | 'phase_enum'
  | 'worksheet_block'
  | 'general';

/** A suggestion proposes a duration change (`dur`), a grouping change (`enum`), or
 *  a prose edit (`text`, Part B). Null for comments. */
export type SuggestionShape = 'dur' | 'enum' | 'text';

/** A suggestion's lifecycle. Comments stay `pending` and use `resolved` instead. */
export type AnnotationStatus = 'pending' | 'accepted' | 'rejected';

/** The author's role on this plan, derived from whether they are its creator. */
export type AnnotationRole = 'coordinator' | 'teacher';

/** A threaded reply under an annotation (client-safe, name + role resolved). */
export interface AnnotationReply {
  id: string;
  annotationId: string;
  authorId: string;
  authorName: string;
  authorRole: AnnotationRole;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** One annotation with its author resolved and its replies attached. */
export interface Annotation {
  id: string;
  planId: string;
  kind: AnnotationKind;

  anchorType: AnchorType;
  /** block.type for phase* anchors; null otherwise. */
  phaseRef: string | null;
  /** worksheet block id for worksheet_block; null otherwise. */
  blockRef: string | null;

  suggestionShape: SuggestionShape | null;
  /** dur/enum: the current value (e.g. "10", "you_do"); null for comments. */
  fromValue: string | null;
  /** dur/enum: the proposed value; null for comments. */
  toValue: string | null;

  note: string;
  status: AnnotationStatus;
  resolved: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;

  authorId: string;
  authorName: string;
  authorRole: AnnotationRole;

  replies: AnnotationReply[];
}

/** The two structured (non-prose) suggestion shapes a coordinator can author in
 *  Part A — the accept path applies these to the plan's blocks. */
export type StructuredSuggestionShape = 'dur' | 'enum';
