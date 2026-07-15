-- 0062_class_usage_counts.sql
--
-- Per-class usage counts for the admin Classes tab: how many active lesson plans
-- reference a class, and how many teachers are assigned to it. These drive the
-- tick-to-archive guard — unticking (archiving) a class that still has plans or
-- teachers attached must prompt an explicit confirm.
--
-- WHY A FUNCTION, AND WHY SECURITY DEFINER:
--   • Aggregated in Postgres (count() + group by), NOT by selecting rows and
--     counting in memory. A plain `select class_id from lesson_plans` is subject
--     to the PostgREST 1000-row cap and would silently undercount as plans grow —
--     the exact bug this replaces (see getConsoleClasses).
--   • teacher_count CANNOT be read with the caller's own privileges: class_teachers
--     is SELECT-own-only under RLS (class_teachers_select_own, 0006), so even an
--     admin sees only their OWN assignment. A security_invoker view would therefore
--     report at most 1 teacher per class. SECURITY DEFINER (with a pinned
--     search_path) lets the aggregate see every assignment, exactly as
--     admin_list_users / list_users_admin do for the roster. No service-role key is
--     involved — this is the codebase's standard controlled-read pattern.
--   • Hard-gated on is_admin(): the Classes tab is admin-only, and these counts are
--     org-wide, so a non-admin caller is refused (belt-and-braces with the
--     admin-gated data path). revoke from public + grant to authenticated matches
--     the convention for the other definer RPCs.
--
-- active_plan_count counts lesson_plans with deleted_at is null (soft-delete aware,
-- matching the tab's existing "active plan" definition). teacher_count counts
-- class_teachers rows. Both are LEFT JOINed so a class with zero of either still
-- appears with a 0.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (CREATE OR REPLACE): safe to re-run.

create or replace function public.class_usage_counts()
returns table (
  class_id uuid,
  active_plan_count integer,
  teacher_count integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
    select
      c.id as class_id,
      coalesce(p.cnt, 0)::integer as active_plan_count,
      coalesce(t.cnt, 0)::integer as teacher_count
    from public.classes c
    left join (
      select lp.class_id, count(*) as cnt
      from public.lesson_plans lp
      where lp.deleted_at is null
      group by lp.class_id
    ) p on p.class_id = c.id
    left join (
      select ct.class_id, count(*) as cnt
      from public.class_teachers ct
      group by ct.class_id
    ) t on t.class_id = c.id;
end;
$$;

revoke execute on function public.class_usage_counts() from public;
grant  execute on function public.class_usage_counts() to authenticated;
