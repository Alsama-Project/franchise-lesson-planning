-- 20260803160000_revoke_anon_secdef_execute.sql
--
-- SECURITY: revoke EXECUTE from `anon` and from PUBLIC on every SECURITY DEFINER
-- function in schema `public`. A SECURITY DEFINER function runs as its owner and
-- bypasses RLS; `anon` is PostgREST's unauthenticated role, reachable at
-- /rest/v1/rpc/<fn> with only the anon key (which is public by construction and
-- inlined into the client bundle as NEXT_PUBLIC_SUPABASE_ANON_KEY). No definer
-- function in `public` should be callable unauthenticated.
--
-- SCOPE: privileges ONLY. This migration changes no function body. Several of
-- these functions have no in-body authorization guard (e.g.
-- purge_trashed_lesson_plans(interval), which is destructive) — adding those
-- guards is a separate branch (S2) and is deliberately NOT done here. Grants to
-- `authenticated`, `service_role` and `postgres` are left untouched.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CONVENTION FOR ALL FUTURE MIGRATIONS (this is the actual defect):
--
--   • A SECURITY DEFINER function in `public` is granted to `authenticated`
--     and/or `service_role` ONLY. `anon` is NEVER granted. PUBLIC is ALWAYS
--     revoked.
--
--   • There is no stray `grant … to anon` line to stop copying — the repo never
--     contained one. Supabase's platform-level DEFAULT PRIVILEGES grant EXECUTE
--     to anon, authenticated AND service_role on *every* function created in
--     `public`. So a newly-created SECURITY DEFINER function inherits `anon`
--     EXECUTE automatically, silently, at creation time. The only defence is to
--     revoke it explicitly — per function, every time — or to strip that default
--     inheritance once (see the ALTER DEFAULT PRIVILEGES statement at the end).
--
--   Without one of those, the next function created reopens this hole.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL
-- editor. CC never applies migrations. Every statement is idempotent — re-running
-- is a no-op, not an error.


-- ── 1. Preserve `authenticated` on the RLS-helper definers (insurance) ───────────
-- Six SECURITY DEFINER predicates are called by `authenticated` at RLS-policy
-- evaluation time (and three are also invoked directly as RPCs). In the LIVE
-- database each already carries an explicit `authenticated=X` grantee entry
-- alongside PUBLIC, so the blanket revoke below leaves `authenticated` untouched
-- and these grants are REDUNDANT against current state. They are issued anyway as
-- insurance: if this file is ever applied to a database whose default privileges
-- differ (so `authenticated` reached these only via PUBLIC), the revoke below
-- would otherwise strip its sole access path and break RLS app-wide. `grant` of
-- an already-held privilege is a no-op. This is NOT fixing a live gap.
grant execute on function public.is_admin()                              to authenticated;
grant execute on function public.is_member_of_subject(uuid, uuid)        to authenticated;
grant execute on function public.is_coordinator_of_subject(uuid, uuid)   to authenticated;
grant execute on function public.shares_subject_space(uuid)              to authenticated;
grant execute on function public.is_member_of_plan(uuid)                 to authenticated;
grant execute on function public.is_coordinator_of_plan(uuid)            to authenticated;


-- ── 2. Blanket revoke of `anon` and PUBLIC on every definer in `public` ──────────
-- Iterates pg_proc for prosecdef functions in `public` and revokes EXECUTE from
-- `anon` and from PUBLIC on each. The signature is built with oid::regprocedure
-- so overloads (identical name, different argument types) are handled correctly.
-- REVOKE of a privilege that is not held is a no-op, so the whole block is
-- idempotent and safe to re-run.
do $$
declare
  fn_sig text;
begin
  for fn_sig in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from anon;', fn_sig);
    execute format('revoke execute on function %s from public;', fn_sig);
  end loop;
end
$$;


-- ── 3. Diagnostic — NOT part of the change ───────────────────────────────────────
-- Run this by hand after applying. It returns every SECURITY DEFINER function in
-- `public` that `anon` can still EXECUTE. Expected result after this migration:
-- ZERO ROWS.
--
--   select p.oid::regprocedure as still_anon_executable
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.prosecdef
--     and has_function_privilege('anon', p.oid, 'EXECUTE')
--   order by 1;


-- ── 4. Stop future functions inheriting `anon` at creation ───────────────────────
-- ⚠ PLATFORM-LEVEL BLAST RADIUS — this is the ONE statement here that reaches
-- beyond the functions that exist today. It rewrites the DEFAULT PRIVILEGES for
-- functions in `public`, so functions created *later* (by the role that runs
-- this) no longer inherit `anon` EXECUTE. It affects only FUTURE objects, and
-- only those created by the running role — it grants/revokes nothing on any
-- existing function. Without it, the blanket revoke above is a point-in-time fix
-- and the next created function silently reopens the hole (see the convention
-- note at the top). Strike this single statement if that platform-level default
-- change is unwanted; the rest of the migration stands on its own.
alter default privileges in schema public revoke execute on functions from anon;


-- ── Ledger (going-forward convention; see 20260803093441) ────────────────────────
insert into applied_migration (filename, note)
values ('20260803160000_revoke_anon_secdef_execute.sql', null)
on conflict (filename) do nothing;
