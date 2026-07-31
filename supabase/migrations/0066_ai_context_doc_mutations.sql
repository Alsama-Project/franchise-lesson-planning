-- 0066_ai_context_doc_mutations.sql
--
-- Atomic write RPCs behind the admin "AI instructions" surface. The two-table
-- shape from 0063 (a `ai_context_doc` identity + its immutable
-- `ai_context_doc_version` history, exactly one active per doc) needs three
-- multi-statement mutations that MUST be atomic:
--
--   • create  — insert the doc AND its first version together, or neither;
--   • replace — deactivate the current version AND insert a new active one at
--               max(version)+1, in one transaction;
--   • restore — deactivate the current version AND reactivate an older one.
--
-- supabase-js has no client-side transaction, and the partial unique index
-- `ai_context_doc_version_one_active (doc_id) where is_active` rejects any moment
-- with two active versions — so an implementation that activated before it
-- deactivated would fail. These SECURITY DEFINER functions do the steps in the
-- one correct order inside a single statement-atomic body. Every one deactivates
-- BEFORE it activates.
--
-- Posture matches the 0035 user-admin RPCs: SECURITY DEFINER, pinned
-- `set search_path = public`, top-gated on `is_admin()` (RAISES 42501, never a
-- silent no-op), granted to `authenticated`, revoked from public. The admin-only
-- RLS on both tables (0063) is the backstop; the service-role key is never used.
-- `auth.uid()` still resolves to the CALLING admin inside a definer function, so
-- `created_by` / `uploaded_by` default to the real author.
--
-- Rename / re-order / archive are single-row updates and go through the RLS
-- client directly (the admin `for all` policy permits them) — no RPC needed.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (CREATE OR REPLACE): safe to re-run.

-- ── create_ai_context_doc(...) → new doc id ───────────────────────────────────
-- Insert a document and its first version (v1, active) in one transaction. The
-- `ai_context_doc_scope` CHECK (0063) still guards the (layer, subject_id, tool)
-- combination; the route pre-validates it to return a clean 400, and this is the
-- backstop.
create or replace function public.create_ai_context_doc(
  p_layer             public.ai_context_layer,
  p_subject_id        uuid,
  p_tool              public.ai_context_tool,
  p_name              text,
  p_body_md           text,
  p_original_filename text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  insert into public.ai_context_doc (layer, subject_id, tool, name)
  values (p_layer, p_subject_id, p_tool, p_name)
  returning id into v_doc_id;

  insert into public.ai_context_doc_version (doc_id, version, body_md, original_filename, is_active)
  values (v_doc_id, 1, p_body_md, p_original_filename, true);

  return v_doc_id;
end;
$$;

revoke execute on function public.create_ai_context_doc(
  public.ai_context_layer, uuid, public.ai_context_tool, text, text, text
) from public;
grant execute on function public.create_ai_context_doc(
  public.ai_context_layer, uuid, public.ai_context_tool, text, text, text
) to authenticated;

-- ── replace_ai_context_doc(...) → new version number ──────────────────────────
-- Add a new active version. Deactivate the current active one FIRST (or the
-- partial unique index would reject the insert), then insert at max(version)+1.
create or replace function public.replace_ai_context_doc(
  p_doc_id            uuid,
  p_body_md           text,
  p_original_filename text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.ai_context_doc where id = p_doc_id) then
    raise exception 'Document not found';
  end if;

  -- Deactivate the current active version before inserting the new one.
  update public.ai_context_doc_version
     set is_active = false
   where doc_id = p_doc_id and is_active;

  select coalesce(max(version), 0) + 1
    into v_next
    from public.ai_context_doc_version
   where doc_id = p_doc_id;

  insert into public.ai_context_doc_version (doc_id, version, body_md, original_filename, is_active)
  values (p_doc_id, v_next, p_body_md, p_original_filename, true);

  return v_next;
end;
$$;

revoke execute on function public.replace_ai_context_doc(uuid, text, text) from public;
grant  execute on function public.replace_ai_context_doc(uuid, text, text) to authenticated;

-- ── activate_ai_context_doc_version(...) → activated version number ───────────
-- Restore an existing version: flip `is_active` to a version that already exists
-- (no new row, so version numbers stay stable — "v2" always means the same text).
-- Deactivate the current active one first, for the same unique-index reason.
create or replace function public.activate_ai_context_doc_version(
  p_doc_id     uuid,
  p_version_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select version
    into v_version
    from public.ai_context_doc_version
   where id = p_version_id and doc_id = p_doc_id;

  if not found then
    raise exception 'Version not found';
  end if;

  update public.ai_context_doc_version
     set is_active = false
   where doc_id = p_doc_id and is_active;

  update public.ai_context_doc_version
     set is_active = true
   where id = p_version_id;

  return v_version;
end;
$$;

revoke execute on function public.activate_ai_context_doc_version(uuid, uuid) from public;
grant  execute on function public.activate_ai_context_doc_version(uuid, uuid) to authenticated;
