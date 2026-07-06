-- 0056_curriculum_versioning.sql
--
-- Per-subject curriculum VERSIONING. A re-authored subject creates a NEW version
-- instead of overwriting rows; existing lesson plans stay pinned to the version
-- they were authored under. Supersedes the "replace subject" idea.
--
-- MODEL
--   • curriculum_version: one active (current) version per subject + zero or more
--     historical versions. `is_active` on the VERSION row marks the current one; a
--     partial unique index enforces exactly one active version per subject.
--   • curriculum_lesson rows carry `curriculum_version_id`. Rows accumulate in place
--     across versions — a new version ADDS its rows; prior-version rows PERSIST,
--     untouched (their `is_active` / content are never mutated on demotion). Because
--     old rows are not archived, a full re-author never trips the reconcile
--     circuit-breaker (Guard 2), and plans pinned to an old version never point at an
--     archived lesson.
--   • lesson_plans carry `curriculum_version_id`, stamped at creation with the
--     subject's active version. A plan ALWAYS resolves its curriculum from ITS
--     stamped version — forever (silent pin; no banner, no migration).
--
-- READ SCOPING
--   `lesson_key` is no longer globally unique (the same key exists once per version),
--   so it is unique PER VERSION. The browser / picker / board / insights read ONLY
--   the active version via the `curriculum_lesson_active` view (active version AND
--   row-level is_active). Plan-pinned resolution reads the base table scoped to the
--   plan's stamped `curriculum_version_id`.
--
-- PROVENANCE / HOW TO APPLY: applied by hand in the Supabase SQL editor like
-- 0010/0015/0024/0044/0047/0049/0050/0051/0053/0055; committed idempotently so the
-- schema stays the locked source of truth and `supabase db reset` reproduces it. The
-- agent never executes SQL. Re-running is safe.

-- ── 1) Version model ─────────────────────────────────────────────────────────────

create table if not exists public.curriculum_version (
  id           uuid primary key default gen_random_uuid(),
  subject_code text not null,                       -- matches subjects.code / curriculum_lesson.subject_code
  version_no   int  not null,                       -- 1-based, monotonic per subject
  is_active    boolean not null default true,       -- the current version for the subject
  note         text,                                -- optional operator note (e.g. "2026 re-author")
  created_at   timestamptz not null default now(),
  unique (subject_code, version_no)
);

-- Exactly one active version per subject.
create unique index if not exists curriculum_version_one_active_per_subject
  on public.curriculum_version (subject_code)
  where is_active;

alter table public.curriculum_version enable row level security;
drop policy if exists curr_version_read on public.curriculum_version;
create policy curr_version_read on public.curriculum_version for select
  using (auth.role() = 'authenticated');   -- reference data; writes are service-role only

-- Atomically make ONE version the active one for a subject, demoting all others in the
-- same statement. Single-statement flip → the "one active per subject" partial unique
-- index never sees two active rows mid-transition, and there is never a window with no
-- active version (unlike a separate demote-then-promote). Called by the "publish new
-- version" importer path via the service-role client (which bypasses RLS on write).
create or replace function public.curriculum_activate_version(p_subject text, p_version_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.curriculum_version
    set is_active = (id = p_version_id)
    where subject_code = p_subject;
$$;

revoke execute on function public.curriculum_activate_version(text, uuid) from public;
grant  execute on function public.curriculum_activate_version(text, uuid) to service_role;

-- ── 2) Associate curriculum_lesson rows with a version ───────────────────────────

alter table public.curriculum_lesson
  add column if not exists curriculum_version_id uuid references public.curriculum_version (id);

-- Backfill: every existing subject gets a version 1 (active), and all its existing
-- rows are stamped to it. Idempotent — safe to re-run (no-op once stamped).
insert into public.curriculum_version (subject_code, version_no, is_active)
  select distinct cl.subject_code, 1, true
  from public.curriculum_lesson cl
  on conflict (subject_code, version_no) do nothing;

update public.curriculum_lesson cl
  set curriculum_version_id = cv.id
  from public.curriculum_version cv
  where cv.subject_code = cl.subject_code
    and cv.version_no = 1
    and cl.curriculum_version_id is null;

alter table public.curriculum_lesson
  alter column curriculum_version_id set not null;

-- Replace the global uniques with version-scoped ones. `lesson_key` and the natural
-- 5-tuple are now unique WITHIN a version, not globally (the same key recurs once per
-- version). Old constraint names are the Postgres defaults from 0010's inline uniques.
alter table public.curriculum_lesson
  drop constraint if exists curriculum_lesson_subject_code_year_month_week_period_key;
alter table public.curriculum_lesson
  drop constraint if exists curriculum_lesson_lesson_key_key;

create unique index if not exists curriculum_lesson_version_lesson_key_uidx
  on public.curriculum_lesson (curriculum_version_id, lesson_key);
create unique index if not exists curriculum_lesson_version_natkey_uidx
  on public.curriculum_lesson (curriculum_version_id, subject_code, year, month, week, period);

-- Navigation index, now version-scoped (the picker/board read one version).
create index if not exists idx_curr_nav_versioned
  on public.curriculum_lesson (curriculum_version_id, subject_code, year, month, week);

-- ── 3) Stamp lesson plans with a version ─────────────────────────────────────────

alter table public.lesson_plans
  add column if not exists curriculum_version_id uuid references public.curriculum_version (id);

-- Backfill: every existing plan -> version 1 of ITS subject. The plan's subject is
-- the first segment of its stored `curriculum_lesson_id` (lesson_key =
-- `subject_code|Y{year}|{month}|W{week}|P{period}`) — always present (NOT NULL, 0003),
-- so this needs no plan/subject-count assumptions. Left NULLABLE: a legacy plan whose
-- subject has no curriculum version stays null and the app falls back to the active
-- version at read time.
update public.lesson_plans lp
  set curriculum_version_id = cv.id
  from public.curriculum_version cv
  where cv.version_no = 1
    and cv.subject_code = split_part(lp.curriculum_lesson_id, '|', 1)
    and lp.curriculum_version_id is null;

-- ── 4) Active-version read surface ───────────────────────────────────────────────
--
-- The single choke point for "current curriculum": a curriculum_lesson row that is
-- both row-level active AND belongs to its subject's active version. Every browse /
-- insights reader points here instead of the base table, so historical versions are
-- invisible to them with no per-site version predicate. Plan-pinned resolution does
-- NOT use this view — it reads the base table scoped to the plan's stamped version.
create or replace view public.curriculum_lesson_active
  with (security_invoker = true) as
  select cl.*
  from public.curriculum_lesson cl
  join public.curriculum_version cv
    on cv.id = cl.curriculum_version_id and cv.is_active
  where cl.is_active;

grant select on public.curriculum_lesson_active to authenticated, service_role;

-- ── 5) Re-scope the reference views / RPCs to the active version ──────────────────
--
-- Each previously read `curriculum_lesson … where is_active`; now that is_active no
-- longer distinguishes the current version (historical rows keep is_active=true),
-- they read `curriculum_lesson_active` instead. Bodies are otherwise unchanged.
-- (The 0050 aggregate RPCs read the `curriculum_taxonomy` view, so fixing that view
-- flows through to all of them.)

create or replace view public.curriculum_active_subjects
  with (security_invoker = true) as
  select distinct subject_code
  from public.curriculum_lesson_active;

grant select on public.curriculum_active_subjects to authenticated, service_role;

create or replace view public.curriculum_taxonomy
  with (security_invoker = true) as
  select
    cl.id,
    cl.subject_code,
    cl.year,
    cl.month,
    cl.week,
    cl.period,
    cl.taxonomy_id,
    case when split_part(cl.taxonomy_id, '.', 1) ~ '^[0-9]+$'
         then split_part(cl.taxonomy_id, '.', 1)::int end                as focus_area,
    case when split_part(cl.taxonomy_id, '.', 2) ~* '^S[0-9]+$'
         then upper(split_part(cl.taxonomy_id, '.', 2)) end              as skill_lo,
    case when split_part(cl.taxonomy_id, '.', 3) ~* '^K[0-9]+$'
         then upper(split_part(cl.taxonomy_id, '.', 3)) end              as knowledge_lo,
    case when split_part(cl.taxonomy_id, '.', 4) ~* '^H?[0-9]+$'
         then nullif(regexp_replace(split_part(cl.taxonomy_id, '.', 4), '[^0-9]', '', 'g'), '')::int
    end                                                                  as hour,
    (split_part(cl.taxonomy_id, '.', 1) !~ '^[0-9]+$')                   as is_placeholder,
    (upper(split_part(cl.taxonomy_id, '.', 2)) = 'S0'
       and upper(split_part(cl.taxonomy_id, '.', 3)) = 'K0')             as is_flat_artefact,
    cl.theme,
    cl.focus_area as focus_area_text
  from public.curriculum_lesson_active cl
  where cl.taxonomy_id is not null;

grant select on public.curriculum_taxonomy to authenticated, service_role;

create or replace function public.curriculum_taxonomy_coverage(p_subject text)
returns table (total bigint, well_formed bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint                                                                  as total,
    count(*) filter (
      where cl.taxonomy_id ~ '^[0-9]+\.S[0-9]+\.K[0-9]+\.H[0-9]+$'
        and split_part(cl.taxonomy_id, '.', 2) <> 'S0'
        and split_part(cl.taxonomy_id, '.', 3) <> 'K0'
    )::bigint                                                                         as well_formed
  from public.curriculum_lesson_active cl
  where cl.subject_code = p_subject;
$$;

revoke execute on function public.curriculum_taxonomy_coverage(text) from public;
grant  execute on function public.curriculum_taxonomy_coverage(text) to authenticated, service_role;

create or replace function public.curriculum_hours_by_linguistic_skill(p_subject text)
returns table (linguistic_skill text, hours bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(btrim(cl.linguistic_skill), '') as linguistic_skill, count(*)::bigint as hours
  from public.curriculum_lesson_active cl
  where cl.subject_code = p_subject
    and nullif(btrim(cl.linguistic_skill), '') is not null
  group by nullif(btrim(cl.linguistic_skill), '');
$$;

revoke execute on function public.curriculum_hours_by_linguistic_skill(text) from public;
grant  execute on function public.curriculum_hours_by_linguistic_skill(text) to authenticated, service_role;

create or replace function public.curriculum_topic_threads(p_subject text)
returns table (
  focus_area    text,
  theme         text,
  year          int,
  hours         bigint,
  lesson_key    text,
  daily_outcome text,
  strand_label  text,
  resources     jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (coalesce(s.fa, ''), coalesce(s.th, ''), s.yr)
    s.fa                                                                   as focus_area,
    s.th                                                                   as theme,
    s.yr                                                                   as year,
    count(*) over (partition by coalesce(s.fa, ''), coalesce(s.th, ''), s.yr) as hours,
    s.lk                                                                   as lesson_key,
    s.doo                                                                  as daily_outcome,
    s.sl                                                                   as strand_label,
    s.res                                                                  as resources
  from (
    select
      nullif(btrim(cl.focus_area), '')                                       as fa,
      nullif(btrim(cl.theme), '')                                            as th,
      cl.year                                                                as yr,
      cl.week                                                                as wk,
      cl.period                                                              as pd,
      cl.lesson_key                                                          as lk,
      cl.daily_outcome                                                       as doo,
      coalesce(nullif(btrim(cl.linguistic_skill), ''), nullif(btrim(cl.focus_area), '')) as sl,
      cl.resources                                                           as res
    from public.curriculum_lesson_active cl
    where cl.subject_code = p_subject
      and (nullif(btrim(cl.theme), '') is not null or nullif(btrim(cl.focus_area), '') is not null)
  ) s
  order by coalesce(s.fa, ''), coalesce(s.th, ''), s.yr, s.wk nulls last, s.pd nulls last;
$$;

revoke execute on function public.curriculum_topic_threads(text) from public;
grant  execute on function public.curriculum_topic_threads(text) to authenticated, service_role;
