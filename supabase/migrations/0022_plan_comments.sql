-- 0022_plan_comments.sql
--
-- Coordinator review comments. A flat, chronological thread of coordinator→teacher
-- feedback attached to a lesson plan. This slice is COORDINATOR-ONLY: a coordinator
-- of the plan's (centre, subject) space (or an admin) may read and write comments.
-- The teacher-facing reveal of returned comments is a LATER slice — there is
-- deliberately no teacher SELECT policy here yet.
--
-- Access resolves the plan's (centre, subject) space the SAME class-optional way as
-- the lesson_plans RLS (migration 0019) and the enforce_approval_role trigger: the
-- plan's own scope columns, falling back to its class. Centralised in the
-- security-definer helper `is_coordinator_of_plan` so the policies stay one-liners
-- and cannot recurse through plan_comments' own RLS.
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is also applied
-- by hand in the Supabase SQL editor (George applies it to the live database). It
-- is committed here, idempotently, so the schema stays the locked source of truth
-- in-repo and a local `supabase db reset` reproduces it. Every statement is guarded.

create table if not exists public.plan_comments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.lesson_plans (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists plan_comments_plan_created_idx
  on public.plan_comments (plan_id, created_at);

-- ── space resolution helper (security definer, RLS-bypassing) ────────────────
-- True when the caller is a coordinator of the plan's (centre, subject) space, or
-- an admin. Resolves the space class-optionally (plan scope columns, else class),
-- mirroring lesson_plans' policy. STABLE: same result within a statement.
create or replace function public.is_coordinator_of_plan(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with space as (
    select
      coalesce(c.school_id, lp.school_id) as school_id,
      coalesce(c.subject_id, lp.subject_id) as subject_id
    from public.lesson_plans lp
    left join public.classes c on c.id = lp.class_id
    where lp.id = p_plan
  )
  select coalesce(
    public.is_admin()
      or public.is_coordinator_of_subject(space.school_id, space.subject_id),
    false
  )
  from space;
$$;

-- ── RLS: coordinator-only read + insert ─────────────────────────────────────
alter table public.plan_comments enable row level security;

drop policy if exists plan_comments_coord_select on public.plan_comments;
create policy plan_comments_coord_select
  on public.plan_comments for select to authenticated
  using (public.is_coordinator_of_plan(plan_id));

-- Insert: the row's author is the caller, and the caller coordinates the plan's
-- space. No UPDATE or DELETE policy → comments are immutable (no edit/delete UI).
drop policy if exists plan_comments_coord_insert on public.plan_comments;
create policy plan_comments_coord_insert
  on public.plan_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_coordinator_of_plan(plan_id)
  );
