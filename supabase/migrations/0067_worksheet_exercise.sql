-- 0067_worksheet_exercise.sql
-- Worksheet generation spine: the worksheet_exercise table, plus the resources
-- extensions that let a generated exercise be written back to the resource bank.
-- Applied by hand in the Supabase SQL editor.

-- ── 1. worksheet_exercise ─────────────────────────────────────────────

create table public.worksheet_exercise (
  id             uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  position       integer not null,
  title          text not null,
  exercise_type  text not null,
  body_md        text,
  body_doc       jsonb,
  status         text not null default 'generating'
                   check (status in ('generating','ready','failed','edited')),
  origin         text not null default 'generated'
                   check (origin in ('generated','reused','adapted')),
  resource_id    uuid references public.resources(id) on delete set null,
  image_slots    jsonb not null default '[]'::jsonb,
  generation     jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- deferrable so a drag-reorder can renumber inside one transaction.
  -- consequence: NOT usable as an ON CONFLICT arbiter — upsert on id.
  constraint worksheet_exercise_plan_position_key
    unique (lesson_plan_id, position) deferrable initially deferred
);

create index worksheet_exercise_plan_idx
  on public.worksheet_exercise (lesson_plan_id, position);

create or replace function public.worksheet_exercise_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger worksheet_exercise_touch_trg
  before update on public.worksheet_exercise
  for each row execute function public.worksheet_exercise_touch();

alter table public.worksheet_exercise enable row level security;

-- Delegates to lesson_plans visibility: the subquery is itself filtered by
-- lesson_plans' own RLS policies for the calling user.
create policy worksheet_exercise_select on public.worksheet_exercise
  for select to authenticated
  using (exists (
    select 1 from public.lesson_plans lp
    where lp.id = worksheet_exercise.lesson_plan_id
  ));

create policy worksheet_exercise_insert on public.worksheet_exercise
  for insert to authenticated
  with check (exists (
    select 1 from public.lesson_plans lp
    where lp.id = worksheet_exercise.lesson_plan_id
  ));

create policy worksheet_exercise_update on public.worksheet_exercise
  for update to authenticated
  using (exists (
    select 1 from public.lesson_plans lp
    where lp.id = worksheet_exercise.lesson_plan_id
  ))
  with check (exists (
    select 1 from public.lesson_plans lp
    where lp.id = worksheet_exercise.lesson_plan_id
  ));

create policy worksheet_exercise_delete on public.worksheet_exercise
  for delete to authenticated
  using (exists (
    select 1 from public.lesson_plans lp
    where lp.id = worksheet_exercise.lesson_plan_id
  ));

-- ── 2. resources extensions ───────────────────────────────────────────
-- source_exercise_id closes the FK loop, so this must follow section 1.

alter table public.resources
  add column body_md              text,
  add column body_doc             jsonb,
  add column origin               text,
  add column curriculum_lesson_id uuid references public.curriculum_lesson(id) on delete set null,
  add column daily_outcome        text,
  add column image_count          integer not null default 0,
  add column image_slots          jsonb,
  add column generated_from       jsonb,
  add column source_exercise_id   uuid references public.worksheet_exercise(id) on delete set null;

-- Named explicitly: this is the write-back idempotency key and upserts infer on it.
-- Plain unique, not partial — NULLs do not conflict in Postgres.
alter table public.resources
  add constraint resources_source_exercise_key unique (source_exercise_id);

update public.resources
   set origin = case when file_path is not null then 'upload' else 'link' end
 where origin is null;

-- Must exist before SET NOT NULL: existing insert paths ship no origin, and no
-- code deploy can precede the column. Derives from file_path exactly as the
-- backfill above does — not a blanket default. Only the ai_generated path sets
-- origin explicitly.
create or replace function public.resources_default_origin()
returns trigger language plpgsql as $$
begin
  if new.origin is null then
    new.origin := case when new.file_path is not null then 'upload' else 'link' end;
  end if;
  return new;
end;
$$;

create trigger resources_default_origin_trg
  before insert on public.resources
  for each row execute function public.resources_default_origin();

alter table public.resources
  alter column origin set not null,
  add constraint resources_origin_check
    check (origin in ('upload','link','ai_generated'));

alter table public.resources drop constraint resources_one_source;

alter table public.resources add constraint resources_one_source check (
    (file_path    is not null)::int
  + (external_url is not null)::int
  + (body_md      is not null)::int = 1
);

alter table public.resources add constraint resources_body_md_nonempty
  check (body_md is null or btrim(body_md) <> '');

alter table public.resources add constraint resources_ai_has_body
  check (origin <> 'ai_generated' or body_md is not null);

-- Reuse-ladder rungs 2 and 3 key on subject + year; an ai_generated row missing
-- either is unreachable by reuse and is a dead row. Constrains no existing rows —
-- every backfilled row is 'upload' or 'link'.
alter table public.resources add constraint resources_ai_scoped
  check (origin <> 'ai_generated'
         or (subject_id is not null and year is not null));

-- Predicate is on the column, not on origin: usable by any query filtering
-- curriculum_lesson_id however origin is handled.
create index resources_curriculum_lesson_idx
  on public.resources (curriculum_lesson_id) where curriculum_lesson_id is not null;

-- Tightens the existing policy: any authenticated user could otherwise insert
-- origin='ai_generated' with arbitrary body_md. Matches this table's existing
-- profiles.role = 'coordinator' style rather than is_coordinator_of_subject().
drop policy resources_insert_own on public.resources;

create policy resources_insert_own on public.resources
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      origin <> 'ai_generated'
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'coordinator'
      )
    )
  );

-- ── 3. resource_tags: one new label on an existing dimension ──────────
-- Guarded by NOT EXISTS, not ON CONFLICT: unique (dimension, label, subject_id)
-- is NULLS DISTINCT, so a null subject_id never conflicts and ON CONFLICT would
-- not fire. This is the only tag seed in this migration — the ten exercise_type
-- labels are already seeded globally by 0008.

insert into public.resource_tags (dimension, label, subject_id, sort_order)
select 'format', 'Exercise', null, 100
where not exists (
  select 1 from public.resource_tags
  where dimension = 'format' and label = 'Exercise' and subject_id is null
);
