-- 20260803150000_context_doc_original_storage_path.sql
--
-- Branch 2b — retain the ORIGINAL uploaded bytes for AI-instruction context docs
-- (#6). The `ai_context_doc_version.original_storage_path` column and the
-- `source-documents` bucket already exist (Branch 2a). This migration ONLY changes
-- the two atomic write RPCs so the create/replace routes can persist the path the
-- version row now carries.
--
-- ⚠️ BREAKING — apply AT DEPLOY TIME, not before. Both functions are DROPPED by
-- their current signatures and recreated with one extra parameter. There is no
-- overlap window: the currently-deployed routes call the OLD 6-arg / 3-arg forms,
-- which cease to exist the instant this runs, and the new routes call the NEW
-- 7-arg / 4-arg forms, which do not exist until it runs. (Unlike Branch 2a's
-- purely additive column, neither side is safe across the swap.)
--
-- CREATE OR REPLACE is deliberately NOT used: it cannot change a signature and
-- would leave BOTH arities live, letting call resolution silently pick the old one
-- and write null paths. DROP by explicit signature (never CASCADE) forces a clean
-- swap; if a dependency blocks the drop, this migration fails loudly.
--
-- The new parameter has NO DEFAULT on purpose — a missed call site must fail loudly
-- rather than silently retain nothing.
--
-- Bodies below are byte-identical to the live definitions (dumped via
-- pg_get_functiondef — the authoritative source, since the migration tree has
-- duplicate 0066s), except for the new parameter and its two insert positions.
-- Everything else is preserved: the is_admin() guard + 42501 errcode, the
-- document-exists check, the deactivate-then-insert ordering, SET search_path,
-- SECURITY DEFINER, return types.
--
-- GRANTS: `authenticated` only (+ the RLS/admin gate inside each body). `anon` is
-- deliberately EXCLUDED — branch S1 (revoke-anon-secdef-execute) is sweeping anon
-- off SECURITY DEFINER functions project-wide, and recreating these two must not
-- reopen that hole. `public` and `anon` are revoked explicitly.
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL editor.

-- ── Clean swap: drop the old signatures (never CASCADE) ──────────────────────────
drop function public.create_ai_context_doc(
  public.ai_context_layer, uuid, public.ai_context_tool, text, text, text
);
drop function public.replace_ai_context_doc(uuid, text, text);

-- ── create_ai_context_doc(...) → new doc id (now with original_storage_path) ──────
create function public.create_ai_context_doc(
  p_layer                public.ai_context_layer,
  p_subject_id           uuid,
  p_tool                 public.ai_context_tool,
  p_name                 text,
  p_body_md              text,
  p_original_filename    text,
  p_original_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.ai_context_doc (layer, subject_id, tool, name)
  values (p_layer, p_subject_id, p_tool, p_name)
  returning id into v_doc_id;
  insert into public.ai_context_doc_version (doc_id, version, body_md, original_filename, original_storage_path, is_active)
  values (v_doc_id, 1, p_body_md, p_original_filename, p_original_storage_path, true);
  return v_doc_id;
end;
$function$;

-- ── replace_ai_context_doc(...) → new version number (now with original_storage_path)
create function public.replace_ai_context_doc(
  p_doc_id                uuid,
  p_body_md               text,
  p_original_filename     text,
  p_original_storage_path text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  insert into public.ai_context_doc_version (doc_id, version, body_md, original_filename, original_storage_path, is_active)
  values (p_doc_id, v_next, p_body_md, p_original_filename, p_original_storage_path, true);
  return v_next;
end;
$function$;

-- ── Privileges on the NEW signatures (anon excluded, per S1) ──────────────────────
revoke execute on function public.create_ai_context_doc(
  public.ai_context_layer, uuid, public.ai_context_tool, text, text, text, text
) from public;
revoke execute on function public.create_ai_context_doc(
  public.ai_context_layer, uuid, public.ai_context_tool, text, text, text, text
) from anon;
grant execute on function public.create_ai_context_doc(
  public.ai_context_layer, uuid, public.ai_context_tool, text, text, text, text
) to authenticated;

revoke execute on function public.replace_ai_context_doc(uuid, text, text, text) from public;
revoke execute on function public.replace_ai_context_doc(uuid, text, text, text) from anon;
grant  execute on function public.replace_ai_context_doc(uuid, text, text, text) to authenticated;

-- ── Ledger (going-forward convention; see 20260803093441) ────────────────────────
insert into applied_migration (filename, note)
values ('20260803150000_context_doc_original_storage_path.sql', null)
on conflict (filename) do nothing;
