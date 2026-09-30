-- 20261001130000_ai_usage_quota.sql
--
-- Per-user daily allowances for the AI features. Each AI route calls
-- take_ai_quota(feature, limit) just before it calls a model: it counts the caller's
-- uses of that feature since midnight (UTC) and, if they are under the limit, records
-- one more use and returns true; otherwise it returns false and the route refuses.
-- The limits live in the app (src/lib/ai/ai-limits.ts, overridable per feature with
-- AI_DAILY_LIMIT_<FEATURE>), so they can change without a migration.
--
-- ai_usage also gives M6 / AI-01 a record of use per feature. Users can read their own
-- rows; nobody writes them except through take_ai_quota.
--
-- Rollback:
--   drop function if exists public.take_ai_quota(text, int);
--   drop table if exists public.ai_usage;
--   delete from applied_migration where filename = '20261001130000_ai_usage_quota.sql';

create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  feature    text not null check (length(feature) between 1 and 64),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_feature_time_idx
  on public.ai_usage (user_id, feature, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

revoke insert, update, delete on public.ai_usage from authenticated, anon;

create or replace function public.take_ai_quota(p_feature text, p_daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_used int;
begin
  if v_uid is null or public.is_deactivated() then
    return false;
  end if;
  -- One caller at a time per (user, feature), so parallel requests can't overshoot.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_feature, 0));
  select count(*) into v_used
    from public.ai_usage
   where user_id = v_uid
     and feature = p_feature
     and created_at >= date_trunc('day', now());
  if v_used >= p_daily_limit then
    return false;
  end if;
  insert into public.ai_usage (user_id, feature) values (v_uid, p_feature);
  return true;
end;
$$;

revoke execute on function public.take_ai_quota(text, int) from public, anon;
grant  execute on function public.take_ai_quota(text, int) to authenticated;

insert into applied_migration (filename, note)
values ('20261001130000_ai_usage_quota.sql', null)
on conflict (filename) do nothing;
