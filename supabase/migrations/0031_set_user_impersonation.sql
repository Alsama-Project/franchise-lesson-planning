-- 0031_set_user_impersonation.sql
--
-- Admin-managed test-bar access. Lets an admin grant/revoke `can_impersonate`
-- (added in 0030 — who may USE the test bar) for an individual user from the
-- settings console, replacing the current per-user SQL UPDATE. Two pieces:
--
--   1. `set_user_impersonation(target_uid, enabled)` — the privilege-grant WRITE.
--      Setting the flag is a privilege grant, so it is admin-asserted IN THE
--      DEFINER (not merely hidden in the UI) and is structurally incapable of
--      touching any column but `can_impersonate` (mirrors the role='teacher'
--      hardcoding in complete_onboarding / the column scope of the persona work).
--   2. A redefinition of `admin_list_users()` (0023) to additionally return each
--      user's `can_impersonate` and global `role`. The console's Members roster
--      switches to this RPC so EVERY user is toggleable — including a tester the
--      admin shares no (centre, subject) space with, whom the RLS-bound direct
--      `profiles` read could never surface (the exact per-user-SQL case this
--      feature removes). The two extra columns come from the same `profiles` row
--      the function already LEFT JOINs; the is_admin() gate is unchanged.
--
-- Scope note: this migration governs `can_impersonate` ONLY. `is_test_persona`
-- (who may BE impersonated) stays seed-managed — a persona also needs a
-- dashboard-created auth user with the shared password, so a UI flag alone would
-- not produce a working persona. No function here reads or writes it.
--
-- NOTE ON PROVENANCE / APPLICATION: like 0012/0014/0023/0029/0030, CC never
-- applies migrations — George runs this in the Supabase SQL editor. Every
-- statement is guarded (DROP … IF EXISTS / CREATE OR REPLACE), so it is safe to
-- re-run. Idempotent.

-- ── admin_list_users (redefined) ─────────────────────────────────────────────
-- Faithful superset of the 0023 definition: same rows, same admin gate, same
-- membership aggregation — PLUS `can_impersonate` and `role`, so the Members tab
-- can render each user's test-bar state and treat real admins as implied-on
-- (eligibility is `can_impersonate` OR admin, so an admin's own flag is moot).
--
-- The return-table signature changes (two new columns), which Postgres cannot do
-- via CREATE OR REPLACE, so we DROP first. No DB object depends on this function
-- (it is called only from the app), so the drop is safe.
drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  user_id         uuid,
  full_name       text,
  email           text,
  role            public.user_role,
  can_impersonate boolean,
  memberships     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Hard admin gate: a non-admin must never read cross-user identity. Raise
  -- (privilege-not-granted) rather than silently return empty, so the caller can
  -- distinguish "not authorized" from "no users".
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    u.id                          as user_id,
    p.full_name                   as full_name,
    u.email::text                 as email,
    p.role                        as role,
    -- LEFT JOIN: a profile normally exists (handle_new_user), but never drop a
    -- user for a missing profile row — treat an absent flag as not-granted.
    coalesce(p.can_impersonate, false) as can_impersonate,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'membership_id', sm.id,
                   'school_id',     sm.school_id,
                   'school_name',   s.name,
                   'subject_id',    sm.subject_id,
                   'subject_name',  subj.name,
                   'role',          sm.role
                 )
                 order by s.name, subj.name
               )
        from public.subject_membership sm
        join public.schools  s    on s.id    = sm.school_id
        join public.subjects subj on subj.id = sm.subject_id
        where sm.profile_id = u.id
      ),
      '[]'::jsonb
    )                             as memberships
  from auth.users u
  -- LEFT JOIN: a user normally has a profiles row (handle_new_user), but never
  -- drop a user from the onboarding list just because their profile is missing.
  left join public.profiles p on p.id = u.id
  order by p.full_name nulls last, u.email;
end;
$$;

-- Tightened grants (cross-user PII): no public execute, admins only by gate.
revoke execute on function public.admin_list_users() from public;
grant  execute on function public.admin_list_users() to authenticated;

-- ── set_user_impersonation ───────────────────────────────────────────────────
-- Grant/revoke a single user's test-bar access. Admin-asserted for the CALLER;
-- a non-admin is denied (raise 42501) rather than silently no-op'd. The UPDATE
-- targets `can_impersonate` and NOTHING ELSE — the column is hardcoded in the SET
-- list, so this function is structurally incapable of altering `role`,
-- `is_test_persona`, `school_id`, or any other column, on any row (anti-escalation,
-- mirroring the role='teacher' hardcoding in complete_onboarding).
create or replace function public.set_user_impersonation(
  target_uid uuid,
  enabled    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Privilege grant: assert the CALLER is a real admin. Enforced here, not just
  -- in the UI, so hiding the control is never the only line of defence.
  if not public.is_admin() then
    raise exception 'Not authorized to set impersonation access'
      using errcode = '42501';
  end if;

  if target_uid is null then
    raise exception 'A target user is required';
  end if;

  -- Column scope is hardcoded: only `can_impersonate` is ever written.
  update public.profiles
    set can_impersonate = coalesce(enabled, false)
    where id = target_uid;
end;
$$;

revoke execute on function public.set_user_impersonation(uuid, boolean) from public;
grant  execute on function public.set_user_impersonation(uuid, boolean) to authenticated;
