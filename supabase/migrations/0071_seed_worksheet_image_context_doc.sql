-- 0071_seed_worksheet_image_context_doc.sql
--
-- Seed the layer-4 (tool) PLACEHOLDER instructions for the worksheet-image
-- generator. House-style-only guidance, explicitly marked as a placeholder pending
-- real authoring by Connie and Kadria. The hard limits (safeguarding red lines,
-- illustration style, context) are NOT here — they are the FLOOR, held in code
-- (src/lib/ai/image-floor.ts) and un-overridable by any uploaded doc. No rule about
-- how the brief is worded lives here either — brief authoring is a separate
-- workstream's concern.
--
-- SUPERSEDES the merged-but-unapplied 0068_seed_worksheet_image_context_doc.sql
-- (renamed alongside 0070/0072). Do NOT apply the old file.
--
-- DEPENDS ON 0070: this references the enum value 'worksheet_image', which 0070
-- adds. 0070 MUST be applied AND its transaction COMMITTED before this file runs —
-- otherwise Postgres raises: unsafe use of new value "worksheet_image". Apply 0070
-- first, then this.
--
-- IDEMPOTENT via INSERT ... WHERE NOT EXISTS (NOT ON CONFLICT, and NOT relying on a
-- unique index firing): George applies by hand and may re-run this file, so a second
-- run must insert nothing. The doc and its version are inserted together in one
-- CTE statement — if the doc already exists the CTE yields no row and the version
-- insert is a no-op too.
--
-- sort_order = -100 so a future uploaded doc (sort_order 0) composes AFTER it and
-- wins on conflict — matching how 0065's migrated docs defer to Connie's/Kadria's
-- uploads.
--
-- PROVENANCE: authored here, applied BY HAND in the Supabase SQL editor by the
-- operator (George). Prose is dollar-quoted with $doc$ so apostrophes paste cleanly.

with uploader as (
  -- No human uploader for placeholder prose: earliest admin, else earliest auth
  -- user (created_by / uploaded_by are NOT NULL — a null here fails loudly).
  select coalesce(
    (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1),
    (select u.id from auth.users u order by u.created_at limit 1)
  ) as id
),
ins_doc as (
  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  select 'tool', null, 'worksheet_image',
         'Worksheet image style (placeholder — pending Connie & Kadria)', -100, uploader.id
  from uploader
  where not exists (
    select 1 from public.ai_context_doc
     where layer = 'tool' and tool = 'worksheet_image' and subject_id is null
       and name = 'Worksheet image style (placeholder — pending Connie & Kadria)'
  )
  returning id
)
insert into public.ai_context_doc_version
  (doc_id, version, body_md, original_filename, uploaded_by, is_active)
select ins_doc.id, 1, $doc$PLACEHOLDER — house style for worksheet images, pending review by Connie and Kadria. Replace this document once the real guidance is authored.

These worksheets are photocopied in black and white. Favour strong, clean outlines and high contrast. Avoid fine grey tone, gradients, and large dark fills — on a photocopier they ghost, bleed, or turn to mud.

Keep each image to a single clear subject on a plain, uncluttered background. Nothing decorative should compete with the task the student is doing.$doc$, null, (select id from uploader), true
from ins_doc;
