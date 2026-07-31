-- 0067_ai_context_tool_worksheet_image.sql
--
-- Add 'worksheet_image' to the ai_context_tool enum (introduced in 0063), so the
-- worksheet-image generator is a first-class layer-4 tool in the AI context stack —
-- the same vocabulary the resource generator and SMARTT checker already use.
--
-- ALTER TYPE ... ADD VALUE ONLY. Nothing else may live in this file. Postgres
-- commits a new enum value but forbids USING it until the adding transaction has
-- ended, so any INSERT/SELECT that references 'worksheet_image' (see 0068) MUST run
-- in a separate, later transaction. A combined script fails in the Supabase SQL
-- editor with: unsafe use of new value "worksheet_image".
--
-- Idempotent: IF NOT EXISTS makes a re-run a no-op.
--
-- PROVENANCE: authored here, applied BY HAND in the Supabase SQL editor by the
-- operator (George), like the other numbered migrations. Committed so the schema
-- stays the locked source of truth in-repo and a local `supabase db reset`
-- reproduces it.

alter type public.ai_context_tool add value if not exists 'worksheet_image';
