-- 20261001140000_is_admin_deactivation.sql
--
-- Restores the deactivation check in is_admin(). 0033 added it, but the live database
-- has the older definition (found by comparing a schema dump on 2026-09-30; most likely
-- an older, re-runnable migration was applied again later and replaced it). Without it,
-- a deactivated admin keeps admin rights in every policy and function that calls
-- is_admin(). The app now also trusts only is_admin() for admin checks (src/lib/role.ts).
--
-- Same body as 0033. Idempotent.
--
-- Rollback (restores the pre-fix live definition):
--   create or replace function public.is_admin() returns boolean language sql stable
--   security definer set search_path = public as $$
--     select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
--   $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (not public.is_deactivated()) and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

insert into applied_migration (filename, note)
values ('20261001140000_is_admin_deactivation.sql', 'restores 0033 check missing on live')
on conflict (filename) do nothing;
