-- 20260803190000_drop_safeguarding_docs_and_rpc.sql
--
-- Reverses the safeguarding-as-DB-layer work (20260803180100 / 20260803180200).
-- Safeguarding is no longer a separate editable layer: it becomes ordinary content
-- inside Connie's uploaded tool docs (layers 1-4), and the code composer no longer
-- reads or composes a safeguarding block at all (it now fails closed on an empty
-- stack instead of substituting one). So the trigger, the reader RPC, and the three
-- seeded safeguarding docs all come out.
--
-- ORDER (single execution, top to bottom):
--   1. Drop the archive-guard trigger, then its function.
--   2. Drop the get_active_safeguarding_doc reader RPC.
--   3. Delete the three safeguarding docs; their versions cascade
--      (ai_context_doc_version.doc_id → on delete cascade, 0063).
--
-- The `safeguarding` value on the ai_context_layer enum is LEFT IN PLACE: Postgres
-- makes removing an enum value awkward, and an unused value is harmless. The scope
-- CHECK amended by 20260803180100 is also left as-is (it merely permits a shape no
-- row now uses).
--
-- Idempotent: DROP ... IF EXISTS and a WHERE-scoped DELETE make a re-run a no-op,
-- and a fresh/migration-only environment (where the docs were never seeded) deletes
-- zero rows — the correct state there.
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL editor.
-- CC never applies migrations.

-- ── 1. Archive-guard trigger + function ──────────────────────────────────────────
drop trigger if exists ai_context_doc_guard_safeguarding on public.ai_context_doc;
drop function if exists public.guard_safeguarding_not_last();

-- ── 2. Safeguarding reader RPC ───────────────────────────────────────────────────
drop function if exists public.get_active_safeguarding_doc(public.ai_context_tool);

-- ── 3. Delete the seeded safeguarding docs (versions cascade) ────────────────────
delete from public.ai_context_doc where layer = 'safeguarding';

-- ── Ledger (going-forward convention; see 20260803093441) ────────────────────────
insert into applied_migration (filename, note)
values ('20260803190000_drop_safeguarding_docs_and_rpc.sql', null)
on conflict (filename) do nothing;
