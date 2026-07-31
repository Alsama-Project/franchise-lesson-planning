-- 0072_worksheet_image.sql
--
-- SUPERSEDES the merged-but-unapplied 0069_worksheet_image.sql (renamed alongside
-- 0070/0071, and now adds worksheet_image_use.worksheet_exercise_id). Do NOT apply
-- the old file.
--
-- Backend data layer for worksheet image generation. Two APPEND-ONLY tables:
--
--   * worksheet_image      — one row per generated image (a content-addressed cache
--                            keyed by prompt_hash; NOT unique on prompt_hash —
--                            regeneration inserts a NEW row, and the newest
--                            non-blocked row for a hash is what that hash serves).
--   * worksheet_image_use  — one row per binding of an image into a lesson plan's
--                            worksheet slot (also append-only; the newest row for a
--                            (lesson_plan_id, slot_id) is the current binding).
--
-- WHY APPEND-ONLY: every write in this slice is an INSERT. There is deliberately NO
-- UPDATE and NO DELETE policy on either table, and the generate/serve routes use the
-- auth'd, RLS-scoped server client ONLY — never the service-role key. "Replace"
-- semantics (regenerate an image, rebind a slot) are achieved by inserting a newer
-- row and reading newest-wins, so no mutation policy — and no service-role bypass —
-- is ever needed. blocked_at is nullable and NOTHING in code writes it; a blocked
-- image simply drops out of the newest-non-blocked lookup, falling back to the
-- previous generation rather than leaving a hole.
--
-- Uploaded image bytes live in the EXISTING private 'resources' bucket (0008) under
-- the 'worksheet-images/' prefix; storage_path is that object path (per-UUID, so
-- naturally unique — the one unique constraint kept).
--
-- PROVENANCE: authored here, applied BY HAND in the Supabase SQL editor by the
-- operator (George), like the other numbered migrations. Idempotent throughout.

-- ── worksheet_image: one row per generated image ────────────────────────────
create table if not exists public.worksheet_image (
  id            uuid primary key default gen_random_uuid(),
  prompt_hash   text not null,
  brief         text not null,           -- raw brief as received
  style_version text not null,
  storage_path  text not null unique,    -- object path in the 'resources' bucket; per-UUID
  model         text not null,
  prompt_sent   text not null,           -- full composed prompt, for traceability
  created_by    uuid not null references auth.users (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  blocked_at    timestamptz              -- nullable; nothing writes it in code
);

-- Newest-non-blocked lookup by hash: (prompt_hash, created_at desc).
create index if not exists worksheet_image_prompt_hash_idx
  on public.worksheet_image (prompt_hash, created_at desc);

comment on table public.worksheet_image is
  'Append-only cache of generated worksheet images. NOT unique on prompt_hash: regeneration inserts a new row; the newest row for a hash WHERE blocked_at IS NULL is what that hash serves. INSERT-only — no UPDATE/DELETE policy.';

-- ── worksheet_image_use: one row per (plan, slot) binding ───────────────────
create table if not exists public.worksheet_image_use (
  id                    uuid primary key default gen_random_uuid(),
  lesson_plan_id        uuid not null references public.lesson_plans (id) on delete cascade,
  worksheet_exercise_id uuid not null references public.worksheet_exercise (id) on delete cascade,
  worksheet_image_id    uuid not null references public.worksheet_image (id),
  slot_id               text not null,
  created_at            timestamptz not null default now()
);

-- Lesson-plan-scoped reads (kept from the original spec).
create index if not exists worksheet_image_use_lesson_plan_idx
  on public.worksheet_image_use (lesson_plan_id);
-- Newest-binding lookup by (exercise, slot): (worksheet_exercise_id, slot_id, created_at desc).
create index if not exists worksheet_image_use_exercise_slot_idx
  on public.worksheet_image_use (worksheet_exercise_id, slot_id, created_at desc);

comment on table public.worksheet_image_use is
  'Append-only bindings of a worksheet_image into a worksheet_exercise slot. NOT unique on (worksheet_exercise_id, slot_id): the CURRENT binding for a (worksheet_exercise_id, slot_id) is the row with the greatest created_at. Nothing in this slice READS the binding yet — workstream 1b consumes it. INSERT-only — no UPDATE/DELETE policy.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.worksheet_image     enable row level security;
alter table public.worksheet_image_use enable row level security;

-- worksheet_image: readable by any authenticated user (mirrors
-- resources_select_authenticated, 0008); a user inserts only rows they own. No
-- UPDATE, no DELETE policy — the table is append-only.
drop policy if exists worksheet_image_select_authenticated on public.worksheet_image;
create policy worksheet_image_select_authenticated
  on public.worksheet_image for select to authenticated
  using (true);

drop policy if exists worksheet_image_insert_own on public.worksheet_image;
create policy worksheet_image_insert_own
  on public.worksheet_image for insert to authenticated
  with check (created_by = (select auth.uid()));

-- worksheet_image_use: readable by any authenticated user; a user may insert a
-- binding only for a lesson plan they can already SEE. The exists() defers to the
-- lesson_plans SELECT policy (lp_select, 0057) rather than duplicating its
-- predicate — that policy will change, and this must not drift from it. No UPDATE,
-- no DELETE policy — append-only.
drop policy if exists worksheet_image_use_select_authenticated on public.worksheet_image_use;
create policy worksheet_image_use_select_authenticated
  on public.worksheet_image_use for select to authenticated
  using (true);

drop policy if exists worksheet_image_use_insert_visible_plan on public.worksheet_image_use;
create policy worksheet_image_use_insert_visible_plan
  on public.worksheet_image_use for insert to authenticated
  with check (
    exists (
      select 1 from public.lesson_plans lp
      where lp.id = worksheet_image_use.lesson_plan_id
    )
  );
