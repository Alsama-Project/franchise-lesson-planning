-- 0040_coordinator_subject_backfill.sql
--
-- Role-first access model, migration 2 of 2: the data backfill + finalisation.
-- ⚠️ CORE AUTH. Requires 0039. Apply immediately after 0039 so existing
-- coordinators are represented in `coordinator_subject` when the role-first modal
-- goes live.
--
-- This is written DATA-DRIVEN — it operates on whatever legacy rows exist rather
-- than hardcoding ids, so it is correct for any live reconciliation counts and is
-- non-destructive to teacher data. Documented rules:
--
--   1. Backfill — every DISTINCT (profile, subject) that has a legacy
--      role='coordinator' subject_membership row becomes a coordinator_subject row.
--      A coordinator who held only SOME schools is promoted to all-schools: that IS
--      the new semantic. Widens reach only; destroys nothing.
--   2. Remove the legacy role='coordinator' subject_membership rows — they are now
--      fully represented in coordinator_subject.
--   3. Admins hold no spaces — strip every subject_membership AND coordinator_subject
--      row from admin profiles (runs AFTER the backfill, so an admin who had a legacy
--      coordinator row is cleared from both tables).
--   4. Mixed-role users (both teacher and coordinator legacy rows) — their coordinator
--      subjects migrate (rule 1); their leftover TEACHER rows are LEFT INTACT
--      (non-destructive). They derive as coordinator in the modal, and a later admin
--      save (setUserAccess) reconciles them to a single role. No teacher data is
--      destroyed here.
--   5. Non-cartesian teachers are NOT touched (accepted; cartesian expansion only
--      happens on a deliberate modal save).
--   6. Finalise — with the legacy coordinator rows gone, drop the transitional legacy
--      branch from is_coordinator_of_subject and from list_users_admin so
--      coordinator_subject is the SINGLE source of truth. (is_member_of_subject keeps
--      its subject_membership branch — that is the permanent TEACHER check, not a
--      legacy coordinator branch — and shares_subject_space never had a legacy
--      coordinator branch, so both are already final and are left untouched.)
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (ON CONFLICT DO NOTHING / idempotent deletes / CREATE OR REPLACE):
-- safe to re-run.

-- ── 1. Backfill coordinator_subject from legacy coordinator rows ──────────────
insert into public.coordinator_subject (profile_id, subject_id)
select distinct sm.profile_id, sm.subject_id
from public.subject_membership sm
where sm.role = 'coordinator'
on conflict (profile_id, subject_id) do nothing;

-- ── 2. Remove the now-migrated legacy coordinator rows ───────────────────────
delete from public.subject_membership where role = 'coordinator';

-- ── 3. Admins hold no spaces in either model ─────────────────────────────────
delete from public.subject_membership sm
using public.profiles p
where p.id = sm.profile_id and p.role = 'admin';

delete from public.coordinator_subject cs
using public.profiles p
where p.id = cs.profile_id and p.role = 'admin';

-- ── 4. Finalise is_coordinator_of_subject — coordinator_subject only ─────────
-- Legacy per-school subject_membership branch removed. Deactivation guard, signature
-- (p_school kept for caller compatibility, now unused), volatility, and search_path
-- unchanged.
create or replace function public.is_coordinator_of_subject(p_school uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (not public.is_deactivated()) and exists (
    select 1 from public.coordinator_subject
    where profile_id = auth.uid()
      and subject_id = p_subject
  );
$$;

-- ── 5. Finalise list_users_admin — coordinator entries from coordinator_subject ─
-- Same signature and admin hard-gate as 0039; only the coordinator subquery is
-- simplified (the legacy subject_membership UNION branch is dropped now that those
-- rows are gone). Teacher spaces are unchanged.
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
    coalesce(p.can_impersonate, false)     as can_impersonate,
    coalesce(
      (
        select jsonb_agg(sp order by subject_name nulls last, role_ord, centre_name nulls last)
        from (
          -- Teacher spaces: one per (school, subject) membership row.
          select
            jsonb_build_object(
              'membership_id', sm.id,
              'school_id',     sm.school_id,
              'subject_id',    sm.subject_id,
              'subject',       subj.name,
              'role',          sm.role,
              'centre',        s.name
            )               as sp,
            subj.name        as subject_name,
            sm.role::text    as role_ord,
            s.name           as centre_name
          from public.subject_membership sm
          join public.subjects subj on subj.id = sm.subject_id
          join public.schools  s    on s.id    = sm.school_id
          where sm.profile_id = u.id
            and sm.role = 'teacher'

          union all

          -- Coordinator subjects: school-agnostic, from coordinator_subject only.
          select
            jsonb_build_object(
              'membership_id', null,
              'school_id',     null,
              'subject_id',    cs.subject_id,
              'subject',       subj.name,
              'role',          'coordinator',
              'centre',        null
            )                as sp,
            subj.name        as subject_name,
            'coordinator'    as role_ord,
            null::text       as centre_name
          from public.coordinator_subject cs
          join public.subjects subj on subj.id = cs.subject_id
          where cs.profile_id = u.id
        ) sp_rows
      ),
      '[]'::jsonb
    )                                      as spaces
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by p.full_name nulls last, u.email;
end;
$$;

revoke execute on function public.list_users_admin() from public;
grant  execute on function public.list_users_admin() to authenticated;
