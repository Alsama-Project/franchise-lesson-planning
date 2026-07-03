-- 0037_list_users_admin_space_ids.sql
--
-- Extend `list_users_admin()` (0034) so each `spaces` object also carries the
-- `school_id`, `subject_id` and `membership_id` — the ids the redesigned admin
-- "Edit access" modal needs to tick/untick a specific (centre, subject) checkbox
-- and persist by identity, rather than fragile name-matching. This mirrors the
-- richer `memberships` shape `admin_list_users()` (0023) already returns.
--
-- Nothing else changes: same columns, same admin hard-gate (`is_admin()`, raises
-- 42501 for non-admins / deactivated admins post-0033), same definer convention
-- (security definer, STABLE, pinned `set search_path = public`, revoke from public
-- + grant to authenticated). The added keys are additive — the existing
-- subject / role / centre keys stay, so any current consumer is unaffected.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (CREATE OR REPLACE): safe to re-run.

create or replace function public.list_users_admin()
returns table (
  user_id        uuid,
  full_name      text,
  email          text,
  is_admin       boolean,
  is_deactivated boolean,
  spaces         jsonb
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
