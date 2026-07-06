'use server';

// Server actions behind the inline coordinator-review annotation layer (migration
// 0045). Every write goes through the auth'd, RLS-scoped client, so authorisation
// rides on the plan_annotations / plan_annotation_replies policies — no permission
// logic is re-implemented here beyond friendly guards and the column-scope + status
// gates that Postgres RLS can't express cleanly:
//
//   • createAnnotation   — coordinator/admin (RLS pa_coord_insert).
//   • addAnnotationReply — any member        (RLS par_member_insert; plan_id is
//                          stamped from the parent by the DB trigger, not the client).
//   • setAnnotationResolved — any member; writes only `resolved` (comments).
//   • decideSuggestion   — the plan's author (or admin), only while the plan is
//                          editable; on accept, applies the change to blocks in the
//                          SAME action and stamps status/decided_*.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth';
import type { Block, TeachingPhase } from '@/types/lesson';
import type {
  AnchorType,
  Annotation,
  AnnotationKind,
  AnnotationRole,
  SuggestionShape,
} from '@/types/annotation';

export interface ActionResult {
  ok: boolean;
  /** Short, non-user-facing code; the client maps it to an i18n message. */
  error?: 'empty' | 'invalid' | 'locked' | 'forbidden' | 'failed';
}

export interface CreateAnnotationInput {
  kind: AnnotationKind;
  anchorType: AnchorType;
  phaseRef?: string | null;
  /** For a `text` phase_description suggestion, the field name (`teacher_does` /
   *  `students_do`); for a worksheet anchor, the worksheet block id. Null otherwise. */
  blockRef?: string | null;
  /** `dur` / `enum` (structured, Part A) or `text` (inline prose, Part B). A comment
   *  sends none. */
  suggestionShape?: SuggestionShape | null;
  fromValue?: string | null;
  toValue?: string | null;
  note: string;
}

/** The two plain-text fields a `phase_description` text suggestion can target. */
const TEXT_FIELDS: ReadonlySet<string> = new Set(['teacher_does', 'students_do']);

export interface CreateAnnotationResult extends ActionResult {
  annotation?: Annotation;
}

const PHASES: ReadonlySet<string> = new Set<TeachingPhase>(['i_do', 'we_do', 'you_do']);

/** Author role on this plan: its creator is the teacher, anyone else a coordinator. */
function roleFor(authorId: string, teacherId: string): AnnotationRole {
  return authorId === teacherId ? 'teacher' : 'coordinator';
}

/**
 * Author an anchored comment or a dur/enum suggestion. Coordinator/admin only
 * (enforced by RLS). Returns the persisted annotation (name + role resolved) so the
 * pane can reconcile its optimistic add without a full reload.
 */
export async function createAnnotation(
  planId: string,
  input: CreateAnnotationInput,
): Promise<CreateAnnotationResult> {
  const note = input.note.trim();
  if (!note) return { ok: false, error: 'empty' };

  const isSuggestion = input.kind === 'suggestion';
  if (isSuggestion) {
    const shape = input.suggestionShape;
    if (shape !== 'dur' && shape !== 'enum' && shape !== 'text') {
      return { ok: false, error: 'invalid' };
    }
    if (input.fromValue == null || input.toValue == null) {
      return { ok: false, error: 'invalid' };
    }
    if (shape === 'dur' || shape === 'enum') {
      // Structured: anchored to a phase (block type).
      if (!input.phaseRef) return { ok: false, error: 'invalid' };
      if (shape === 'enum' && !PHASES.has(input.toValue)) return { ok: false, error: 'invalid' };
      if (shape === 'dur' && !Number.isFinite(Number(input.toValue))) return { ok: false, error: 'invalid' };
    } else {
      // Prose (Part B): objective (plain column) or a phase description field.
      if (input.anchorType !== 'objective' && input.anchorType !== 'phase_description') {
        return { ok: false, error: 'invalid' };
      }
      if (input.anchorType === 'phase_description') {
        if (!input.phaseRef || !input.blockRef || !TEXT_FIELDS.has(input.blockRef)) {
          return { ok: false, error: 'invalid' };
        }
      }
      // No empty diff: the proposal must differ from the original (trim-insensitive).
      if (input.toValue.trim() === input.fromValue.trim()) return { ok: false, error: 'invalid' };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('plan_annotations')
    .insert({
      plan_id: planId,
      kind: input.kind,
      anchor_type: input.anchorType,
      phase_ref: input.phaseRef ?? null,
      block_ref: input.blockRef ?? null,
      suggestion_shape: isSuggestion ? input.suggestionShape : null,
      from_value: isSuggestion ? input.fromValue : null,
      to_value: isSuggestion ? input.toValue : null,
      note,
    })
    .select(
      `id, plan_id, author_id, kind, anchor_type, phase_ref, block_ref,
       suggestion_shape, from_value, to_value, note, status, resolved,
       decided_by, decided_at, created_at`,
    )
    .maybeSingle();

  if (error || !data) return { ok: false, error: 'failed' };
  const row = data as Record<string, unknown> & { author_id: string };

  // Resolve the author's own display name (they are the signed-in coordinator).
  let authorName = '';
  let teacherId = '';
  if (user) {
    const [{ data: profile }, { data: plan }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase.from('lesson_plans').select('created_by').eq('id', planId).maybeSingle(),
    ]);
    authorName = (profile as { full_name?: string | null } | null)?.full_name ?? '';
    teacherId = (plan as { created_by?: string } | null)?.created_by ?? '';
  }

  revalidatePath(`/plan/${planId}/view`);

  return {
    ok: true,
    annotation: {
      id: row.id as string,
      planId: row.plan_id as string,
      kind: row.kind as AnnotationKind,
      anchorType: row.anchor_type as AnchorType,
      phaseRef: (row.phase_ref as string | null) ?? null,
      blockRef: (row.block_ref as string | null) ?? null,
      suggestionShape: (row.suggestion_shape as Annotation['suggestionShape']) ?? null,
      fromValue: (row.from_value as string | null) ?? null,
      toValue: (row.to_value as string | null) ?? null,
      note: row.note as string,
      status: row.status as Annotation['status'],
      resolved: row.resolved as boolean,
      decidedBy: (row.decided_by as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      createdAt: row.created_at as string,
      authorId: row.author_id,
      authorName,
      authorRole: roleFor(row.author_id, teacherId),
      replies: [],
    },
  };
}

/**
 * Reply to an annotation. Any member of the plan's space may reply (RLS). The row's
 * `plan_id` is stamped from the parent annotation by a DB BEFORE-INSERT trigger, so
 * the client neither supplies nor can spoof it.
 */
export async function addAnnotationReply(
  annotationId: string,
  body: string,
): Promise<ActionResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  const supabase = await createClient();

  // The plan_id we revalidate is read back from the row (trigger-stamped).
  const { data, error } = await supabase
    .from('plan_annotation_replies')
    .insert({ annotation_id: annotationId, body: trimmed })
    .select('plan_id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: 'failed' };
  const planId = (data as { plan_id: string }).plan_id;
  revalidatePath(`/plan/${planId}/view`);
  return { ok: true };
}

/**
 * Resolve or reopen an anchored comment. Any member may toggle it (the teacher
 * resolves what they've addressed; the coordinator resolves/undoes). Writes only
 * `resolved` — the column scope RLS can't express is enforced here.
 */
export async function setAnnotationResolved(
  annotationId: string,
  resolved: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('plan_annotations')
    .update({ resolved })
    .eq('id', annotationId)
    .eq('kind', 'comment')
    .select('plan_id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: 'failed' };
  const planId = (data as { plan_id: string }).plan_id;
  revalidatePath(`/plan/${planId}/view`);
  return { ok: true };
}

/**
 * Update a still-pending suggestion's proposed value — the inline "keep editing the
 * same field" path (suggesting mode). Only the suggestion's AUTHOR (the coordinator)
 * may revise their own proposal, and only while `pending`; `from_value` is NEVER
 * touched, so the baseline stays pinned to the teacher's original text and the diff
 * can't collapse. A no-op (proposed == original, trim-insensitive) is rejected — the
 * client deletes instead (see {@link deleteSuggestion}).
 */
export async function updateSuggestion(
  annotationId: string,
  toValue: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'forbidden' };

  const { data: annData } = await supabase
    .from('plan_annotations')
    .select('id, plan_id, author_id, kind, from_value, status')
    .eq('id', annotationId)
    .maybeSingle();
  const ann = annData as {
    plan_id: string;
    author_id: string;
    kind: string;
    from_value: string | null;
    status: string;
  } | null;
  if (!ann || ann.kind !== 'suggestion') return { ok: false, error: 'invalid' };
  if (ann.author_id !== user.id) return { ok: false, error: 'forbidden' };
  if (ann.status !== 'pending') return { ok: false, error: 'invalid' };
  if ((ann.from_value ?? '').trim() === toValue.trim()) return { ok: false, error: 'invalid' };

  const { error } = await supabase
    .from('plan_annotations')
    .update({ to_value: toValue })
    .eq('id', annotationId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: 'failed' };

  revalidatePath(`/plan/${ann.plan_id}/view`);
  return { ok: true };
}

/**
 * Withdraw a still-pending suggestion — the inline "edited back to the original"
 * path, so no empty diff lingers. Author-only, pending-only (RLS `pa_author_delete`,
 * migration 0046). If that policy isn't applied yet the delete is refused by RLS and
 * this returns `failed` (the suggestion simply remains) — non-fatal.
 */
export async function deleteSuggestion(annotationId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('plan_annotations')
    .delete()
    .eq('id', annotationId)
    .eq('status', 'pending')
    .select('plan_id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: 'failed' };
  const planId = (data as { plan_id: string }).plan_id;
  revalidatePath(`/plan/${planId}/view`);
  return { ok: true };
}

/**
 * Accept or reject a dur/enum/text suggestion. Only the plan's author (or an admin), and
 * only while the plan is editable (`needs_review` / `in_progress`). On ACCEPT the
 * change is applied to the plan's `blocks` JSONB in this same action:
 *   • dur  → set that block's `minutes` to the proposed value (the in-session total
 *            recomputes from it on the next render).
 *   • enum → set that block's `phase` (I/WE/YOU grouping) to the proposed value.
 *   • text → write `to_value` into the target: the `smartt_objective` column
 *            (anchor `objective`), or a block's `teacher_does` / `students_do`
 *            (anchor `phase_description`, field in `block_ref`) via the same blocks
 *            read-modify-write.
 * then the annotation is stamped accepted + decided_by/decided_at. On REJECT only
 * the stamp is written (no plan change). Applying the change BEFORE the stamp keeps a
 * partial failure recoverable: every apply sets an ABSOLUTE value, so a retry
 * re-applies the same value and then stamps.
 */
export async function decideSuggestion(
  annotationId: string,
  decision: 'accepted' | 'rejected',
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'forbidden' };

  // The suggestion, still pending.
  const { data: annData } = await supabase
    .from('plan_annotations')
    .select('id, plan_id, kind, anchor_type, suggestion_shape, phase_ref, block_ref, to_value, status')
    .eq('id', annotationId)
    .maybeSingle();
  const ann = annData as {
    id: string;
    plan_id: string;
    kind: string;
    anchor_type: string;
    suggestion_shape: string | null;
    phase_ref: string | null;
    block_ref: string | null;
    to_value: string | null;
    status: string;
  } | null;
  if (!ann || ann.kind !== 'suggestion') return { ok: false, error: 'invalid' };
  if (ann.status !== 'pending') return { ok: false, error: 'invalid' };
  if (ann.suggestion_shape !== 'dur' && ann.suggestion_shape !== 'enum' && ann.suggestion_shape !== 'text') {
    return { ok: false, error: 'invalid' };
  }

  // The plan: its author, its editability, and (for accept) its blocks.
  const { data: planData } = await supabase
    .from('lesson_plans')
    .select('id, created_by, status, blocks')
    .eq('id', ann.plan_id)
    .maybeSingle();
  const plan = planData as {
    id: string;
    created_by: string;
    status: string;
    blocks: Block[] | null;
  } | null;
  if (!plan) return { ok: false, error: 'forbidden' };

  // Only the author decides (or an admin). The coordinator sees "Awaiting teacher".
  if (plan.created_by !== user.id && !(await isAdmin())) {
    return { ok: false, error: 'forbidden' };
  }
  // Only while the plan is unlocked (submitted/approved are read-only).
  if (plan.status !== 'needs_review' && plan.status !== 'in_progress') {
    return { ok: false, error: 'locked' };
  }

  if (decision === 'accepted') {
    if (ann.to_value == null) return { ok: false, error: 'invalid' };

    // objective text → the plain smartt_objective column (no blocks touch).
    if (ann.suggestion_shape === 'text' && ann.anchor_type === 'objective') {
      const { error: objErr } = await supabase
        .from('lesson_plans')
        .update({ smartt_objective: ann.to_value })
        .eq('id', plan.id)
        .select('id')
        .maybeSingle();
      if (objErr) return { ok: false, error: 'failed' };
    } else {
      // dur / enum / phase_description text → the matched block in the blocks JSONB.
      const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
      const idx = blocks.findIndex((b) => b.type === ann.phase_ref);
      if (idx < 0) return { ok: false, error: 'invalid' };

      const next = blocks.map((b, i) => {
        if (i !== idx) return b;
        if (ann.suggestion_shape === 'dur') {
          const minutes = Number(ann.to_value);
          if (!Number.isFinite(minutes)) return b;
          return { ...b, minutes };
        }
        if (ann.suggestion_shape === 'enum') {
          if (!PHASES.has(ann.to_value as string)) return b;
          return { ...b, phase: ann.to_value as TeachingPhase };
        }
        // text → a description field named by block_ref.
        if (ann.block_ref !== 'teacher_does' && ann.block_ref !== 'students_do') return b;
        return { ...b, [ann.block_ref]: ann.to_value };
      });

      const { error: blockErr } = await supabase
        .from('lesson_plans')
        .update({ blocks: next })
        .eq('id', plan.id)
        .select('id')
        .maybeSingle();
      if (blockErr) return { ok: false, error: 'failed' };
    }
  }

  // Stamp the decision (guarded on still-pending so a double-accept is a no-op).
  const { data: stamped, error: stampErr } = await supabase
    .from('plan_annotations')
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', annotationId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (stampErr) return { ok: false, error: 'failed' };
  // stamped null means someone else decided it first — the plan change (if any) was
  // idempotent, so treat it as success.

  revalidatePath(`/plan/${ann.plan_id}/view`);
  void stamped;
  return { ok: true };
}
