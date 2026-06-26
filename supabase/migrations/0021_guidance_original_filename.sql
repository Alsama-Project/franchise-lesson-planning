-- 0021_guidance_original_filename.sql
-- Capture the original uploaded filename for the two admin guidance documents
-- (the AI resource guide, 0016; the SMARTT objective guide, 0020). The admin
-- console no longer renders a text preview of a guide version — it shows the
-- original filename and the upload date instead — so we persist the filename the
-- admin uploaded alongside the converted `content`.
--
-- The stored `content` is untouched: the security-definer read functions
-- (`get_active_resource_guide()` / `get_active_smartt_guide()`) still serve the
-- exact same text to the AI backend. This adds display metadata only.
--
-- Nullable, no default: every row is immutable, so existing versions keep a NULL
-- filename forever (they predate capture). The console display falls back to the
-- upload date alone when the filename is NULL — there is no broken/empty label.
-- New uploads populate it going forward (see the two route handlers).
--
-- NOTE ON PROVENANCE: like 0010/0014/0015/0016/0020, this DDL is also applied by
-- hand in the Supabase SQL editor by the operator (George applies it to the live
-- database). It is committed here, idempotently, so the schema stays the locked
-- source of truth in-repo and a local `supabase db reset` reproduces it. Every
-- statement is guarded, so re-running is safe.

alter table public.ai_resource_guide
  add column if not exists original_filename text;

alter table public.smartt_objective_guide
  add column if not exists original_filename text;
