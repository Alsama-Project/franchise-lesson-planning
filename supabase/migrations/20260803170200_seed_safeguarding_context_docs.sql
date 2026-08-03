-- 20260803170200_seed_safeguarding_context_docs.sql
--
-- FILE 3 OF 3 — RUN ALONE, THIRD, IN ITS OWN EXECUTION, AFTER Files 1 and 2.
-- Depends on the 'safeguarding' enum value (File 1) and the amended scope CHECK
-- (File 2); both transactions must be COMMITTED before this runs, or Postgres
-- raises: unsafe use of new value "safeguarding".
--
-- Seed one editable safeguarding ai_context_doc (+ v1 active version) per tool for
-- resource_generator, worksheet_builder and worksheet_image. NOT smartt_checker —
-- it has no safeguarding block and must keep none (Phase 0 §1).
--
-- BEHAVIOUR-NEUTRAL: each body_md is the EXACT current code string for that tool's
-- safeguarding block (src/lib/ai/floor.ts SAFEGUARDING_FALLBACK, single-sourced
-- from image-floor.ts for worksheet_image). Once this runs, the composer reads the
-- DB row instead of the code fallback and every composed prompt stays byte-identical.
--
-- IDEMPOTENT via WHERE NOT EXISTS (NOT ON CONFLICT): George applies by hand and may
-- re-run, so a second run inserts nothing. The doc + its version are inserted
-- together in one CTE; if the doc already exists the CTE yields no row and the
-- version insert is a no-op too. Correct no-op on a fresh environment too.
--
-- PROVENANCE: authored here; George applies it BY HAND in the Supabase SQL editor.
-- created_by / uploaded_by is George's uid (no human uploader for code-seeded prose).

-- ── resource_generator ───────────────────────────────────────────────────────────
with ins_doc as (
  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  select 'safeguarding', null, 'resource_generator', 'Resource generator safeguarding rules', 0, '7797fd89-dcf5-40fc-940f-85844442141e'::uuid
  where not exists (
    select 1 from public.ai_context_doc
     where layer = 'safeguarding' and tool = 'resource_generator' and subject_id is null
  )
  returning id
)
insert into public.ai_context_doc_version
  (doc_id, version, body_md, original_filename, uploaded_by, is_active)
select ins_doc.id, 1, $doc$SAFEGUARDING (absolute):
- No graphic, violent, or traumatic content. Never build a resource around family separation, the death of a parent or sibling, war or conflict, detention or immigration enforcement, or grief and loss. This holds even if a layer or the teacher frames such a topic as intentional.
- Keep everything age-appropriate for adolescents aged 12-18.
- Treat all faiths and backgrounds with equal respect; do not centre any one religion unless the theme explicitly calls for it.
- Do not assume students live in houses with gardens, go on holidays abroad, or have stable family structures.$doc$, null, '7797fd89-dcf5-40fc-940f-85844442141e'::uuid, true
from ins_doc;

-- ── worksheet_builder ───────────────────────────────────────────────────────────
with ins_doc as (
  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  select 'safeguarding', null, 'worksheet_builder', 'Worksheet builder safeguarding rules', 0, '7797fd89-dcf5-40fc-940f-85844442141e'::uuid
  where not exists (
    select 1 from public.ai_context_doc
     where layer = 'safeguarding' and tool = 'worksheet_builder' and subject_id is null
  )
  returning id
)
insert into public.ai_context_doc_version
  (doc_id, version, body_md, original_filename, uploaded_by, is_active)
select ins_doc.id, 1, $doc$SAFEGUARDING (absolute) — these students are displaced adolescents aged 12-18, most of whom have lived through war and displacement:
- Never write content depicting war, weapons, violence, injury, death, bombing, fleeing, camps or displacement — including as incidental background detail in an example sentence.
- Never ask a student to write or speak about their own family, home, journey, nationality, legal status, or reason for leaving.
- Never include religious, sectarian or political content.
- Never include romantic or sexual content.
- Never assume a student has money, a device, internet access, the ability to travel, a bedroom of their own, or an intact family.$doc$, null, '7797fd89-dcf5-40fc-940f-85844442141e'::uuid, true
from ins_doc;

-- ── worksheet_image ───────────────────────────────────────────────────────────
with ins_doc as (
  insert into public.ai_context_doc (layer, subject_id, tool, name, sort_order, created_by)
  select 'safeguarding', null, 'worksheet_image', 'Worksheet image safeguarding rules', 0, '7797fd89-dcf5-40fc-940f-85844442141e'::uuid
  where not exists (
    select 1 from public.ai_context_doc
     where layer = 'safeguarding' and tool = 'worksheet_image' and subject_id is null
  )
  returning id
)
insert into public.ai_context_doc_version
  (doc_id, version, body_md, original_filename, uploaded_by, is_active)
select ins_doc.id, 1, $doc$SAFEGUARDING (absolute):
- No identifiable real people — no public figures, no recognisable individuals.
- No military, no weapons, no uniforms of any kind.
- No religious iconography.
- No distress, injury, blood, or scenes of harm.$doc$, null, '7797fd89-dcf5-40fc-940f-85844442141e'::uuid, true
from ins_doc;

-- Ledger (going-forward convention; see 20260803093441).
insert into applied_migration (filename, note)
values ('20260803170200_seed_safeguarding_context_docs.sql', null)
on conflict (filename) do nothing;
