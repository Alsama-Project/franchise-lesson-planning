'use server';

// Server Actions for the standalone Resources tab's "Add to a lesson" flow.
//
// The teacher isn't inside the editor here, so they first pick which DRAFT lesson
// to add the resource to. "Draft" = `in_progress` (not yet submitted/approved),
// and only the lesson's creator may edit it (the creator-edit rule), so both
// actions are scoped to `created_by = me AND status = 'in_progress'`. RLS already
// permits the creator to read/update their own plans; we additionally enforce the
// draft + ownership guard here so a stale/forged id can't append to anything else.

import { createClient } from '@/lib/supabase/server';
import { recordUsage } from '@/lib/resources/usage';
import { appendBlock, parseWorksheet } from '@/lib/editor/worksheet';
import { isWorksheetV3 } from '@/lib/editor/worksheet-migrate';
import { findDegradedImage } from '@/lib/editor/worksheet-guard';
import type { PlanScope, PlanStatus, WorksheetFreeBlock, WorksheetV3 } from '@/types/lesson';

/** Enough to identify a draft lesson in the picker. */
export interface DraftLessonSummary {
  id: string;
  /** Primary line, e.g. "Year 3". */
  title: string;
  /** Secondary line: subject · objective/curriculum slot. */
  subtitle: string;
  scope: PlanScope;
  /** ISO timestamp of the last edit (the list is ordered by this, newest first). */
  updatedAt: string;
}

interface DraftRow {
  id: string;
  year: number | null;
  scope: PlanScope;
  subject_id: string | null;
  curriculum_lesson_id: string;
  status: PlanStatus;
  smartt_objective: string | null;
  updated_at: string;
}

function truncate(text: string, max = 80): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * The teacher's in-progress draft lessons, most-recently-edited first, shaped for
 * the lesson picker. Empty array when they have none.
 */
export async function listDraftLessonsAction(): Promise<DraftLessonSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('lesson_plans')
    .select('id, year, scope, subject_id, curriculum_lesson_id, status, smartt_objective, updated_at')
    .eq('created_by', user.id)
    .eq('status', 'in_progress')
    .is('deleted_at', null) // trashed drafts (0048) never appear in the picker
    .order('updated_at', { ascending: false });

  if (error || !data) return [];
  const rows = data as DraftRow[];
  if (rows.length === 0) return [];

  // Resolve subject names in one round-trip.
  const subjectIds = [...new Set(rows.map((r) => r.subject_id).filter((id): id is string => !!id))];
  const subjectNames = new Map<string, string>();
  if (subjectIds.length > 0) {
    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, name')
      .in('id', subjectIds);
    for (const s of (subjects ?? []) as Array<{ id: string; name: string }>) {
      subjectNames.set(s.id, s.name);
    }
  }

  return rows.map((r) => {
    const subject = r.subject_id ? subjectNames.get(r.subject_id) ?? null : null;
    const slot = r.smartt_objective ? truncate(r.smartt_objective) : r.curriculum_lesson_id;
    const subtitle = [subject, slot].filter(Boolean).join(' · ') || 'Untitled draft';
    return {
      id: r.id,
      title: r.year != null ? `Year ${r.year}` : 'Lesson',
      subtitle,
      scope: r.scope,
      updatedAt: r.updated_at,
    };
  });
}

export interface AppendToLessonResult {
  ok: boolean;
  /** A short label of the lesson the block(s) landed in, for the confirmation toast. */
  lessonLabel?: string;
  error?: string;
}

/**
 * Append (client-built) free block(s) to a draft lesson's worksheet and record the
 * resource use. Guarded to the creator's own in-progress drafts. Accepts an array
 * because a single resource can expand to several blocks (e.g. a multi-page PDF).
 */
export async function appendResourceBlocksToLessonAction(
  lessonPlanId: string,
  resourceId: string,
  blocks: WorksheetFreeBlock[],
): Promise<AppendToLessonResult> {
  if (blocks.length === 0) return { ok: false, error: 'Nothing to add.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  const { data, error } = await supabase
    .from('lesson_plans')
    .select('id, worksheet, created_by, status, year')
    .eq('id', lessonPlanId)
    .is('deleted_at', null) // can't append to a trashed lesson (0048)
    .maybeSingle();

  const row = data as
    | { id: string; worksheet: unknown; created_by: string; status: PlanStatus; year: number | null }
    | null;
  if (error || !row) return { ok: false, error: 'Lesson not found.' };
  if (row.created_by !== user.id || row.status !== 'in_progress') {
    return { ok: false, error: 'You can only add to your own draft lessons.' };
  }

  // Branch on the stored envelope's version. A v3 worksheet is a single continuous
  // tiptap document; routing it through parseWorksheet would run migrateV3ToV2 and
  // silently downgrade the saved document to one v2 Free block, losing the tiptap
  // document (67 live plans are v3). Instead, append each resource block's flowing
  // nodes — the same heading (h2 title) + body node shapes the document editor
  // produces — straight onto doc.content and save the v3 envelope back. v2 rows keep
  // the unchanged block-append path.
  let worksheet: WorksheetV3 | ReturnType<typeof parseWorksheet>;
  if (isWorksheetV3(row.worksheet)) {
    const doc = row.worksheet.doc;
    const existing = Array.isArray(doc.content) ? doc.content : [];
    const appended = blocks.flatMap((b) =>
      b.doc && Array.isArray(b.doc.content) ? b.doc.content : [],
    );
    worksheet = { version: 3, doc: { ...doc, type: 'doc', content: [...existing, ...appended] } };
  } else {
    let v2 = parseWorksheet(row.worksheet);
    for (const block of blocks) v2 = appendBlock(v2, block);
    worksheet = v2;
  }

  // Same write-boundary guard as saveWorksheet: this action writes the tiptap doc
  // column DIRECTLY (server-side, never through the editor schema), so a degraded
  // image node in the existing doc or the appended blocks would be persisted verbatim.
  // Refuse rather than silently write a worksheet whose image renders nothing.
  const degraded = findDegradedImage(worksheet);
  if (degraded) {
    console.error(
      `appendResourceBlocksToLessonAction: refused to persist a degraded worksheet for plan ` +
        `${lessonPlanId} — image node has ${degraded.reason}. Sample: ${degraded.sample}`,
    );
    return { ok: false, error: 'Could not add to the lesson: an image lost its data.' };
  }

  const { error: updateError } = await supabase
    .from('lesson_plans')
    .update({ worksheet })
    .eq('id', lessonPlanId);
  if (updateError) return { ok: false, error: updateError.message };

  // Record the use (popularity + the teacher's "Most used"); non-fatal.
  await recordUsage(resourceId, lessonPlanId);

  return { ok: true, lessonLabel: row.year != null ? `Year ${row.year}` : 'your lesson' };
}
