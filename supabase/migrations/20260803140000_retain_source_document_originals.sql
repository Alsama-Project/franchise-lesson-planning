-- 20260803140000_retain_source_document_originals.sql
--
-- Branch 2a — retain the ORIGINAL uploaded bytes for admin-uploaded documents, so
-- a download can return the byte-identical file (with its true filename) instead
-- of only the derived text Branch 1 ships. Going forward only; nothing is
-- backfilled (there is no original to recover for pre-existing rows).
--
-- Two parts:
--   1. A NEW private storage bucket, `source-documents`, for the originals. It is
--      SEPARATE from `resources` on purpose: `resources` is org-wide readable
--      (0008: `select ... using (bucket_id = 'resources')` for every authenticated
--      user), whereas these source files are admin-only, matching the admin-only
--      RLS on the tables that reference them. Its policies are admin-gated, NOT the
--      org-wide shape.
--   2. A nullable `original_storage_path text` on the four tables whose uploads we
--      retain: ai_resource_guide (#7), smartt_objective_guide (#8),
--      curriculum_sync_run (#9 — one file per run, so the path lives on the run,
--      not the version), and ai_context_doc_version (#6). #6's HANDLER/RPC change
--      ships as Branch 2b; the column is added here so 2b carries no column DDL.
--
-- is_admin() ALREADY excludes deactivated users (0033 redefined it as
-- `(not is_deactivated()) and role = 'admin'`), so the storage policies need no
-- separate `not is_deactivated()` clause — the gate is is_admin() alone.
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL editor.
-- CC never applies migrations. Every statement is guarded, so re-running is safe.

-- ── 1. Private, admin-only bucket for the originals ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('source-documents', 'source-documents', false)
on conflict (id) do nothing;

-- Admin-only across every command. Mirrors the FOUR-policy structure of the
-- `resources` policies (0008/0033) but replaces the org-wide SELECT and the
-- owner/coordinator predicates with is_admin(). No object in this bucket is
-- readable by a non-admin.
drop policy if exists "source_documents_select_admin" on storage.objects;
create policy "source_documents_select_admin"
  on storage.objects for select to authenticated
  using (bucket_id = 'source-documents' and public.is_admin());

drop policy if exists "source_documents_insert_admin" on storage.objects;
create policy "source_documents_insert_admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'source-documents' and public.is_admin());

drop policy if exists "source_documents_update_admin" on storage.objects;
create policy "source_documents_update_admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'source-documents' and public.is_admin())
  with check (bucket_id = 'source-documents' and public.is_admin());

drop policy if exists "source_documents_delete_admin" on storage.objects;
create policy "source_documents_delete_admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'source-documents' and public.is_admin());

-- ── 2. original_storage_path on the four upload tables ───────────────────────────
-- Nullable, no default, no backfill. Null = no retained original → the download
-- falls back to Branch 1's derived text (guides/context docs) or renders no control
-- (curriculum). n8n curriculum imports always leave this null (no session user).
alter table public.ai_resource_guide
  add column if not exists original_storage_path text;

alter table public.smartt_objective_guide
  add column if not exists original_storage_path text;

alter table public.curriculum_sync_run
  add column if not exists original_storage_path text;

alter table public.ai_context_doc_version
  add column if not exists original_storage_path text;

-- ── Ledger (going-forward convention; see 20260803093441) ────────────────────────
insert into applied_migration (filename, note)
values ('20260803140000_retain_source_document_originals.sql', null)
on conflict (filename) do nothing;
