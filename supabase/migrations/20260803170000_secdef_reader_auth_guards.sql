-- 20260803170000_secdef_reader_auth_guards.sql
--
-- SECURITY (follow-up to 20260803160000_revoke_anon_secdef_execute.sql / "S1").
--
-- S1 revoked EXECUTE from `anon` and PUBLIC on every SECURITY DEFINER function
-- in `public`. `authenticated` was intentionally left untouched, so any signed-in
-- teacher can still call these definer functions directly at /rest/v1/rpc/<fn>.
-- Four of them have NO in-body authorization check. This migration closes that
-- with the minimum change per function:
--
--   • purge_trashed_lesson_plans(interval) — a destructive, UNWIRED maintenance
--     helper (0048). Privilege is the right control: revoke EXECUTE from
--     `authenticated`. A body guard would be WRONG — an is_admin() check returns
--     false for `service_role`, breaking the cron/scheduled use it was written
--     for. No user-facing code calls it (verified: the only repo references are
--     its 0048 definition, documented "UNWIRED … there is no cron infra
--     in-repo", and an S1 comment).
--
--   • get_active_resource_guide(), get_active_smartt_guide() — admin-only guide
--     readers, but each is a thin shim whose entire body is
--     `select … from get_active_context_stack(…)`. They have ZERO `.rpc()` call
--     sites in the app (deprecated shims; see 0064). Guarding the inner
--     get_active_context_stack (below) protects them transitively: the inner
--     RAISE propagates unhandled through the shim, and auth.uid() reads the
--     request JWT claim (a session GUC) which SECURITY DEFINER nesting never
--     changes — it only changes the executing role — so the guard evaluates the
--     same caller at any depth. Rewriting these two deprecated functions to
--     plpgsql would buy nothing they don't already inherit, so they get a
--     privilege-only revoke instead: a second layer, independent of the inner
--     guard. (`permission denied` is itself SQLSTATE 42501, so a blocked caller
--     still sees 42501.)
--
--   • get_active_context_stack(ai_context_tool, uuid) — reads the full AI
--     instruction stack and IS on user-facing paths (Aya: worksheet + objective
--     generation), always through the RLS-honouring server client with a live
--     user session — never a service-role client, never a session-less path. It
--     gets the actual in-body guard (auth.uid()/is_deactivated()), matching the
--     42501 convention (see create_ai_context_doc in 0066). This is the ONE
--     function converted, and the ONLY body change in the branch.
--
-- SCOPE: these four functions only. Deliberately NOT touched, pending a separate
-- drift branch: resolve_schedule(jsonb) and rls_auto_enable() — both live in
-- production, present in no migration file, purpose undocumented. The six RLS
-- helper predicates S1 granted to `authenticated` are also left exactly as-is.
--
-- LANGUAGE sql → plpgsql (get_active_context_stack only). A `LANGUAGE sql`
-- function has no BEGIN block and cannot conditionally RAISE, so hosting the
-- guard requires plpgsql. Nothing else changes: the query body is preserved
-- verbatim, and STABLE / SECURITY DEFINER / `set search_path` are kept exactly.
-- Parameters are `p_`-prefixed (unambiguous against every column in the body),
-- so no positional-argument rewrite and no #variable_conflict pragma.
--
-- ONE deliberate hardening in the body: `order by layer_rank` → `order by 1`.
-- `layer_rank` is the sole bare identifier left, and it collides with a
-- RETURNS TABLE output name that becomes a plpgsql variable. It resolves to the
-- select alias (verified on PG 16), but if a different server version or
-- variable_conflict setting ever bound it to the variable, ORDER BY would sort
-- by a constant — layers silently out of sequence, no error, Aya reading a
-- scrambled stack. `layer_rank` is the first output column, so `order by 1` is
-- exactly equivalent and cannot be captured by variable resolution under any
-- version or setting.
--
-- Trade recorded (not an oversight): `LANGUAGE sql` functions can be inlined by
-- the planner; plpgsql cannot. This is a small lookup over small tables, so the
-- cost is immaterial. The guard's value outweighs it.
--
-- CREATE OR REPLACE is correct: no signature changes, so no DROP — and
-- CREATE OR REPLACE retains the existing ACL even across a language change, so
-- S1's `anon`/PUBLIC revokes survive. No revoke is re-issued for the readers.
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL
-- editor. This session never applies migrations. Every statement is idempotent
-- (REVOKE of a privilege not held is a no-op; CREATE OR REPLACE re-runs cleanly).


-- ── Part A — privilege-only changes (no body change) ─────────────────────────────
-- Remove `authenticated`'s EXECUTE on the destructive maintenance helper and the
-- two deprecated, zero-call-site guide shims. `service_role`/`postgres` grants
-- are left alone; `anon`/PUBLIC were already revoked by S1.
revoke execute on function public.purge_trashed_lesson_plans(interval) from authenticated;
revoke execute on function public.get_active_resource_guide()          from authenticated;
revoke execute on function public.get_active_smartt_guide()            from authenticated;


-- ── Part B — get_active_context_stack: in-body auth guard ────────────────────────
-- The guard is the first statement in the begin block. The query body is the
-- live definition verbatim, with the single `order by layer_rank` → `order by 1`
-- hardening described above.
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
  order by 1, d.sort_order, d.created_at;
end;
$function$;


-- ── Ledger (going-forward convention; see 20260803093441) ────────────────────────
insert into applied_migration (filename, note)
values ('20260803170000_secdef_reader_auth_guards.sql', null)
on conflict (filename) do nothing;
