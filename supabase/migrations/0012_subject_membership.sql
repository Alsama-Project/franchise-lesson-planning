-- 0012_subject_membership.sql
--
-- The subject-membership permission model. This migration is a faithful, fully
-- idempotent record of schema that was applied manually to the live database
-- earlier; it brings the repo back in sync with what is already running. Every
-- statement is guarded (IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS) so it is
-- safe to re-run against a database that already has these objects.
--
-- The permission boundary is the (centre, subject) shared space. A person is a
-- member (role 'teacher') or coordinator (role 'coordinator') of any number of
-- spaces, modelled by `subject_membership`. The global `profiles.role = 'admin'`
-- is org-wide. Coordinator-ness used to live on `profiles.role`; it now lives
-- per-space here. See src/lib/auth.ts (keep the helper names in sync).

-- ── enums ───────────────────────────────────────────────────────────────────
-- `admin` becomes a global role on profiles. ADD VALUE IF NOT EXISTS is a no-op
-- when the label already exists. (The label is only referenced from function
-- bodies below, which are not evaluated at migration time, so this is safe in a
-- single transaction.)
alter type public.user_role add value if not exists 'admin';

-- Per-space role. CREATE TYPE has no IF NOT EXISTS, so guard with a DO block.
do $$
begin
  create type public.membership_role as enum ('teacher', 'coordinator');
exception
  when duplicate_object then null;
end
$$;

-- ── subject_membership ──────────────────────────────────────────────────────
create table if not exists public.subject_membership (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  school_id uuid not null references public.schools,
  subject_id uuid not null references public.subjects,
  role public.membership_role not null default 'teacher',
  created_at timestamptz not null default now(),
  unique (profile_id, school_id, subject_id)
);

create index if not exists subject_membership_profile_idx
  on public.subject_membership (profile_id);
create index if not exists subject_membership_space_idx
  on public.subject_membership (school_id, subject_id);

-- ── security-definer helpers ────────────────────────────────────────────────
-- Each reads regardless of the caller's own row visibility (RLS-bypassing) so
-- they can be called safely from within the RLS policies below without
-- recursing. STABLE: same result within a statement.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_member_of_subject(p_school uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subject_membership
    where profile_id = auth.uid()
      and school_id = p_school
      and subject_id = p_subject
  );
$$;

create or replace function public.is_coordinator_of_subject(p_school uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subject_membership
    where profile_id = auth.uid()
      and school_id = p_school
      and subject_id = p_subject
      and role = 'coordinator'
  );
$$;

-- ── RLS on subject_membership ───────────────────────────────────────────────
alter table public.subject_membership enable row level security;

-- Read: any member of a space sees that space's rows (own + teammates'); admins
-- see all. The helper is security-definer, so referencing it here does not
-- recurse back through this policy.
drop policy if exists sm_read on public.subject_membership;
create policy sm_read
  on public.subject_membership for select to authenticated
  using (
    public.is_member_of_subject(school_id, subject_id)
    or public.is_admin()
  );

-- Admins may write any membership row.
drop policy if exists sm_admin_write on public.subject_membership;
create policy sm_admin_write
  on public.subject_membership for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A coordinator of a space may manage that space's memberships.
drop policy if exists sm_coord_write on public.subject_membership;
create policy sm_coord_write
  on public.subject_membership for all to authenticated
  using (public.is_coordinator_of_subject(school_id, subject_id))
  with check (public.is_coordinator_of_subject(school_id, subject_id));

-- A user may add themselves to a space as a teacher (onboarding self-join).
drop policy if exists sm_self_join on public.subject_membership;
create policy sm_self_join
  on public.subject_membership for insert to authenticated
  with check (profile_id = auth.uid() and role = 'teacher');

-- A user may remove their own membership (leave a space).
drop policy if exists sm_self_leave on public.subject_membership;
create policy sm_self_leave
  on public.subject_membership for delete to authenticated
  using (profile_id = auth.uid());

-- ── lesson_plans access now flows through subject membership ─────────────────
-- Replace the original owner/assignee-only policies (already dropped live) with
-- a single membership-aware policy: the creator, an admin, or any member of the
-- plan's class's (centre, subject) space may read/write the plan.
drop policy if exists lesson_plans_select_own_or_assigned on public.lesson_plans;
drop policy if exists lesson_plans_insert_self on public.lesson_plans;
drop policy if exists lesson_plans_update_own_or_assigned on public.lesson_plans;

drop policy if exists lp_member_all on public.lesson_plans;
create policy lp_member_all
  on public.lesson_plans for all to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.classes c
      where c.id = lesson_plans.class_id
        and public.is_member_of_subject(c.school_id, c.subject_id)
    )
  )
  with check (
    created_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.classes c
      where c.id = lesson_plans.class_id
        and public.is_member_of_subject(c.school_id, c.subject_id)
    )
  );

-- ── approval is coordinator-only (DB-enforced) ──────────────────────────────
-- Mirrors the app guard in setPlanStatus: moving a plan to 'approved' or
-- 'needs_review' requires a coordinator of the plan's (centre, subject) space,
-- or an admin. Belt-and-braces with the action-layer check.
create or replace function public.enforce_approval_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_subject uuid;
begin
  if new.status is distinct from old.status
     and new.status in ('approved', 'needs_review') then
    select c.school_id, c.subject_id
      into v_school, v_subject
      from public.classes c
     where c.id = new.class_id;

    if not (public.is_coordinator_of_subject(v_school, v_subject) or public.is_admin()) then
      raise exception 'Only a coordinator of this subject can change approval status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_approval_role on public.lesson_plans;
create trigger enforce_approval_role
  before update on public.lesson_plans
  for each row
  execute function public.enforce_approval_role();
