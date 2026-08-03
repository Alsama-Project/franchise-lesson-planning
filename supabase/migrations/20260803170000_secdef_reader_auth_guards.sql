-- 20260803170000_secdef_reader_auth_guards.sql
--
-- SECURITY (follow-up to 20260803160000_revoke_anon_secdef_execute.sql / "S1").
--
-- S1 revoked EXECUTE from `anon` and PUBLIC on every SECURITY DEFINER function
-- in `public`. `authenticated` was intentionally left untouched, so any signed-in
-- teacher can still call these definer functions directly at /rest/v1/rpc/<fn>.
-- Four of them have NO in-body authorization check. This migration closes that:
--
--   • purge_trashed_lesson_plans(interval) — a destructive, UNWIRED maintenance
--     helper (0048). Privilege is the right control: revoke EXECUTE from
--     `authenticated`. A body guard would be WRONG here — an is_admin() check
--     returns false for `service_role`, which would break the cron/scheduled use
--     the function was written for. No user-facing code calls it (verified: the
--     only repo references are its 0048 definition, which documents it as
--     "UNWIRED … there is no cron infra in-repo", and an S1 comment).
--
--   • get_active_context_stack(ai_context_tool, uuid) — reads the full AI
--     instruction stack. get_active_resource_guide() / get_active_smartt_guide()
--     — read admin-only guide content (both are thin shims over the stack).
--     These ARE reached by user-facing code (Aya: worksheet + objective
--     generation), always through the RLS-honouring server client with a live
--     user session — never a service-role client, never a session-less path.
--     So an auth.uid()/is_deactivated() guard is safe for every legitimate
--     caller and blocks direct unauthorized RPC calls. The guard matches the
--     existing 42501 convention (see create_ai_context_doc in 0066).
--
-- SCOPE: these four functions only. Deliberately NOT touched, pending a separate
-- drift branch: resolve_schedule(jsonb) and rls_auto_enable() — both live in
-- production, present in no migration file, purpose undocumented. The six RLS
-- helper predicates S1 granted to `authenticated` are also left exactly as-is.
--
-- LANGUAGE sql → plpgsql (the three readers). Each reader is `LANGUAGE sql`,
-- which has no BEGIN block and cannot conditionally RAISE, so the guard requires
-- converting each to `LANGUAGE plpgsql`. Nothing else changes: the query body is
-- preserved verbatim (same joins, predicates, ordering), and STABLE / SECURITY
-- DEFINER / `set search_path` are kept exactly. Parameters are absent or
-- `p_`-prefixed (unambiguous against every column referenced in the body), so no
-- positional-argument rewrite and no #variable_conflict pragma are needed; the
-- RETURNS TABLE output column `layer_rank` referenced by `order by layer_rank`
-- resolves to the output column, not the new plpgsql variable (SQL92 ORDER BY
-- name resolution), verified to produce byte-identical rows AND row order.
--
-- Trade recorded (not an oversight): `LANGUAGE sql` functions can be inlined by
-- the planner; plpgsql cannot. These are small lookups over small tables, so the
-- cost is immaterial. The guard's value outweighs it.
--
-- CREATE OR REPLACE is correct: no signature changes, so no DROP — and
-- CREATE OR REPLACE retains the existing ACL even across a language change, so
-- S1's `anon`/PUBLIC revokes survive. No revoke is re-issued for the readers.
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL
-- editor. This session never applies migrations. Every statement is idempotent.


-- ── Part A — purge_trashed_lesson_plans(interval): privilege change only ──────────
-- Do NOT modify the body. Remove `authenticated`'s EXECUTE; leave `service_role`
-- and `postgres` alone. `anon`/PUBLIC were already revoked by S1. REVOKE of a
-- privilege not held is a no-op, so this is idempotent.
revoke execute on function public.purge_trashed_lesson_plans(interval) from authenticated;


-- ── Part B — the three readers: insert an auth guard, change nothing else ─────────
-- Guard (identical in all three), as the first statement in the begin block:
--   if auth.uid() is null or public.is_deactivated() then
--     raise exception 'Not authorized' using errcode = '42501';
--   end if;

create or replace function public.get_active_context_stack(p_tool ai_context_tool, p_subject_id uuid default null::uuid)
 returns table(layer_rank integer, layer ai_context_layer, doc_id uuid, doc_name text, version integer, body_md text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_deactivated() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    case d.layer
      when 'org'      then 1
      when 'academic' then 2
      when 'subject'  then 3
      when 'tool'     then 4
    end as layer_rank,
    d.layer,
    d.id,
    d.name,
    v.version,
    v.body_md
  from ai_context_doc d
  join ai_context_doc_version v
    on v.doc_id = d.id and v.is_active
  where d.is_archived = false
    and (
      d.layer in ('org','academic')
      or (d.layer = 'subject' and d.subject_id = p_subject_id)
      or (d.layer = 'tool'
          and d.tool = p_tool
          and (d.subject_id is null or d.subject_id = p_subject_id))
    )
  order by layer_rank, d.sort_order, d.created_at;
end;
$function$;

create or replace function public.get_active_resource_guide()
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_deactivated() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return (
    select string_agg(s.body_md, E'\n\n' order by s.ord)
    from public.get_active_context_stack('resource_generator'::ai_context_tool, null::uuid)
         with ordinality as s(layer_rank, layer, doc_id, doc_name, version, body_md, ord)
    where s.layer = 'tool'
  );
end;
$function$;

create or replace function public.get_active_smartt_guide()
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_deactivated() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return (
    select string_agg(s.body_md, E'\n\n' order by s.ord)
    from public.get_active_context_stack('smartt_checker'::ai_context_tool, null::uuid)
         with ordinality as s(layer_rank, layer, doc_id, doc_name, version, body_md, ord)
    where s.layer = 'tool'
  );
end;
$function$;


-- ── Ledger (going-forward convention; see 20260803093441) ────────────────────────
insert into applied_migration (filename, note)
values ('20260803170000_secdef_reader_auth_guards.sql', null)
on conflict (filename) do nothing;
