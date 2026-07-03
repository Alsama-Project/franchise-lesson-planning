-- 0038_list_users_admin_can_impersonate.sql
--
-- Extend `list_users_admin()` (0034, spaces-enriched in 0037) so each row also
-- carries `can_impersonate` — the `profiles` flag that gates who may USE the
-- test-impersonation bar. The global "Edit access" modal (Users tab) needs it to
-- render and toggle a per-user Impersonation control, the same flag the per-space
-- Members roster already surfaces via `admin_list_users()` (added there in 0036).
--
-- This mirrors, one-for-one, how 0036 added `can_impersonate` to
-- `admin_list_users()`: the value comes from the same `profiles` row this function
-- already LEFT JOINs, `coalesce`d to false so a missing profile row reads as
-- not-granted rather than dropping the user. The WRITE side is unchanged — an admin
-- flips the flag through the existing `set_user_impersonation()` definer RPC (0036);
-- this migration touches the READ shape only.
--
-- Everything else is identical to 0037: same columns, same admin hard-gate
-- (`is_admin()`, raises 42501 for non-admins / deactivated admins post-0033), same
-- definer convention (security definer, STABLE, pinned `set search_path = public`,
-- revoke from public + grant to authenticated), same `spaces` aggregation with its
-- id keys. The added `can_impersonate` column is additive — existing consumers that
-- ignore it are unaffected.
--
-- The return-table signature changes (a new column), which Postgres cannot do via
-- CREATE OR REPLACE, so we DROP first. No DB object depends on this function (it is
-- called only from the app), so the drop is safe.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (DROP … IF EXISTS + CREATE OR REPLACE): safe to re-run.

drop function if exists public.list_users_admin();

create or replace function public.list_users_admin()
returns table (
  user_id         uuid,
  full_name       text,
  email           text,
  is_admin        boolean,
  is_deactivated  boolean,
  can_impersonate boolean,
  spaces          jsonb
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
    u.id                                   as user_id,
    p.full_name                            as full_name,
    u.email::text                          as email,
    coalesce(p.role = 'admin', false)      as is_admin,
    exists (
      select 1 from public.user_deactivation ud
      where ud.user_id = u.id
    )                                      as is_deactivated,
    -- LEFT JOIN: a profile normally exists (handle_new_user), but never drop a
    -- user for a missing profile row — treat an absent flag as not-granted.
    coalesce(p.can_impersonate, false)     as can_impersonate,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'membership_id', sm.id,
                   'school_id',     sm.school_id,
                   'subject_id',    sm.subject_id,
                   'subject',       subj.name,
                   'role',          sm.role,
                   'centre',        s.name
                 )
                 order by subj.name, s.name
               )
        from public.subject_membership sm
        join public.subjects subj on subj.id = sm.subject_id
        join public.schools  s    on s.id    = sm.school_id
        where sm.profile_id = u.id
      ),
      '[]'::jsonb
    )                                      as spaces
  from auth.users u
  -- LEFT JOIN: a user normally has a profiles row (handle_new_user), but never
  -- drop a user from the list just because their profile is missing.
  left join public.profiles p on p.id = u.id
  order by p.full_name nulls last, u.email;
end;
$$;

revoke execute on function public.list_users_admin() from public;
grant  execute on function public.list_users_admin() to authenticated;
