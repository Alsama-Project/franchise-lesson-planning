-- 20261001090000_profiles_self_update_columns.sql
--
-- Signed-in users may update only their own name on `profiles`. The row-level policy
-- `profiles_update_own` (0006) decides WHICH row; this grant decides WHICH columns.
-- Role, impersonation and test-persona flags change only through the admin functions
-- (set_user_admin, set_user_access, set_user_impersonation …), which are SECURITY
-- DEFINER and so unaffected by these grants.
--
-- Client writes to profiles in the app today: full_name only
-- (src/app/auth/callback/route.ts, src/lib/actions/onboarding.ts).
--
-- Rollback: `grant update on table public.profiles to authenticated;`

revoke update on table public.profiles from authenticated, anon;
grant update (full_name) on table public.profiles to authenticated;

insert into applied_migration (filename, note)
values ('20261001090000_profiles_self_update_columns.sql', null)
on conflict (filename) do nothing;
