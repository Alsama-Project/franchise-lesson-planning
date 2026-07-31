-- 0065_seed_context_stack.sql
-- Seed the layered context stack (0063) with the pedagogical prose that was
-- LIVE in production system prompts and has now been lifted out of code by the
-- composer cutover (branch: claude/ai-context-composer).
--
-- WHAT IS AND IS NOT SEEDED
-- Only content that was in a live production prompt today moves here:
--   * L1 org      — the "WHO THE STUDENTS ARE" framing + the cultural-defaults
--                   clause from generate-resource's role/safety text.
--   * L4 resgen   — BASE_OUTPUT_CONTRACT's "mirror the request" + "keep it tight".
--   * L4 smartt   — SMARTT_FLOOR's "one or two suggestions to tighten".
-- NOT seeded: the DEFAULT_RESOURCE_GUIDE / DEFAULT_SMARTT_GUIDE fallback prose —
-- those constants were the never-fired fallback path (ai_resource_guide and
-- smartt_objective_guide each already hold a row, backfilled to L4 by 0064), so
-- they are dead and are deleted in code, not migrated.
-- NOT seeded: layers 2 (academic) and 3 (subject). Empty is correct and intended.
-- The safeguarding red lines, the output/marker contract, and the language guard
-- do NOT live here — they are the FLOOR, held in code (src/lib/ai/floor.ts).
--
-- ORDERING vs 0064's backfilled uploads
-- 0064 inserted Connie's and Kadria's uploaded guides as L4 documents at
-- sort_order = 0. The two seeded L4 documents below get sort_order = -100 so they
-- compose BEFORE the uploaded guides; since later documents win on conflict, the
-- admin uploads keep the last word — preserving the pre-cutover behaviour where
-- the uploaded guide was the final steering the model saw.
--
-- Docs are named "… (migrated from code)" so an admin can recognise and retire
-- them once the equivalent guidance has been re-authored as a proper upload.
--
-- NOTE ON PROVENANCE: authored here, applied BY HAND in the Supabase SQL editor
-- by the operator (George), 0065 FIRST then merge. Idempotent guards make a
-- re-run insert nothing a second time. Prose is dollar-quoted with $doc$ so
-- apostrophes and any $$ inside paste cleanly.

-- ── L1 org: Alsama student context ──────────────────────────────────────────
do $mig$
declare
  v_doc_id   uuid;
  v_uploader uuid;
begin
  if exists (
    select 1 from public.ai_context_doc
     where layer = 'org' and name = 'Alsama student context (migrated from code)'
  ) then
    return;
  end if;

  -- No human uploader for code-migrated prose: attribute to the earliest admin,
  -- then the earliest auth user (created_by / uploaded_by are NOT NULL).
  v_uploader := coalesce(
    (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1),
    (select u.id from auth.users u order by u.created_at limit 1)
  );
  if v_uploader is null then
    raise exception '0065: no user found to own the seeded context docs';
  end if;

  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  values ('org', null, null, 'Alsama student context (migrated from code)', 0, v_uploader)
  returning id into v_doc_id;

  insert into public.ai_context_doc_version
    (doc_id, version, body_md, original_filename, uploaded_by, is_active)
  values (v_doc_id, 1, $doc$WHO THE STUDENTS ARE:
- Adolescent learners aged 12-18 living in refugee camps in Beirut (Shatila, Bourj al-Barajneh) and in Homs, Syria. Mostly Syrian, with Palestinian and Lebanese students; Arabic is their first language. Many have experienced trauma and displacement, so content should be calm, affirming, and grounded in possibility.

CULTURAL DEFAULTS:
- Do not use Western cultural references as defaults (e.g. Christmas, Halloween, American/British pop culture) unless the teacher explicitly asks.$doc$, null, v_uploader, true);
end $mig$;

-- ── L4 tool: resource_generator instructions ────────────────────────────────
do $mig$
declare
  v_doc_id   uuid;
  v_uploader uuid;
begin
  if exists (
    select 1 from public.ai_context_doc
     where layer = 'tool' and tool = 'resource_generator' and subject_id is null
       and name = 'Resource generator instructions (migrated from code)'
  ) then
    return;
  end if;

  v_uploader := coalesce(
    (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1),
    (select u.id from auth.users u order by u.created_at limit 1)
  );
  if v_uploader is null then
    raise exception '0065: no user found to own the seeded context docs';
  end if;

  -- sort_order = -100: composes BEFORE Connie's uploaded guide (0064, sort_order 0)
  -- so the upload wins on conflict.
  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  values ('tool', null, 'resource_generator', 'Resource generator instructions (migrated from code)', -100, v_uploader)
  returning id into v_doc_id;

  insert into public.ai_context_doc_version
    (doc_id, version, body_md, original_filename, uploaded_by, is_active)
  values (v_doc_id, 1, $doc$- Mirror the teacher's requested resource type, topic, level, and length exactly. If they ask for a crossword about places in the city, produce that — not a generic vocabulary sheet.
- Keep it tight. Default to one focused resource, not a multi-part packet, unless the teacher asks for more.$doc$, null, v_uploader, true);
end $mig$;

-- ── L4 tool: smartt_checker instructions ────────────────────────────────────
do $mig$
declare
  v_doc_id   uuid;
  v_uploader uuid;
begin
  if exists (
    select 1 from public.ai_context_doc
     where layer = 'tool' and tool = 'smartt_checker' and subject_id is null
       and name = 'Objective checker instructions (migrated from code)'
  ) then
    return;
  end if;

  v_uploader := coalesce(
    (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1),
    (select u.id from auth.users u order by u.created_at limit 1)
  );
  if v_uploader is null then
    raise exception '0065: no user found to own the seeded context docs';
  end if;

  -- sort_order = -100: composes BEFORE Kadria's uploaded guide (0064, sort_order 0)
  -- so the upload wins on conflict.
  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  values ('tool', null, 'smartt_checker', 'Objective checker instructions (migrated from code)', -100, v_uploader)
  returning id into v_doc_id;

  insert into public.ai_context_doc_version
    (doc_id, version, body_md, original_filename, uploaded_by, is_active)
  values (v_doc_id, 1, $doc$Offer one or two overall suggestions to tighten the objective.$doc$, null, v_uploader, true);
end $mig$;
