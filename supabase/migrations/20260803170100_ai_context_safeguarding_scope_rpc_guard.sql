-- 20260803170100_ai_context_safeguarding_scope_rpc_guard.sql
--
-- FILE 2 OF 3 — RUN ALONE, SECOND, IN ITS OWN EXECUTION, AFTER File 1 has COMMITTED.
-- This file USES the 'safeguarding' enum value (File 1), so it must not share a
-- transaction with the ALTER TYPE that added it — hence three separate executions.
--
-- Contents:
--   1. Amend the ai_context_doc_scope CHECK to admit layer = 'safeguarding'.
--   2. NEW get_active_safeguarding_doc(tool) — the security-definer read the
--      composer uses (the ai_context_doc tables are admin-only under RLS, so a
--      teacher reaches the row only through a definer RPC, exactly as for the
--      steerable stack).
--   3. get_active_context_stack is INTENTIONALLY NOT TOUCHED — see the note in §3.
--   4. A BEFORE UPDATE trigger blocking the archive of the last active safeguarding
--      doc for a tool.
--
-- Security posture matches 0063/0066 and the S1 anon revoke (20260803160000):
-- SECURITY DEFINER, pinned search_path = public, granted to authenticated, revoked
-- from public and anon.
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL editor.
-- CC never applies migrations.


-- ── 1. Scope CHECK: admit layer = 'safeguarding' (tool required, no subject) ──────
-- A CHECK cannot be altered in place, so drop and recreate. The recreated predicate
-- restates the existing 0063 disjuncts UNCHANGED and adds the safeguarding case
-- (tool NOT NULL, subject_id NULL — a safeguarding doc is per-tool, all-subjects).
--
-- NEEDS LIVE CONFIRMATION: this assumes the LIVE constraint matches the 0063
-- definition. Before running, confirm the current predicate (the migration tree is
-- known to drift from live). If live has extra clauses, merge them in rather than
-- letting this recreate clobber them.
alter table public.ai_context_doc drop constraint if exists ai_context_doc_scope;
alter table public.ai_context_doc add constraint ai_context_doc_scope check (
  (layer in ('org','academic') and subject_id is null and tool is null)
  or (layer = 'subject' and subject_id is not null and tool is null)
  or (layer = 'tool' and tool is not null)
  or (layer = 'safeguarding' and tool is not null and subject_id is null)
);


-- ── 2. get_active_safeguarding_doc(tool) → active safeguarding body_md, or NULL ───
-- Returns the active version's body for the (non-archived) safeguarding doc of a
-- tool. Composed SEPARATELY from get_active_context_stack (§3) at floor position, so
-- safeguarding never enters that RPC's layer_rank/sort_order/created_at ordering.
-- Ordered + limited defensively in case more than one safeguarding doc ever exists
-- for a tool (the seed creates exactly one); the archive guard in §4 keeps at least
-- one active. NULL when there is none — the composer logs and uses the code fallback.
create or replace function public.get_active_safeguarding_doc(
  p_tool public.ai_context_tool
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select v.body_md
  from ai_context_doc d
  join ai_context_doc_version v
    on v.doc_id = d.id and v.is_active
  where d.layer = 'safeguarding'
    and d.tool = p_tool
    and d.subject_id is null
    and d.is_archived = false
  order by d.sort_order, d.created_at
  limit 1;
$$;

revoke all     on function public.get_active_safeguarding_doc(public.ai_context_tool) from public;
revoke execute on function public.get_active_safeguarding_doc(public.ai_context_tool) from anon;
grant  execute on function public.get_active_safeguarding_doc(public.ai_context_tool) to authenticated;


-- ── 3. get_active_context_stack is NOT amended — safeguarding is excluded by ──────
-- construction, so there is nothing to change here.
--
-- The stack RPC's WHERE clause matches only:
--     d.layer in ('org','academic')
--  OR (d.layer = 'subject' and d.subject_id = p_subject_id)
--  OR (d.layer = 'tool'    and d.tool = p_tool and (d.subject_id is null or ... ))
-- A layer = 'safeguarding' row satisfies none of those disjuncts, so the RPC already
-- never returns it — and its layer_rank CASE has no 'safeguarding' arm either.
--
-- Adding an explicit `d.layer <> 'safeguarding'` guard would be behaviourally
-- redundant while forcing a full rewrite of a live SECURITY DEFINER function that all
-- of the AI composition paths depend on — a function whose body the migration tree
-- (duplicate 0066_* files) cannot be trusted to reproduce. Redundant clause, real
-- clobber risk: the wrong trade. So this migration leaves get_active_context_stack
-- untouched.
--
-- The future-broadening case (someone later widens that WHERE clause) is caught in
-- CODE, not SQL: composeContextStack drops any safeguarding row the RPC returns from
-- the ladder and logs it at error level (src/lib/ai/context-stack.ts), so safeguarding
-- can never double-compose into the steerable layers.


-- ── 4. Guard: never archive the LAST active safeguarding doc for a tool ───────────
-- Safeguarding must be replaceable but never archivable-to-nothing. A trigger (not a
-- route check) catches every path to that state, now and in future. Fires only when
-- an update flips a safeguarding doc from active to archived; if no OTHER active
-- safeguarding doc remains for the same tool, it raises 42501. SECURITY INVOKER
-- (default): only admins can UPDATE ai_context_doc (0063 RLS), and the admin policy
-- shows them every row, so the "last one" count is complete.
create or replace function public.guard_safeguarding_not_last()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.layer = 'safeguarding' and old.is_archived = false and new.is_archived = true then
    if not exists (
      select 1
      from public.ai_context_doc d
      where d.layer = 'safeguarding'
        and d.tool is not distinct from old.tool
        and d.is_archived = false
        and d.id <> old.id
    ) then
      raise exception 'Cannot archive the last active safeguarding document for this tool'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_context_doc_guard_safeguarding on public.ai_context_doc;
create trigger ai_context_doc_guard_safeguarding
  before update on public.ai_context_doc
  for each row
  execute function public.guard_safeguarding_not_last();


-- ── Ledger (going-forward convention; see 20260803093441) ────────────────────────
-- Records File 1 (which could not record itself — bare ALTER TYPE only) and File 2.
insert into applied_migration (filename, note)
values
  ('20260803170000_ai_context_layer_add_safeguarding.sql', null),
  ('20260803170100_ai_context_safeguarding_scope_rpc_guard.sql', null)
on conflict (filename) do nothing;
