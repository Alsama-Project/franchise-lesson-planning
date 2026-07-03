-- 0039_impersonation_role_toggle.sql
--
-- Impersonation rebuild: the DB half of replacing the persona *picker* with a
-- two-state role toggle `[ Teacher | Coordinator ]`. The faithful-impersonation
-- engine (signInWithPassword swap, stash-before-first-swap, Return via stashed
-- identity) is unchanged — this migration only adds the role→persona resolution
-- seam and retires the now-dead enumeration RPC.
--
-- Four pieces:
--   A1. `impersonation_canonical` — the designation table: one canonical persona
--       per toggle role, shared across all admin callers. Seeded with the fixed
--       teacher1 / coordinator1 uids.
--   A2. `resolve_impersonation_persona(target_role)` — the SECURITY DEFINER read
--       the swap route calls. It re-applies the SAME eligibility + anti-escalation
--       gate as the old `list_impersonation_personas` (0030), so caller-scope is
--       still enforced server-side (a non-admin can only ever resolve `teacher`).
--   A3. Idempotent coherence asserts derived from teacher1's own membership (the
--       canonical space is NOT hardcoded): give coordinator1 a coordinator-role
--       membership in that space (the load-bearing fix — the seed only ever
--       attaches a teacher-role membership, which is why the coordinator view
--       never rendered coordinator chrome), and best-effort attach teacher1 to a
--       couple of the space's classes so the board isn't empty.
--   A4. Drop the dead picker RPC `list_impersonation_personas` (0030). Phase 0
--       confirmed its only callers are all migrated to the toggle in this branch.
--
-- NOTE ON PROVENANCE / APPLICATION: like 0012/0014/0023/0029/0030/0036/0038, CC
-- never applies migrations — George runs this in the Supabase SQL editor. Every
-- statement is guarded (IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS /
-- ON CONFLICT), so it is safe to re-run. Idempotent.
--
-- SCHEMA BINDINGS (verified against the migrations, not assumed):
--   • subject_membership(profile_id, school_id, subject_id, role membership_role)
--     — unique (profile_id, school_id, subject_id); enum membership_role is
--     ('teacher','coordinator') (0012).
--   • classes(id, school_id, subject_id, year, archived_at) — `group_label` was
--     REMOVED in 0018; a class is now (school, subject, year) with a partial-unique
--     index on active rows, so `year in (1,2)` matches at most one active class per
--     year. There is no group letter to bind "A" to — A3 matches by year alone.
--   • class_teachers(class_id, teacher_id) — unique (class_id, teacher_id) (0002).
--   • profiles.role is enum user_role ('teacher','coordinator','admin'); it is a
--     DIFFERENT type from membership_role, so role comparisons below cast via text.

-- ── A1. impersonation_canonical — the designation table ──────────────────────
-- One canonical persona per toggle role. `role` uses the membership_role enum
-- (its two labels are exactly the two toggle roles). No FK-free uid: persona_id
-- must reference a real profile.
create table if not exists public.impersonation_canonical (
  role       public.membership_role primary key,
  persona_id uuid not null references public.profiles(id)
);

-- RLS on, with NO select for authenticated/public: the designation (and the uids
-- it maps to) is read ONLY inside the SECURITY DEFINER resolve RPC below. A
-- minimal admin-only select is allowed for console/debugging visibility; it never
-- exposes emails (those live in auth.users, unreadable here).
alter table public.impersonation_canonical enable row level security;

drop policy if exists impersonation_canonical_admin_read on public.impersonation_canonical;
create policy impersonation_canonical_admin_read
  on public.impersonation_canonical for select to authenticated
  using (public.is_admin());

-- Seed the canonical pair (shared across all admin callers). Idempotent: re-running
-- re-points the role at the given persona rather than erroring.
insert into public.impersonation_canonical (role, persona_id) values
  ('teacher',     '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'),
  ('coordinator', 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33')
on conflict (role) do update set persona_id = excluded.persona_id;

-- ── A2. resolve_impersonation_persona ────────────────────────────────────────
-- The role→persona seam the swap route calls. Returns the (persona_id, email) for
-- the canonical persona of `target_role`, or NO ROW when the caller may not have
-- it — the route treats an empty result as a scoped denial. `email` is returned
-- for server-side sign-in only; the route never sends it (or the uid) to the client.
create or replace function public.resolve_impersonation_persona(
  target_role public.membership_role
)
returns table (
  persona_id uuid,
  email      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Eligibility gate — mirrors list_impersonation_personas (0030) EXACTLY:
  -- a real admin, or a profile explicitly flagged can_impersonate. On failure we
  -- return no row (the route then denies). The env-allowlist fallback lives in the
  -- app layer; SQL cannot see it — but the route only reaches here after its own
  -- isEligibleCaller check, so an allowlisted admin/flagged caller still passes.
  if not (
    public.is_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and can_impersonate
    )
  ) then
    return;
  end if;

  -- Anti-escalation — mirrors 0030 EXACTLY: a non-admin caller may resolve only
  -- 'teacher'. The coordinator toggle state is unreachable for a can_impersonate
  -- caller, enforced here in the definer (not just the UI).
  if target_role = 'coordinator' and not public.is_admin() then
    return;
  end if;

  -- Resolve + validate. Return the row ONLY if the designated persona is still an
  -- impersonatable test persona AND its global role matches the requested toggle
  -- role — guards a mis-pointed designation row. profiles.role (user_role) and
  -- target_role (membership_role) are different enums, so compare via text.
  return query
  select p.id, u.email::text
  from public.impersonation_canonical ic
  join public.profiles p  on p.id = ic.persona_id
  join auth.users     u  on u.id = p.id
  where ic.role = target_role
    and p.is_test_persona
    and p.role::text = target_role::text;
end;
$$;

-- Tightened grants (reads cross-user email via the definer): no public execute;
-- the in-body gate enforces eligibility. Mirrors list_impersonation_personas.
revoke execute on function public.resolve_impersonation_persona(public.membership_role) from public;
grant  execute on function public.resolve_impersonation_persona(public.membership_role) to authenticated;

-- ── A3. Idempotent coherence asserts ─────────────────────────────────────────
-- Derive the canonical (centre, subject) space from teacher1's own teacher
-- membership — never hardcode the English subject uuid. If teacher1 has no teacher
-- membership, raise a LOUD notice and skip the rest (do not guess a space).
do $$
declare
  v_school  uuid;
  v_subject uuid;
begin
  select sm.school_id, sm.subject_id
    into v_school, v_subject
  from public.subject_membership sm
  where sm.profile_id = '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'
    and sm.role = 'teacher'::public.membership_role
  limit 1;

  if v_school is null then
    raise notice '[0039] teacher1 (4d8be40e-…) has no teacher subject_membership; skipping A3 coordinator-membership + class-board coherence. Seed the teacher persona first, then re-run.';
    return;
  end if;

  -- Coordinator membership (load-bearing fix): coordinator1 must have a
  -- COORDINATOR-role membership in teacher1's space, or the coordinator view never
  -- renders coordinator chrome. Insert if absent; if a membership already exists in
  -- that space with the wrong role, correct it to 'coordinator'.
  insert into public.subject_membership (profile_id, school_id, subject_id, role)
  values (
    'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33',
    v_school,
    v_subject,
    'coordinator'::public.membership_role
  )
  on conflict (profile_id, school_id, subject_id)
    do update set role = 'coordinator'::public.membership_role;

  -- Teacher classes (best-effort board population): attach teacher1 to the Year 1
  -- and Year 2 ACTIVE classes in the space. Guarded — inserts nothing if those
  -- classes don't exist, so there is no FK risk. NOTE: classes.group_label was
  -- removed in 0018, so there is no 'A' group to bind to; the active partial-unique
  -- index means `year in (1,2)` selects at most one class per year.
  insert into public.class_teachers (class_id, teacher_id)
  select c.id, '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'
  from public.classes c
  where c.school_id  = v_school
    and c.subject_id = v_subject
    and c.year in (1, 2)
    and c.archived_at is null
  on conflict (class_id, teacher_id) do nothing;
end $$;

-- ── A4. Retire the dead picker RPC ───────────────────────────────────────────
-- Phase 0 confirmed the only callers (listImpersonationPersonas wrapper →
-- getImpersonationState ×2 + the swap route) are all migrated to the toggle in
-- this branch, so nothing references this after the app changes land. The
-- `is_test_persona` column and the persona rows themselves are kept — only the
-- enumeration function retires.
drop function if exists public.list_impersonation_personas();
