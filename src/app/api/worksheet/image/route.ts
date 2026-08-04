// POST /api/worksheet/image — generate (or reuse) one worksheet image for a slot.
//
// Backend-only endpoint. It validates the slot against the plan's
// worksheet_exercise.image_slots, composes the image prompt from the layered AI
// context stack (role → layers → IMAGE FLOOR), generates with OpenAI, uploads the
// returned BYTES to the private 'resources' bucket under the 'worksheet-images/'
// prefix, and records the image + its binding to the (exercise, slot). It NEVER
// persists an OpenAI-hosted URL (those expire) — only the object path. It only READS
// worksheet_exercise; it never writes it, image_slots, slot status, or storage_path
// on the slot (the UI workstream wires the response back).
//
// Everything runs through the auth'd, RLS-scoped server client — never the
// service-role key. Both backing tables (worksheet_image, worksheet_image_use) are
// APPEND-ONLY: "replace" (regenerate / rebind) is a fresh INSERT, and the newest
// non-blocked row wins on read.
//
// Response contract (success): { slot_id, storage_path }. An unknown slot 404s (no
// generation, no ledger row). A slot whose whole-worksheet index is at/beyond the
// cap returns { slot_id, storage_path: null, refusal: 'cap_reached' } with 200 — a
// refusal for THAT slot only, not an error, never the whole worksheet. The
// kill-switch returns a clean 503.

import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { getImagesClient } from '@/lib/openai';
import { isWorksheetImagesEnabled } from '@/lib/ai/worksheet-images-flag';
import { composeContextStack, ContextStackError } from '@/lib/ai/context-stack';
import { STYLE_VERSION } from '@/lib/ai/image-floor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A real generation took 48s against the inherited platform default, and the
// prompt only grows once the real house-style document lands. Set to the plan
// ceiling (300s) so a slow-but-successful generation is never killed mid-flight.
export const maxDuration = 300;

const STORAGE_BUCKET = 'resources';
const STORAGE_PREFIX = 'worksheet-images';
const IMAGE_MODEL = 'gpt-image-1';

/** Shape accepted on the wire (validated before use). */
interface WorksheetImageBody {
  slot_id?: unknown;
  brief?: unknown;
  lesson_plan_id?: unknown;
  subject_id?: unknown;
  regenerate?: unknown;
}

/** Returns true for a present, non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Minimal LOCAL reader shapes for worksheet_exercise. The canonical image-slot
// contract (slot_id, subject, brief, status, storage_path) is owned by the exercise
// workstream, not this slice — we deliberately do NOT export a type or add one to
// src/types/, to avoid two workstreams racing to own it. All we read is `slot_id`.
interface SlotEntry {
  slot_id?: unknown;
}
interface ExerciseRow {
  id: string;
  position: number;
  image_slots: unknown;
}

/** One flattened slot in whole-worksheet order (exercises by position, each row's
 *  image_slots in array order). `index` is the slot's global position. */
interface FlatSlot {
  slotId: string;
  exerciseId: string;
}

/** Flatten a plan's exercises into the ordered slot list. Rows must already be
 *  ordered by position; each row's image_slots is walked in array order. */
function flattenSlots(rows: ExerciseRow[]): FlatSlot[] {
  const flat: FlatSlot[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.image_slots)) continue;
    for (const entry of row.image_slots as SlotEntry[]) {
      const slotId = entry?.slot_id;
      if (typeof slotId === 'string' && slotId.length > 0) {
        flat.push({ slotId, exerciseId: row.id });
      }
    }
  }
  return flat;
}

/**
 * Normalise a brief for the cache key: lowercase, strip punctuation (keep letters,
 * numbers, whitespace — Unicode-aware so Arabic briefs survive), collapse
 * whitespace, then drop any leading article(s). No stemming, no synonyms, no
 * embeddings — a deliberately literal fold so only trivially-equivalent briefs
 * collide.
 */
function normaliseBrief(brief: string): string {
  return brief
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:the|a|an)\s+)+/u, '');
}

/** Content-addressed key: sha256(normalise(brief) + ':' + STYLE_VERSION). */
function promptHash(brief: string): string {
  return createHash('sha256').update(`${normaliseBrief(brief)}:${STYLE_VERSION}`).digest('hex');
}

export async function POST(request: NextRequest) {
  // (a) Kill-switch — checked FIRST, before the OpenAI key is ever required, so a
  // disabled deploy returns a clean response instead of throwing on a missing key.
  if (!isWorksheetImagesEnabled()) {
    return NextResponse.json(
      { error: 'Worksheet image generation is disabled.' },
      { status: 503 },
    );
  }

  let body: WorksheetImageBody;
  try {
    body = (await request.json()) as WorksheetImageBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const requiredStrings: [keyof WorksheetImageBody, unknown][] = [
    ['slot_id', body.slot_id],
    ['brief', body.brief],
    ['lesson_plan_id', body.lesson_plan_id],
    ['subject_id', body.subject_id],
  ];
  for (const [field, value] of requiredStrings) {
    if (!isNonEmptyString(value)) {
      return NextResponse.json(
        { error: `Field "${field}" is required and must be a non-empty string.` },
        { status: 400 },
      );
    }
  }
  if (body.regenerate !== undefined && typeof body.regenerate !== 'boolean') {
    return NextResponse.json(
      { error: 'Field "regenerate" must be a boolean when provided.' },
      { status: 400 },
    );
  }

  const slotId = body.slot_id as string;
  const brief = body.brief as string;
  const lessonPlanId = body.lesson_plan_id as string;
  const subjectId = body.subject_id as string;
  const regenerate = body.regenerate === true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  // Slot resolution — fetch the plan's exercises (id, position, image_slots) under
  // RLS and flatten to the ordered slot list in TS. A plan has single-digit
  // exercises, so no pagination/Postgres-function concern. We only READ
  // worksheet_exercise here; this slice never writes it or its image_slots.
  const { data: exerciseRows, error: exerciseErr } = await supabase
    .from('worksheet_exercise')
    .select('id, position, image_slots')
    .eq('lesson_plan_id', lessonPlanId)
    .order('position', { ascending: true });
  if (exerciseErr) {
    return NextResponse.json({ error: 'Could not load the worksheet.' }, { status: 502 });
  }
  const slots = flattenSlots((exerciseRows ?? []) as ExerciseRow[]);
  const slotIndex = slots.findIndex((s) => s.slotId === slotId);

  // (a') Validate the slot. An unknown slot_id for this plan → 404, no generation,
  // no ledger row.
  if (slotIndex === -1) {
    return NextResponse.json({ error: 'Slot not found for this lesson plan.' }, { status: 404 });
  }
  const worksheetExerciseId = slots[slotIndex].exerciseId;

  // (b) Per-slot cap — a slot whose position in the whole-worksheet order is at or
  // beyond the cap is refused (it keeps its [Picture: …] marker). Only THIS slot is
  // refused; the rest of the worksheet is unaffected. A refusal, not an error.
  const cap = Number(process.env.WORKSHEET_IMAGE_CAP ?? 8);
  if (slotIndex >= cap) {
    return NextResponse.json(
      { slot_id: slotId, storage_path: null, refusal: 'cap_reached' },
      { status: 200 },
    );
  }

  // (c) Content-addressed cache key.
  const hash = promptHash(brief);

  // (d) Cache lookup — skipped entirely for a regenerate. Newest non-blocked row for
  // the hash wins. Hit → record the binding and return the cached path, no generation.
  if (!regenerate) {
    const { data: cached } = await supabase
      .from('worksheet_image')
      .select('id, storage_path')
      .eq('prompt_hash', hash)
      .is('blocked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const hit = cached as { id: string; storage_path: string } | null;
    if (hit) {
      const { error: bindErr } = await supabase.from('worksheet_image_use').insert({
        lesson_plan_id: lessonPlanId,
        worksheet_exercise_id: worksheetExerciseId,
        worksheet_image_id: hit.id,
        slot_id: slotId,
      });
      if (bindErr) {
        return NextResponse.json({ error: 'Could not record image use.' }, { status: 502 });
      }
      return NextResponse.json({ slot_id: slotId, storage_path: hit.storage_path });
    }
  }

  // (e) Miss (or regenerate) → generate fresh.
  let client: ReturnType<typeof getImagesClient>;
  try {
    client = getImagesClient();
  } catch (err) {
    // Missing/misconfigured key → 503, mirroring the Anthropic routes' posture.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'OPENAI_API_KEY_IMAGES is not configured.' },
      { status: 503 },
    );
  }

  // Compose the prompt: role → layers 1-4 → IMAGE FLOOR (the floor is appended last
  // by the composer, single-sourced from image-floor.ts). The brief follows as the
  // user-message equivalent; the floor's own text declares it overrides the user
  // message, so brief-after-system preserves floor authority (same posture the
  // resource generator uses for its layer-5/6 anchors).
  // Fail closed: if the context stack errors or is empty, the composer throws
  // rather than compose a stripped prompt — surface it as a clean 503, not a 500.
  let composed: Awaited<ReturnType<typeof composeContextStack>>;
  try {
    composed = await composeContextStack({ tool: 'worksheet_image', subjectId });
  } catch (err) {
    if (err instanceof ContextStackError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const promptSent = `${composed.system}\n\n━━━ IMAGE BRIEF (what to draw) ━━━\n${brief.trim()}`;

  let bytes: Buffer;
  try {
    const generated = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: promptSent,
      size: '1024x1024',
      n: 1,
    });
    const b64 = generated.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: 'Image model returned no image.' }, { status: 502 });
    }
    bytes = Buffer.from(b64, 'base64');
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Image generation failed.' },
      { status: 502 },
    );
  }

  // Upload the BYTES to the private bucket (never an expiring OpenAI URL). The
  // per-user prefix mirrors the resources convention; Storage sets owner =
  // auth.uid() so the existing insert policy (owner = auth.uid()) holds.
  const storagePath = `${STORAGE_PREFIX}/${user.id}/${randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, { contentType: 'image/png', upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 502 });
  }

  // Record the image (append-only), then bind it to the slot (append-only).
  const { data: imageRow, error: imageError } = await supabase
    .from('worksheet_image')
    .insert({
      prompt_hash: hash,
      brief,
      style_version: STYLE_VERSION,
      storage_path: storagePath,
      model: IMAGE_MODEL,
      prompt_sent: promptSent,
      created_by: user.id,
    })
    .select('id, storage_path')
    .maybeSingle();
  if (imageError || !imageRow) {
    // Roll back the orphaned object so we don't leak storage.
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: imageError?.message ?? 'Could not record the generated image.' },
      { status: 502 },
    );
  }
  const image = imageRow as { id: string; storage_path: string };

  const { error: bindError } = await supabase.from('worksheet_image_use').insert({
    lesson_plan_id: lessonPlanId,
    worksheet_exercise_id: worksheetExerciseId,
    worksheet_image_id: image.id,
    slot_id: slotId,
  });
  if (bindError) {
    // The image itself persisted (it is a shared cache row); only the binding
    // failed. Surface it so the caller can retry the bind.
    return NextResponse.json({ error: 'Could not record image use.' }, { status: 502 });
  }

  return NextResponse.json({ slot_id: slotId, storage_path: image.storage_path });
}
