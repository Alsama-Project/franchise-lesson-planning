-- 0064_context_stack_backfill.sql
-- Wave A, step 2: move the two live uploaded guides into the layered context
-- stack (0063), and replace the two legacy read functions with thin shims over
-- get_active_context_stack().
--
-- WHY: 0063 introduces ai_context_doc / ai_context_doc_version and
-- get_active_context_stack(tool, subject_id). The two existing guides —
-- ai_resource_guide (Connie's resource-generator steering) and
-- smartt_objective_guide (Kadria's objective-checker steering) — must move into
-- the stack as layer-4 ('tool') documents so nothing is lost, and the old read
-- path must keep behaving EXACTLY as before until the composer cutover lands.
--
-- SCOPE GUARDRAIL: the shims below return ONLY their own tool's layer-4
-- documents — never layers 1-3. The full ladder is switched on at cutover, in a
-- branch George can review, not as a silent side effect of applying this
-- migration. Both call sites (src/lib/ai/resource-guide.ts,
-- src/lib/ai/smartt-guide.ts) must behave identically before and after 0064.
--
-- The source tables' uploaded_by is nullable, but ai_context_doc.created_by and
-- ai_context_doc_version.uploaded_by are NOT NULL. A source row that predates
-- uploader capture may carry a null uploaded_by, so we fall back to the earliest
-- admin profile, and failing that the earliest auth user — either way a
-- guaranteed-non-null, sensible owner. (auth.uid() is null under a manual
-- SQL-editor apply, so the column defaults cannot be relied on here.)
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is authored
-- here but applied BY HAND in the Supabase SQL editor by the operator (George).
-- It is committed idempotently so the schema stays the locked source of truth in
-- repo and a local `supabase db reset` reproduces it. Every statement is guarded,
-- so re-running is safe.

-- ── backfill: ai_resource_guide → layer 'tool' / resource_generator ──────────
do $$
declare
  v_src      public.ai_resource_guide%rowtype;
  v_doc_id   uuid;
  v_uploader uuid;
begin
  -- Active guide = newest source row (mirrors get_active_resource_guide's old body).
  select * into v_src
    from public.ai_resource_guide
   order by created_at desc
   limit 1;

  -- Source empty → insert nothing.
  if v_src.id is null then
    return;
  end if;

  -- Idempotent: skip entirely if this backfill doc already exists.
  if exists (
    select 1 from public.ai_context_doc
     where layer = 'tool'
       and tool = 'resource_generator'
       and subject_id is null
       and name = 'Resource generation guide (Connie)'
  ) then
    return;
  end if;

  v_uploader := coalesce(
    v_src.uploaded_by,
    (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1),
    (select u.id from auth.users u order by u.created_at limit 1)
  );

  insert into public.ai_context_doc (layer, tool, subject_id, name, sort_order, created_by)
  values ('tool', 'resource_generator', null, 'Resource generation guide (Connie)', 0, v_uploader)
  returning id into v_doc_id;

  insert into public.ai_context_doc_version
    (doc_id, version, body_md, original_filename, uploaded_by, created_at, is_active)
  values
    (v_doc_id, 1, v_src.content, v_src.original_filename, v_uploader, v_src.created_at, true);
end $$;

-- ── backfill: smartt_objective_guide → layer 'tool' / smartt_checker ─────────
do $$
declare
  v_src      public.smartt_objective_guide%rowtype;
  v_doc_id   uuid;
  v_uploader uuid;
begin
  select * into v_src
    from public.smartt_objective_guide
   order by created_at desc
   limit 1;

  if v_src.id is null then
    return;
  end if;

  if exists (
    select 1 from public.ai_context_doc
     where layer = 'tool'
       and tool = 'smartt_checker'
       and subject_id is null
       and name = 'SMARTT objective guide (Kadria)'
  ) then
    return;
  end if;

  v_uploader := coalesce(
    v_src.uploaded_by,
    (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1),
    (select u.id from auth.users u order by u.created_at limit 1)
  );

  insert into public.ai_context_doc (layer, tool, subject_id, name, sort_order, created_by)
  values ('tool', 'smartt_checker', null, 'SMARTT objective guide (Kadria)', 0, v_uploader)
  returning id into v_doc_id;

  insert into public.ai_context_doc_version
    (doc_id, version, body_md, original_filename, uploaded_by, created_at, is_active)
  values
    (v_doc_id, 1, v_src.content, v_src.original_filename, v_uploader, v_src.created_at, true);
end $$;

-- ── shims: legacy readers now compose ONLY their tool's layer-4 documents ─────
-- These preserve the EXACT signature + behaviour the current callers depend on:
-- a single text blob, or NULL when nothing is uploaded. They deliberately
-- restrict to layer = 'tool', so applying this migration cannot leak the wider
-- ladder (layers 1-3) into the live prompts before the composer cutover.
--
-- WITH ORDINALITY preserves get_active_context_stack's own ORDER BY
-- (layer_rank, then each doc's sort_order, then created_at); restricted to the
-- tool layer, that ordering is sort_order then created_at, exactly as specified.
-- Documents are joined by a blank line. string_agg returns NULL for no rows, so
-- an empty stack yields NULL — identical to the pre-0064 "no guide uploaded"
-- behaviour the TS helpers fall back on.

create or replace function public.get_active_resource_guide()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(s.body_md, E'\n\n' order by s.ord)
  from public.get_active_context_stack('resource_generator'::ai_context_tool, null::uuid)
       with ordinality as s(layer_rank, layer, doc_id, doc_name, version, body_md, ord)
  where s.layer = 'tool';
$$;

comment on function public.get_active_resource_guide() is
  'DEPRECATED shim over get_active_context_stack (resource_generator, layer=tool only). Remove once /api/generate-resource is cut over to the composer.';

grant execute on function public.get_active_resource_guide() to authenticated;

create or replace function public.get_active_smartt_guide()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(s.body_md, E'\n\n' order by s.ord)
  from public.get_active_context_stack('smartt_checker'::ai_context_tool, null::uuid)
       with ordinality as s(layer_rank, layer, doc_id, doc_name, version, body_md, ord)
  where s.layer = 'tool';
$$;

comment on function public.get_active_smartt_guide() is
  'DEPRECATED shim over get_active_context_stack (smartt_checker, layer=tool only). Remove once /api/check-objective is cut over to the composer.';

grant execute on function public.get_active_smartt_guide() to authenticated;
