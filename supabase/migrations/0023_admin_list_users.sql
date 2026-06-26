-- 0023_admin_list_users.sql
--
-- Self-serve teacher onboarding: let an admin resolve a real person from a
-- searchable list and grant them a (centre, subject) — with no SQL and no UUIDs
-- typed by hand. This migration adds the ONE piece the app cannot do under RLS:
-- read the full user list, including brand-new teachers who have ZERO
-- subject_membership rows (the onboarding target).
--
-- Why an RPC is required:
--   • A teacher's email lives only in `auth.users`, which the browser / auth'd
--     client can never read.
--   • `profiles` RLS is own-row + co-member only (0006 + 0013), so an admin
--     literally cannot see a person they share no space with — exactly the
--     zero-membership newcomer. So the admin Members tab could never surface them.
--   • Admin WRITES already work: `sm_admin_write` (0012) is `FOR ALL` gated on
--     `is_admin()` with NO shared-space condition, so the existing client
--     upsert/delete grants/revokes membership for a zero-membership target fine.
--     The gap is purely the READ. Hence this migration adds a read function only.
--
-- Security: this function reads OTHER users' emails, so it is hard-gated on
-- `is_admin()` (raises for non-admins) and, unlike the repo's looser existing
-- definers, it `revoke execute ... from public` + `grant execute ... to
-- authenticated` — a deliberate tightening because the data is cross-user PII.
-- Follows the established definer convention otherwise: security definer, STABLE,
-- pinned `set search_path = public` (mirrors is_admin / get_active_resource_guide).
--
-- LOCKED contracts respected: `profiles` schema and `handle_new_user` are
-- untouched; no `profiles.email` is added. CC never applies migrations — George
-- runs this in the Supabase SQL editor. Idempotent (CREATE OR REPLACE): re-runnable.

-- ── admin_list_users ─────────────────────────────────────────────────────────
-- Returns every user (one row per auth.users row), with their display name, email,
-- and their current subject_membership rows aggregated to jsonb so the Members tab
-- can render current access as chips. Zero-membership users are INCLUDED with an
-- empty `[]` — they are the onboarding target the picker exists to surface.
create or replace function public.admin_list_users()
returns table (
  user_id    uuid,
  full_name  text,
  email      text,
  memberships jsonb
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
