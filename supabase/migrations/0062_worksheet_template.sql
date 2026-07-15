-- 0062_worksheet_template.sql
--
-- The per-subject Worksheet Master Template. A coordinator (of that subject) or an
-- admin authors one scaffold per subject; every new worksheet created for that
-- subject opens pre-filled with a deep clone of it (see the seed in
-- src/lib/actions/create-lesson.ts). Editing a template never touches worksheets
-- already created — the seed is a fork, not a reference.
--
-- SCOPE: keyed on `subject_id` ALONE — deliberately centre-agnostic. One English
-- master serves every centre, matching how `coordinator_subject` and the curriculum
-- already scope. Do NOT add a centre/school column.
--
-- SHAPE: `body` mirrors the SAME unenforced jsonb shape as `lesson_plans.worksheet`
-- (the v3 envelope `{ version: 3, doc }` — see src/types/lesson.ts). Postgres cannot
-- enforce it; the app owns the shape.
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is authored here
-- but applied BY HAND in the Supabase SQL editor (George applies it to the live
-- database). It is committed idempotently so the schema stays the locked source of
-- truth in repo and a local `supabase db reset` reproduces it. `is_admin()` and
-- `is_coordinator_of_subject(uuid, uuid)` are defined in migrations 0033 / 0041, so
-- they are available here.

-- ── worksheet_template: one master scaffold per subject ─────────────────────
create table if not exists public.worksheet_template (
  id uuid primary key default gen_random_uuid(),
  -- One template per subject. `on delete cascade`: a removed subject takes its
  -- template with it. `unique` enforces the one-per-subject invariant.
  subject_id uuid not null unique references public.subjects (id) on delete cascade,
  -- The worksheet body — same jsonb shape as lesson_plans.worksheet (v3 envelope).
  body jsonb not null,
  updated_at timestamptz not null default now(),
  -- Who last saved the template (nullable so a deleted author never blocks a row).
  updated_by uuid references public.profiles (id)
);

-- Maintain updated_at on every edit (reuses the shared helper from migration 0003).
drop trigger if exists worksheet_template_set_updated_at on public.worksheet_template;
create trigger worksheet_template_set_updated_at
  before update on public.worksheet_template
  for each row
  execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- SELECT: any authenticated user. Teachers' plan-creation path reads the template
--   to seed a new worksheet, so read must not be gated to admins/coordinators.
-- INSERT / UPDATE: admins, or the coordinator OF THAT SUBJECT.
-- No DELETE policy: reverting to the default blank worksheet = clearing `body`
--   through the UI, never deleting the row.
alter table public.worksheet_template enable row level security;

drop policy if exists worksheet_template_read on public.worksheet_template;
create policy worksheet_template_read
  on public.worksheet_template for select to authenticated
  using (true);

-- The second argument to is_coordinator_of_subject is the subject; the FIRST
-- (p_school) is IGNORED by the current definition (kept only for caller
-- compatibility — migration 0041). Passing null::uuid for it is deliberate: this
-- table is centre-agnostic, so there is no school to scope by.
drop policy if exists worksheet_template_write_insert on public.worksheet_template;
create policy worksheet_template_write_insert
  on public.worksheet_template for insert to authenticated
  with check (
    public.is_admin()
    or public.is_coordinator_of_subject(null::uuid, subject_id)
  );

drop policy if exists worksheet_template_write_update on public.worksheet_template;
create policy worksheet_template_write_update
  on public.worksheet_template for update to authenticated
  using (
    public.is_admin()
    or public.is_coordinator_of_subject(null::uuid, subject_id)
  )
  with check (
    public.is_admin()
    or public.is_coordinator_of_subject(null::uuid, subject_id)
  );

comment on table public.worksheet_template is
  'Per-subject Worksheet Master Template. Keyed on subject_id alone (centre-agnostic). body mirrors lesson_plans.worksheet (v3 envelope). Seeded (deep-cloned) into a new plan''s worksheet at creation; edits never touch already-created worksheets.';
