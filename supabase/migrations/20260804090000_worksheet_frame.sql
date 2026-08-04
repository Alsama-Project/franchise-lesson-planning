-- 20260804090000_worksheet_frame.sql
--
-- The per-subject Worksheet PAGE FRAME — the printed "page furniture" around a
-- worksheet (masthead, wordmark, Name/Date/Class, objective strip, footer, page
-- numbers), authored as HTML in Claude Design and uploaded by a coordinator or an
-- admin. This is a STORED ARTEFACT, deliberately kept OUT of the AI instruction
-- stack (`ai_context_doc`): `get_active_context_stack` feeds every layer-4 document
-- to the prompt composer, so markup stored there would be handed to the model as
-- pedagogical instruction. The frame is what gets PRINTED, never what the model
-- reads — so it lives here, on its own.
--
-- SCOPE: one row per subject, keyed on `subject_id` ALONE (centre-agnostic, like
-- `worksheet_template`/`coordinator_subject`). Upload REPLACES: there is no version
-- history, no `is_active`, no immutable versions — a re-upload upserts the row. A
-- subject with no row falls back to the built-in default page frame in code (the
-- pane renders exactly what it renders today until someone uploads).
--
-- LANGUAGE: NOT an axis here. A subject already knows its own content language via
-- `subjects.content_language` (0061_subjects_content_language.sql); one frame per
-- subject, no en/ar variants. An Arabic-medium subject's frame is authored in
-- Arabic because that subject is Arabic — the row does not need to say so.
--
-- NOTE ON PROVENANCE: like the other migrations, this DDL is authored here but
-- applied BY HAND in the Supabase SQL editor by George — the Supabase CLI is not
-- used (see supabase/migrations/README.md). Committed idempotently so the schema
-- stays the locked source of truth and a local `supabase db reset` reproduces it.
-- `is_admin()` and `is_coordinator_of_subject(uuid, uuid)` are defined in 0033 /
-- 0040-0041; `set_updated_at()` in 0003 — all available here.

-- ── worksheet_frame: one page frame per subject ─────────────────────────────
create table if not exists public.worksheet_frame (
  -- One frame per subject. `on delete cascade`: a removed subject takes its frame
  -- with it. `primary key` enforces the one-per-subject invariant and is the
  -- upsert conflict target.
  subject_id        uuid primary key references public.subjects (id) on delete cascade,
  -- The frame markup — HTML authored in Claude Design. Rendered (placeholders
  -- substituted, exercises injected at the slot marker) at print time; never fed
  -- to the model.
  html              text not null,
  -- The uploaded file's name, for the admin panel's "current frame" line.
  original_filename text,
  updated_at        timestamptz not null default now(),
  -- Who last saved the frame (nullable so a deleted author never blocks a row).
  updated_by        uuid references public.profiles (id)
);

-- Maintain updated_at on every upsert-as-update (reuses the shared helper from 0003).
drop trigger if exists worksheet_frame_set_updated_at on public.worksheet_frame;
create trigger worksheet_frame_set_updated_at
  before update on public.worksheet_frame
  for each row
  execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- SELECT: any authenticated user. The (future) render path reads the frame to
--   print a worksheet, so read must not be gated to admins/coordinators.
-- INSERT / UPDATE (upsert): admins, or the coordinator OF THAT SUBJECT.
-- No DELETE policy: reverting to the built-in page = there is nothing uploaded,
--   never deleting a row through the UI in this phase.
alter table public.worksheet_frame enable row level security;

drop policy if exists worksheet_frame_read on public.worksheet_frame;
create policy worksheet_frame_read
  on public.worksheet_frame for select to authenticated
  using (true);

-- The FIRST argument to is_coordinator_of_subject (p_school) is IGNORED by the
-- current definition (kept only for caller compatibility — 0040/0041). Passing
-- null::uuid is deliberate: this table is centre-agnostic, so there is no school to
-- scope by. Matches the worksheet_template / ai_context_doc write pattern exactly.
drop policy if exists worksheet_frame_write_insert on public.worksheet_frame;
create policy worksheet_frame_write_insert
  on public.worksheet_frame for insert to authenticated
  with check (
    public.is_admin()
    or public.is_coordinator_of_subject(null::uuid, subject_id)
  );

drop policy if exists worksheet_frame_write_update on public.worksheet_frame;
create policy worksheet_frame_write_update
  on public.worksheet_frame for update to authenticated
  using (
    public.is_admin()
    or public.is_coordinator_of_subject(null::uuid, subject_id)
  )
  with check (
    public.is_admin()
    or public.is_coordinator_of_subject(null::uuid, subject_id)
  );

comment on table public.worksheet_frame is
  'Per-subject printed worksheet page frame (HTML), authored in Claude Design and uploaded by a coordinator/admin. Keyed on subject_id alone (centre-agnostic). Upload REPLACES (no versions). Deliberately OUTSIDE ai_context_doc so page markup never reaches the AI prompt composer. A subject with no row uses the built-in default frame in code.';

-- Ledger (going-forward convention; see 20260803093441).
insert into applied_migration (filename, note)
values ('20260804090000_worksheet_frame.sql', null)
on conflict (filename) do nothing;
