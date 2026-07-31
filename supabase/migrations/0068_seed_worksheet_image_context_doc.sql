-- 0068_seed_worksheet_image_context_doc.sql
--
-- Seed the layer-4 (tool) PLACEHOLDER instructions for the worksheet-image
-- generator. House-style-only guidance, explicitly marked as a placeholder pending
-- real authoring by Connie and Kadria. The hard limits (safeguarding red lines,
-- illustration style, context) are NOT here — they are the FLOOR, held in code
-- (src/lib/ai/image-floor.ts) and un-overridable by any uploaded doc. No rule about
-- how the brief is worded lives here either — brief authoring is a separate
-- workstream's concern.
--
-- DEPENDS ON 0067: this references the enum value 'worksheet_image', which 0067
-- adds. 0067 MUST be applied AND its transaction COMMITTED before this file runs —
-- otherwise Postgres raises: unsafe use of new value "worksheet_image". Apply 0067
-- first, then this.
--
-- Mirrors the insert pattern of 0064/0065 exactly: resolve an owner (earliest admin,
-- else earliest auth user), insert one ai_context_doc, then its active
-- ai_context_doc_version (version 1, is_active = true). Idempotent via a name guard.
--
-- sort_order = -100 so a future uploaded doc (sort_order 0) composes AFTER it and
-- wins on conflict — matching how 0065's migrated docs defer to Connie's/Kadria's
-- uploads.
--
-- PROVENANCE: authored here, applied BY HAND in the Supabase SQL editor by the
-- operator (George). Prose is dollar-quoted with $doc$ so apostrophes paste cleanly.

do $mig$
declare
  v_doc_id   uuid;
  v_uploader uuid;
begin
  if exists (
    select 1 from public.ai_context_doc
     where layer = 'tool' and tool = 'worksheet_image' and subject_id is null
       and name = 'Worksheet image style (placeholder — pending Connie & Kadria)'
  ) then
    return;
  end if;

  -- No human uploader for placeholder prose: attribute to the earliest admin, then
  -- the earliest auth user (created_by / uploaded_by are NOT NULL).
  v_uploader := coalesce(
    (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1),
    (select u.id from auth.users u order by u.created_at limit 1)
  );
  if v_uploader is null then
    raise exception '0068: no user found to own the seeded context doc';
  end if;

  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  values ('tool', null, 'worksheet_image', 'Worksheet image style (placeholder — pending Connie & Kadria)', -100, v_uploader)
  returning id into v_doc_id;

  insert into public.ai_context_doc_version
    (doc_id, version, body_md, original_filename, uploaded_by, is_active)
  values (v_doc_id, 1, $doc$PLACEHOLDER — house style for worksheet images, pending review by Connie and Kadria. Replace this document once the real guidance is authored.

These worksheets are photocopied in black and white. Favour strong, clean outlines and high contrast. Avoid fine grey tone, gradients, and large dark fills — on a photocopier they ghost, bleed, or turn to mud.

Keep each image to a single clear subject on a plain, uncluttered background. Nothing decorative should compete with the task the student is doing.$doc$, null, v_uploader, true);
end $mig$;
